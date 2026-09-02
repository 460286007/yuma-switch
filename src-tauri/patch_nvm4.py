import io

p = 'src/commands/nodejs.rs'
s = io.open(p, encoding='utf-8', newline='').read()

def rep(old, new, tag, count=1):
    global s
    assert s.count(old) == count, "FAIL %s count=%d" % (tag, s.count(old))
    s = s.replace(old, new)
    print("ok", tag)

# ---------- A) 用户 PATH 追加助手（保持 REG_EXPAND_SZ 类型，reg add 写入） ----------
rep('''pub(crate) fn registry_path(key_args: &[&str]) -> Option<String> {''',
'''/// 向用户 PATH 追加条目（保持 REG_EXPAND_SZ 类型，用 reg add 写入，
/// 避免 .NET SetEnvironmentVariable 把类型改成 REG_SZ 破坏 %VAR% 展开）。
/// 已存在（原始或展开后包含）则跳过。
pub(crate) fn append_user_path_entries(entries: &[String]) -> Result<Vec<String>, String> {
    use std::collections::HashMap;

    let machine_key = concat!(
        r"HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session",
        r" Manager\\Environment"
    );
    let raw_user = registry_path(&[r"HKCU\\Environment", "/v", "Path"]).unwrap_or_default();
    let raw_machine =
        registry_path(&[machine_key, "/v", "Path"]).unwrap_or_default();

    // 展开 %VAR% 用于"已包含"判断
    let mut vars: HashMap<String, String> = std::env::vars()
        .map(|(k, v)| (k.to_uppercase(), v))
        .collect();
    for (k, v) in registry_environment_values(machine_key) {
        vars.insert(k, v);
    }
    for (k, v) in registry_environment_values(r"HKCU\\Environment") {
        vars.insert(k, v);
    }
    let expand = |input: &str| expand_percent_vars(input, &vars).to_uppercase();

    let haystack = format!("{};{}", expand(&raw_machine), expand(&raw_user));
    let mut to_add: Vec<String> = Vec::new();
    for entry in entries {
        if entry.trim().is_empty() {
            continue;
        }
        if haystack.contains(&entry.replace('/', "\\\\").to_uppercase()) {
            continue;
        }
        to_add.push(entry.clone());
    }
    if to_add.is_empty() {
        return Ok(Vec::new());
    }

    let combined = if raw_user.trim().is_empty() {
        to_add.join(";")
    } else {
        format!("{};{}", raw_user.trim_end_matches(';'), to_add.join(";"))
    };
    let out = command_no_window("reg")
        .args([
            "add",
            r"HKCU\\Environment",
            "/v",
            "Path",
            "/t",
            "REG_EXPAND_SZ",
            "/d",
            &combined,
            "/f",
        ])
        .output()
        .map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(format!(
            "写入用户 PATH 失败: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    Ok(to_add)
}

pub(crate) fn registry_path(key_args: &[&str]) -> Option<String> {''',
"user-path-helper")

# ---------- B) nvm_use：切换成功后把符号链接目录补进 PATH ----------
rep('''        // 用合并注册表后的 PATH 验证 node 命令可用性——
        // 新开终端的环境即按注册表 PATH 解析，这里能找到就代表新终端可用。
        let search_path = refreshed_search_path();''',
'''        // 切换后保证 node 符号链接目录在 PATH 中：
        // nvm 只更新符号链接，若 PATH 未包含该目录，CLI/新终端会找不到 node。
        {
            let vars = nvm_env_vars();
            let symlink = vars
                .get("NVM_SYMLINK")
                .cloned()
                .unwrap_or_else(|| r"C:\\Program Files\\nodejs".to_string());
            if let Err(e) = append_user_path_entries(&[symlink]) {
                log::warn!("把 node 目录写入用户 PATH 失败: {e}");
            }
        }

        // 用合并注册表后的 PATH 验证 node 命令可用性——
        // 新开终端的环境即按注册表 PATH 解析，这里能找到就代表新终端可用。
        let search_path = refreshed_search_path();''',
"nvm-use-path")

# ---------- C) ensure_nvm_env：改为系统级（提权一次写入 HKLM） ----------
rep('''        let mut actions: Vec<String> = Vec::new();
        let reg_add = |name: &str, value: &str| -> Result<(), String> {
            let out = command_no_window("reg")
                .args([
                    "add",
                    r"HKCU\\Environment",
                    "/v",
                    name,
                    "/t",
                    "REG_SZ",
                    "/d",
                    value,
                    "/f",
                ])
                .output()
                .map_err(|e| e.to_string())?;
            if out.status.success() {
                Ok(())
            } else {
                Err(format!(
                    "写入 {name} 失败: {}",
                    String::from_utf8_lossy(&out.stderr).trim()
                ))
            }
        };

        let machine_key = concat!(
            r"HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session",
            r" Manager\\Environment"
        );
        let has_machine_or_user = |name: &str| {
            registry_environment_values(machine_key)
                .iter()
                .chain(registry_environment_values(r"HKCU\\Environment").iter())
                .any(|(k, _)| k == name)
        };

        if !has_machine_or_user("NVM_HOME") {
            reg_add("NVM_HOME", &root)?;
            actions.push(format!("NVM_HOME = {root}"));
        }
        if !has_machine_or_user("NVM_SYMLINK") {
            reg_add("NVM_SYMLINK", &symlink)?;
            actions.push(format!("NVM_SYMLINK = {symlink}"));
        }

        // 用户 PATH 追加（用 .NET API 写，避免 setx 截断）
        let user_path = registry_path(&[r"HKCU\\Environment", "/v", "Path"])
            .unwrap_or_default();
        let machine_path_has = registry_path(&[machine_key, "/v", "Path"])
            .unwrap_or_default()
            .to_uppercase()
            .contains("NVM_HOME");
        if !machine_path_has
            && !user_path.to_uppercase().contains("NVM_HOME")
        {
            let appended = if user_path.trim().is_empty() {
                "%NVM_HOME%;%NVM_SYMLINK%".to_string()
            } else {
                format!(
                    "{};%NVM_HOME%;%NVM_SYMLINK%",
                    user_path.trim_end_matches(';')
                )
            };
            let script = format!(
                "[Environment]::SetEnvironmentVariable('Path', @'\\n{appended}\\n'@, 'User')"
            );
            let out = command_no_window("powershell")
                .args(["-NoProfile", "-Command", &script])
                .output()
                .map_err(|e| e.to_string())?;
            if !out.status.success() {
                return Err(format!(
                    "更新用户 PATH 失败: {}",
                    String::from_utf8_lossy(&out.stderr).trim()
                ));
            }
            actions.push("用户 PATH 已追加 %NVM_HOME%;%NVM_SYMLINK%".to_string());
        }''',
'''        // 直接写入系统级（HKLM）：需要一次 UAC 提权。
        // 用临时 .ps1 承载脚本，避免引号拼接出错。
        let machine_key = concat!(
            r"HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session",
            r" Manager\\Environment"
        );
        let machine_path_raw =
            registry_path(&[machine_key, "/v", "Path"]).unwrap_or_default();
        let machine_path_has = machine_path_raw.to_uppercase().contains("NVM_HOME");
        let has_machine_var = |name: &str| {
            registry_environment_values(machine_key)
                .iter()
                .any(|(k, _)| k == name)
        };

        let need_home = !has_machine_var("NVM_HOME");
        let need_symlink = !has_machine_var("NVM_SYMLINK");
        let need_path = !machine_path_has;
        if !need_home && !need_symlink && !need_path {
            return Ok(Vec::new());
        }

        let new_path = if need_path {
            if machine_path_raw.trim().is_empty() {
                "%NVM_HOME%;%NVM_SYMLINK%".to_string()
            } else {
                format!(
                    "{};%NVM_HOME%;%NVM_SYMLINK%",
                    machine_path_raw.trim_end_matches(';')
                )
            }
        } else {
            machine_path_raw
        };

        let script = format!(
            r#"$ErrorActionPreference = 'Stop'
$root = '{root}'
$symlink = '{symlink}'
$mk = 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment'
if ({need_home}) {{ [Environment]::SetEnvironmentVariable('NVM_HOME', $root, 'Machine') }}
if ({need_symlink}) {{ [Environment]::SetEnvironmentVariable('NVM_SYMLINK', $symlink, 'Machine') }}
if ({need_path}) {{
  reg add $mk /v Path /t REG_EXPAND_SZ /d @'
{new_path}
'@ /f | Out-Null
}}
"#
        );
        let ps1 = std::env::temp_dir().join("yuma_ensure_nvm_env.ps1");
        std::fs::write(&ps1, script).map_err(|e| format!("写入临时脚本失败: {e}"))?;

        // 以管理员运行（UAC 弹窗一次），-Wait 等待完成
        let elevated = command_no_window("powershell")
            .args([
                "-NoProfile",
                "-Command",
                &format!(
                    "Start-Process powershell -Verb RunAs -WindowStyle Hidden -Wait -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','{}'",
                    ps1.to_string_lossy()
                ),
            ])
            .output()
            .map_err(|e| e.to_string())?;
        let _ = std::fs::remove_file(&ps1);
        if !elevated.status.success() {
            return Err(format!(
                "系统级写入被取消或失败（需要管理员授权）: {}",
                String::from_utf8_lossy(&elevated.stderr).trim()
            ));
        }

        let mut actions: Vec<String> = Vec::new();
        if need_home {
            actions.push(format!("系统 NVM_HOME = {root}"));
        }
        if need_symlink {
            actions.push(format!("系统 NVM_SYMLINK = {symlink}"));
        }
        if need_path {
            actions.push("系统 PATH 已追加 %NVM_HOME%;%NVM_SYMLINK%".to_string());
        }''',
"machine-env")

io.open(p, 'w', encoding='utf-8', newline='').write(s)
print("ALL OK")
