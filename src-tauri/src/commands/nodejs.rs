//! Node.js 版本管理：检测本机版本、拉取可用版本列表、
//! 从官方/国内镜像下载安装包并启动安装器。
//!
//! 下载经 reqwest（走系统代理配置），进度通过 `node-download-progress`
//! 事件推送给前端；启动 MSI 安装器交给系统默认处理器（会走 UAC）。

use serde::Serialize;
use std::path::PathBuf;
use std::process::Command;
use tauri::AppHandle;

use crate::error::AppError;

#[derive(Debug, Clone, Serialize)]
pub struct NodeStatus {
    pub installed: bool,
    pub version: Option<String>,
    pub path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct NodeVersion {
    pub version: String,
    pub lts: bool,
}

/// GUI 进程里启动控制台子进程会闪黑窗，Windows 下统一加 CREATE_NO_WINDOW。
pub(crate) fn command_no_window(program: &str) -> Command {
    let mut command = Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}

fn system_where_exe() -> PathBuf {
    // 固定使用 System32 的 where.exe，避免 PATH 劫持（与 misc.rs 的惯例一致）
    let system_root = std::env::var_os("SystemRoot")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(r"C:\Windows"));
    system_root.join("System32").join("where.exe")
}

/// 检测本机 Node.js：版本 + 可执行文件路径
#[tauri::command]
pub async fn get_node_status() -> Result<NodeStatus, String> {
    let version = tokio::task::spawn_blocking(detect_node)
        .await
        .map_err(|e| e.to_string())?;
    Ok(version)
}

/// 读取注册表中的 Machine / User PATH（reg query）。
/// 进程启动后新装的软件只会更新注册表 PATH，运行中进程的环境是旧的——
/// 检测前先合并最新注册表值，避免"刚装完却显示未安装"。
pub(crate) fn registry_path(key_args: &[&str]) -> Option<String> {
    if !cfg!(windows) {
        return None;
    }
    let mut cmd = command_no_window("reg");
    cmd.arg("query");
    for arg in key_args {
        cmd.arg(arg);
    }
    let out = cmd.output().ok()?;
    if !out.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&out.stdout).to_string();
    text.lines()
        .find_map(|line| {
            let marker = if line.contains("REG_EXPAND_SZ") {
                "REG_EXPAND_SZ"
            } else if line.contains("REG_SZ") {
                "REG_SZ"
            } else {
                return None;
            };
            line.find(marker)
                .map(|pos| line[pos + marker.len()..].trim().to_string())
        })
        .filter(|value| !value.is_empty())
}

/// 读取某个注册表 Environment 键下的全部变量（NAME → VALUE），
/// 用于展开 PATH 中的 %VAR% 引用（如 nvm 写入的 %NVM_HOME%）。
fn registry_environment_values(root: &str) -> Vec<(String, String)> {
    let mut result = Vec::new();
    if !cfg!(windows) {
        return result;
    }
    let Ok(out) = command_no_window("reg").arg("query").arg(root).output() else {
        return result;
    };
    if !out.status.success() {
        return result;
    }
    let text = String::from_utf8_lossy(&out.stdout).to_string();
    for line in text.lines() {
        let marker = if line.contains("REG_EXPAND_SZ") {
            "REG_EXPAND_SZ"
        } else if line.contains("REG_SZ") {
            "REG_SZ"
        } else {
            continue;
        };
        let Some(marker_pos) = line.find(marker) else {
            continue;
        };
        let name = line[..marker_pos].trim().to_string();
        let value = line[marker_pos + marker.len()..].trim().to_string();
        if !name.is_empty() && !value.is_empty() {
            result.push((name.to_uppercase(), value));
        }
    }
    result
}

/// 展开 %VAR% 引用（大小写不敏感），找不到的变量原样保留。
/// 按字符切片处理，保证非 ASCII 路径（如中文）不被破坏。
fn expand_percent_vars(input: &str, vars: &std::collections::HashMap<String, String>) -> String {
    let mut out = String::with_capacity(input.len());
    let mut rest = input;
    'outer: while let Some(start) = rest.find('%') {
        if start > 0 {
            out.push_str(&rest[..start]);
        }
        let after = &rest[start + 1..];
        if let Some(close) = after.find('%') {
            let name = &after[..close];
            if !name.is_empty() {
                if let Some(value) = vars.get(&name.to_uppercase()) {
                    out.push_str(value);
                    rest = &after[close + 1..];
                    continue 'outer;
                }
            }
        }
        out.push('%');
        rest = after;
    }
    out.push_str(rest);
    out
}

pub(crate) fn refreshed_search_path() -> String {
    // 变量表：进程环境 + 注册表 Machine/User Environment（覆盖进程启动后新增的变量）
    let mut vars: std::collections::HashMap<String, String> = std::env::vars()
        .map(|(k, v)| (k.to_uppercase(), v))
        .collect();
    let machine_key = concat!(
        r"HKLM\SYSTEM\CurrentControlSet\Control\Session",
        r" Manager\Environment"
    );
    for (k, v) in registry_environment_values(machine_key) {
        vars.insert(k, v);
    }
    for (k, v) in registry_environment_values(r"HKCU\Environment") {
        vars.insert(k, v);
    }

    let mut parts: Vec<String> = Vec::new();
    if let Some(current) = std::env::var_os("PATH") {
        parts.push(expand_percent_vars(&current.to_string_lossy(), &vars));
    }
    if let Some(machine) = registry_path(&[machine_key, "/v", "Path"]) {
        parts.push(expand_percent_vars(&machine, &vars));
    }
    if let Some(user) = registry_path(&[r"HKCU\Environment", "/v", "Path"]) {
        parts.push(expand_percent_vars(&user, &vars));
    }
    parts.join(";")
}

fn node_version_of(exe: &str, search_path: &str) -> Option<String> {
    let out = command_no_window(exe)
        .env("PATH", search_path)
        .arg("--version")
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if text.is_empty() {
        None
    } else {
        Some(text)
    }
}

/// 用指定搜索 PATH 探测 node 版本（供 harness 状态检测等复用）。
pub(crate) fn detect_node_version_with_path(search_path: &str) -> Option<String> {
    node_version_of("node", search_path)
}

fn detect_node() -> NodeStatus {
    let search_path = refreshed_search_path();
    // 1) 首选 PATH 中的 node（合并注册表里的最新 PATH）
    if let Some(version) = node_version_of("node", &search_path) {
        let path = if cfg!(windows) {
            command_no_window(&system_where_exe().to_string_lossy())
                .env("PATH", &search_path)
                .arg("node")
                .output()
                .ok()
                .filter(|out| out.status.success())
                .map(|out| {
                    String::from_utf8_lossy(&out.stdout)
                        .lines()
                        .next()
                        .unwrap_or_default()
                        .trim()
                        .to_string()
                })
                .filter(|line| !line.is_empty())
        } else {
            None
        };
        return NodeStatus {
            installed: true,
            version: Some(version),
            path,
        };
    }

    // 2) PATH 未命中时兜底探测标准安装位置：
    //    刚通过 MSI 装完 Node 时，本进程继承的 PATH 还是旧的，
    //    直接对已知路径的 node.exe 取版本，避免误报"未安装"。
    if cfg!(windows) {
        let mut candidates: Vec<PathBuf> = vec![
            PathBuf::from(
                r"C:\Program Files
odejs
ode.exe",
            ),
            PathBuf::from(
                r"C:\Program Files (x86)
odejs
ode.exe",
            ),
        ];
        if let Some(local) = std::env::var_os("LOCALAPPDATA") {
            let mut p = PathBuf::from(local);
            p.push(
                r"Programs
odejs
ode.exe",
            );
            candidates.push(p);
        }
        for candidate in candidates {
            if !candidate.exists() {
                continue;
            }
            let exe = candidate.to_string_lossy().to_string();
            if let Some(version) = node_version_of(&exe, &search_path) {
                return NodeStatus {
                    installed: true,
                    version: Some(version),
                    path: Some(exe),
                };
            }
        }
    }

    NodeStatus {
        installed: false,
        version: None,
        path: None,
    }
}

fn mirror_index_url(mirror: &str) -> String {
    if mirror == "npmmirror" {
        "https://npmmirror.com/mirrors/node/index.json".to_string()
    } else {
        "https://nodejs.org/dist/index.json".to_string()
    }
}

/// 拉取可下载的 Node.js 版本列表（新→旧，最多 60 条）
#[tauri::command]
pub async fn list_node_versions(mirror: String) -> Result<Vec<NodeVersion>, String> {
    let url = mirror_index_url(&mirror);
    let versions = tokio::task::spawn_blocking(move || -> Result<Vec<NodeVersion>, AppError> {
        let response = reqwest::blocking::get(&url).map_err(|e| {
            AppError::localized(
                "nodejs.list.failed",
                format!("获取 Node.js 版本列表失败: {e}"),
                format!("Failed to fetch Node.js version list: {e}"),
            )
        })?;
        let raw: Vec<serde_json::Value> = response.json().map_err(|e| {
            AppError::localized(
                "nodejs.list.invalid",
                format!("版本列表解析失败: {e}"),
                format!("Failed to parse Node.js version list: {e}"),
            )
        })?;
        // index.json 按新→旧排列，且 LTS 条目的 lts 字段是代号字符串
        // （"Jod"/"Iron"...），非 LTS 为 false。
        // 只保留每条 LTS 大版本线的最新一个（如 v24/v22/v20 各一条），最多 4 条。
        let mut seen_majors = std::collections::HashSet::new();
        let mut list: Vec<NodeVersion> = Vec::new();
        for item in raw {
            let version = match item.get("version").and_then(|v| v.as_str()) {
                Some(v) if !v.is_empty() => v.to_string(),
                _ => continue,
            };
            let lts = match item.get("lts") {
                Some(serde_json::Value::String(_)) => true,
                Some(serde_json::Value::Bool(true)) => true,
                _ => false,
            };
            if !lts {
                continue;
            }
            let major = version
                .trim_start_matches('v')
                .split('.')
                .next()
                .unwrap_or_default()
                .to_string();
            if major.is_empty() || !seen_majors.insert(major) {
                continue;
            }
            list.push(NodeVersion { version, lts: true });
            if list.len() >= 4 {
                break;
            }
        }
        Ok(list)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())?;
    Ok(versions)
}

fn installer_file_name(version: &str) -> String {
    let arch = match std::env::consts::ARCH {
        "x86_64" => "x64",
        "aarch64" => "arm64",
        other => other,
    };
    format!("node-{version}-{arch}.msi")
}

fn mirror_dist_base(mirror: &str) -> String {
    if mirror == "npmmirror" {
        "https://npmmirror.com/mirrors/node".to_string()
    } else {
        "https://nodejs.org/dist".to_string()
    }
}

#[derive(Clone, Serialize)]
struct DownloadProgress {
    downloaded: u64,
    total: Option<u64>,
}

/// 下载指定版本的 Node.js 安装包到临时目录（不自动安装，
/// 由前端在「已下载的安装包」区提供安装/删除操作）。
/// 进度经 `node-download-progress` 事件推送；返回安装包路径。
#[tauri::command]
pub async fn download_node_installer(
    app: AppHandle,
    version: String,
    mirror: String,
) -> Result<String, String> {
    use tauri::Emitter;

    let file_name = installer_file_name(&version);
    let url = format!("{}/{}/{}", mirror_dist_base(&mirror), version, file_name);
    let target = std::env::temp_dir().join(&file_name);
    let target_str = target.to_string_lossy().to_string();

    let progress_app = app.clone();
    tokio::task::spawn_blocking(move || -> Result<(), AppError> {
        use std::io::Write;
        let mut response = reqwest::blocking::Client::builder()
            .build()
            .map_err(|e| AppError::Message(format!("创建 HTTP 客户端失败: {e}")))?
            .get(&url)
            .send()
            .map_err(|e| {
                AppError::localized(
                    "nodejs.download.failed",
                    format!("下载 {file_name} 失败: {e}"),
                    format!("Failed to download {file_name}: {e}"),
                )
            })?;
        if !response.status().is_success() {
            return Err(AppError::localized(
                "nodejs.download.http_error",
                format!("下载失败：服务器返回 {}", response.status()),
                format!("Download failed: HTTP {}", response.status()),
            ));
        }
        let total = response.content_length();
        let mut file = std::fs::File::create(&target)
            .map_err(|e| AppError::Message(format!("创建临时文件失败: {e}")))?;
        let mut downloaded: u64 = 0;
        let mut buffer = [0u8; 64 * 1024];
        let mut last_emit = std::time::Instant::now();
        loop {
            let read = response
                .read_chunk(&mut buffer) // see helper below
                .map_err(|e| AppError::Message(format!("读取下载数据失败: {e}")))?;
            if read == 0 {
                break;
            }
            file.write_all(&buffer[..read])
                .map_err(|e| AppError::Message(format!("写入文件失败: {e}")))?;
            downloaded += read as u64;
            // 节流：每 150ms 推一次进度，避免事件风暴
            if last_emit.elapsed() >= std::time::Duration::from_millis(150) {
                last_emit = std::time::Instant::now();
                let _ = progress_app.emit(
                    "node-download-progress",
                    DownloadProgress { downloaded, total },
                );
            }
        }
        let _ = progress_app.emit(
            "node-download-progress",
            DownloadProgress {
                downloaded,
                total: Some(downloaded),
            },
        );
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())?;

    let _ = app; // 保留参数形状，安装动作由 run_node_installer 显式触发
    Ok(target_str)
}

#[derive(Debug, Clone, Serialize)]
pub struct NodeInstallerFile {
    pub path: String,
    pub version: String,
    pub size: u64,
}

/// 校验路径是本机临时目录下的 node-*.msi 安装包，防止任意路径执行/删除
fn validate_installer_path(path: &str) -> Result<PathBuf, String> {
    let parsed = PathBuf::from(path);
    let name = parsed
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    if !name.starts_with("node-v") || !name.ends_with(".msi") {
        return Err("非法的安装包路径".to_string());
    }
    if parsed.parent() != Some(&std::env::temp_dir()) {
        return Err("仅允许操作临时目录下的 Node.js 安装包".to_string());
    }
    Ok(parsed)
}

/// 扫描临时目录，找回已下载的 Node.js 安装包（应用重启后依然可见）
#[tauri::command]
pub async fn list_downloaded_node_installers() -> Result<Vec<NodeInstallerFile>, String> {
    let files = tokio::task::spawn_blocking(|| -> Vec<NodeInstallerFile> {
        let mut result = Vec::new();
        if let Ok(entries) = std::fs::read_dir(std::env::temp_dir()) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if !name.starts_with("node-v") || !name.ends_with(".msi") {
                    continue;
                }
                let version = name
                    .strip_prefix("node-")
                    .and_then(|rest| rest.split('-').next())
                    .unwrap_or_default()
                    .to_string();
                let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
                if size == 0 {
                    continue;
                }
                result.push(NodeInstallerFile {
                    path: entry.path().to_string_lossy().to_string(),
                    version,
                    size,
                });
            }
        }
        result.sort_by(|a, b| b.version.cmp(&a.version));
        result
    })
    .await
    .map_err(|e| e.to_string())?;
    Ok(files)
}

/// 启动指定安装包（交给系统安装向导，含 UAC）
#[tauri::command]
pub async fn run_node_installer(app: AppHandle, path: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let target = validate_installer_path(&path)?;
    if !target.exists() {
        return Err("安装包不存在（可能已被清理）".to_string());
    }
    app.opener()
        .open_path(target.to_string_lossy().to_string(), None::<String>)
        .map_err(|e| format!("启动安装器失败: {e}"))
}

/// 在资源管理器中显示安装包所在位置
#[tauri::command]
pub async fn reveal_node_installer(app: AppHandle, path: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let target = validate_installer_path(&path)?;
    app.opener()
        .reveal_item_in_dir(target.to_string_lossy().to_string())
        .map_err(|e| format!("打开文件夹失败: {e}"))
}

/// 删除已下载的安装包（不想安装时的清理入口）
#[tauri::command]
pub async fn delete_node_installer(path: String) -> Result<(), String> {
    let target = validate_installer_path(&path)?;
    if !target.exists() {
        return Ok(());
    }
    tokio::task::spawn_blocking(move || std::fs::remove_file(&target).map_err(|e| e.to_string()))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e)
}

#[derive(Debug, Clone, Serialize)]
pub struct NvmStatus {
    pub installed: bool,
    pub version: Option<String>,
    /// nvm 安装根目录（nvm.exe 所在目录）
    pub root: Option<String>,
    /// NVM_HOME / NVM_SYMLINK 环境变量是否已写入注册表
    pub env_configured: bool,
    /// nvm 已安装的 Node 版本列表（旧→新）
    pub versions: Vec<String>,
    /// 当前激活的版本
    pub current: Option<String>,
    /// 本机 Node 是否已由 nvm 接管（位于 nvm 目录或符号链接）
    pub node_managed: bool,
}

fn nvm_env_vars() -> std::collections::HashMap<String, String> {
    let mut vars: std::collections::HashMap<String, String> = std::env::vars()
        .map(|(k, v)| (k.to_uppercase(), v))
        .collect();
    let machine_key = concat!(
        r"HKLM\SYSTEM\CurrentControlSet\Control\Session",
        r" Manager\Environment"
    );
    for (k, v) in registry_environment_values(machine_key) {
        vars.insert(k, v);
    }
    for (k, v) in registry_environment_values(r"HKCU\Environment") {
        vars.insert(k, v);
    }
    vars
}

fn env_configured_check() -> bool {
    let machine_key = concat!(
        r"HKLM\SYSTEM\CurrentControlSet\Control\Session",
        r" Manager\Environment"
    );
    let has_var = |root: &str, name: &str| {
        registry_environment_values(root)
            .iter()
            .any(|(k, _)| k == name)
    };
    let home = has_var(machine_key, "NVM_HOME") || has_var(r"HKCU\Environment", "NVM_HOME");
    let symlink =
        has_var(machine_key, "NVM_SYMLINK") || has_var(r"HKCU\Environment", "NVM_SYMLINK");
    let machine_path = registry_path(&[machine_key, "/v", "Path"])
        .unwrap_or_default()
        .to_uppercase();
    let user_path = registry_path(&[r"HKCU\Environment", "/v", "Path"])
        .unwrap_or_default()
        .to_uppercase();
    let path_ok = machine_path.contains("NVM_HOME") || user_path.contains("NVM_HOME");
    home && symlink && path_ok
}

/// 定位 nvm.exe：优先 PATH（含注册表展开），其次 NVM_HOME 指向的目录
fn locate_nvm_exe(search_path: &str) -> Option<(PathBuf, String)> {
    let probe = |exe: &std::path::PathBuf| -> Option<String> {
        let out = command_no_window(exe.to_string_lossy().as_ref())
            .env("PATH", search_path)
            .arg("version")
            .output()
            .ok()?;
        if !out.status.success() {
            return None;
        }
        let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
        let text = if text.is_empty() {
            String::from_utf8_lossy(&out.stderr).trim().to_string()
        } else {
            text
        };
        let line = text.lines().next().unwrap_or_default().trim().to_string();
        if line.is_empty() {
            None
        } else {
            Some(line)
        }
    };

    if let Some(version) = probe(&PathBuf::from("nvm")) {
        // PATH 命中：用 where 定位真实路径
        let real = if cfg!(windows) {
            command_no_window(&system_where_exe().to_string_lossy())
                .env("PATH", search_path)
                .arg("nvm.exe")
                .output()
                .ok()
                .filter(|out| out.status.success())
                .map(|out| {
                    String::from_utf8_lossy(&out.stdout)
                        .lines()
                        .next()
                        .unwrap_or_default()
                        .trim()
                        .to_string()
                })
                .filter(|line| !line.is_empty())
                .map(PathBuf::from)
        } else {
            None
        };
        return Some((real.unwrap_or_else(|| PathBuf::from("nvm")), version));
    }

    let vars = nvm_env_vars();
    if let Some(home) = vars.get("NVM_HOME") {
        let exe = PathBuf::from(home).join("nvm.exe");
        if exe.exists() {
            if let Some(version) = probe(&exe) {
                return Some((exe, version));
            }
        }
    }
    None
}

/// 运行 nvm 子命令（带上 NVM_HOME/NVM_SYMLINK，注册表配置过但本进程未继承时也能用）
fn run_nvm(args: &[&str]) -> Result<std::process::Output, AppError> {
    let vars = nvm_env_vars();
    let search_path = refreshed_search_path();
    let mut cmd = command_no_window("nvm");
    cmd.env("PATH", &search_path);
    if let Some(home) = vars.get("NVM_HOME") {
        cmd.env("NVM_HOME", home);
    }
    if let Some(symlink) = vars.get("NVM_SYMLINK") {
        cmd.env("NVM_SYMLINK", symlink);
    }
    for arg in args {
        cmd.arg(arg);
    }
    cmd.output()
        .map_err(|e| AppError::Message(format!("无法执行 nvm（未在 PATH 中找到）: {e}")))
}

/// 检测 nvm（nvm-windows）完整状态
#[tauri::command]
pub async fn get_nvm_status() -> Result<NvmStatus, String> {
    let status = tokio::task::spawn_blocking(detect_nvm)
        .await
        .map_err(|e| e.to_string())?;
    Ok(status)
}

fn detect_nvm() -> NvmStatus {
    let search_path = refreshed_search_path();
    let Some((exe, version)) = locate_nvm_exe(&search_path) else {
        return NvmStatus {
            installed: false,
            version: None,
            root: None,
            env_configured: false,
            versions: Vec::new(),
            current: None,
            node_managed: false,
        };
    };

    let root = exe
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();

    // 解析 nvm list：行如 "  * 22.20.0 (Currently using 64-bit executable)"
    let mut versions: Vec<String> = Vec::new();
    let mut current: Option<String> = None;
    if let Ok(out) = run_nvm(&["list"]) {
        let text = format!(
            "{}\n{}",
            String::from_utf8_lossy(&out.stdout),
            String::from_utf8_lossy(&out.stderr)
        );
        for line in text.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() || trimmed.starts_with('|') || trimmed.starts_with('-') {
                continue;
            }
            let is_current = trimmed.starts_with('*');
            let body = trimmed.trim_start_matches('*').trim();
            let version_token = body.split_whitespace().next().unwrap_or_default();
            if version_token.is_empty()
                || !version_token
                    .chars()
                    .next()
                    .is_some_and(|c| c.is_ascii_digit())
            {
                continue;
            }
            if !versions.iter().any(|v| v == version_token) {
                versions.push(version_token.to_string());
            }
            if is_current {
                current = Some(version_token.to_string());
            }
        }
    }

    // 本机 Node 是否已被 nvm 接管
    let node = detect_node();
    let node_managed = match (&node.path, &node.version) {
        (Some(path), Some(version)) => {
            let path_upper = path.to_uppercase();
            let root_upper = root.to_uppercase();
            let vars = nvm_env_vars();
            let symlink_upper = vars
                .get("NVM_SYMLINK")
                .map(|s| s.to_uppercase())
                .unwrap_or_default();
            path_upper.starts_with(&root_upper)
                || (!symlink_upper.is_empty() && path_upper == symlink_upper)
                || current.as_deref() == Some(version.as_str())
        }
        _ => false,
    };

    NvmStatus {
        installed: true,
        version: Some(version),
        root: if root.is_empty() { None } else { Some(root) },
        env_configured: env_configured_check(),
        versions,
        current,
        node_managed,
    }
}

/// 一键把 nvm 的环境变量写入注册表（用户级，免管理员）：
/// NVM_HOME / NVM_SYMLINK + 用户 PATH 追加 %NVM_HOME%;%NVM_SYMLINK%
#[tauri::command]
pub async fn ensure_nvm_env() -> Result<Vec<String>, String> {
    let actions = tokio::task::spawn_blocking(|| -> Result<Vec<String>, String> {
        let search_path = refreshed_search_path();
        let (exe, _) = locate_nvm_exe(&search_path)
            .ok_or_else(|| "未找到 nvm，无法写入环境变量".to_string())?;
        let root = exe
            .parent()
            .ok_or_else(|| "无法确定 nvm 根目录".to_string())?
            .to_string_lossy()
            .to_string();

        let vars = nvm_env_vars();
        let symlink = vars
            .get("NVM_SYMLINK")
            .cloned()
            .unwrap_or_else(|| r"C:\Program Files\nodejs".to_string());

        // 直接写入系统级（HKLM）：需要一次 UAC 提权。
        // 用临时 .ps1 承载脚本，避免引号拼接出错。
        let machine_key = concat!(
            r"HKLM\SYSTEM\CurrentControlSet\Control\Session",
            r" Manager\Environment"
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
            "$ErrorActionPreference = 'Stop'\n\
             $root = '{root}'\n\
             $symlink = '{symlink}'\n\
             $mk = 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment'\n\
             if ({need_home}) {{ [Environment]::SetEnvironmentVariable('NVM_HOME', $root, 'Machine') }}\n\
             if ({need_symlink}) {{ [Environment]::SetEnvironmentVariable('NVM_SYMLINK', $symlink, 'Machine') }}\n\
             if ({need_path}) {{\n\
               reg add $mk /v Path /t REG_EXPAND_SZ /d @'\n\
{new_path}\n\
'@ /f | Out-Null\n\
             }}\n"
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
        }

        // 写完立即校验：用合并注册表后的 PATH 试跑 nvm
        let search_path = refreshed_search_path();
        let verify = command_no_window("nvm")
            .env("PATH", &search_path)
            .arg("version")
            .output();
        match verify {
            Ok(check) if check.status.success() => {
                actions.push("✓ 校验通过：新终端将能识别 nvm 命令".to_string());
            }
            _ => actions.push("✗ 校验失败：新终端可能仍找不到 nvm，请检查系统 PATH".to_string()),
        }
        if actions.len() == 1 {
            actions.insert(0, "环境变量已配置，无需修改".to_string());
        }
        Ok(actions)
    })
    .await
    .map_err(|e| e.to_string())??;
    Ok(actions)
}

/// 把本机独立安装的 Node 归属到 nvm：
/// 版本目录复制进 NVM_HOME\v<版本> 并 nvm use 激活（保留原目录不动）
#[tauri::command]
pub async fn adopt_node_to_nvm() -> Result<String, String> {
    let result = tokio::task::spawn_blocking(|| -> Result<String, String> {
        let search_path = refreshed_search_path();
        let (exe, _) = locate_nvm_exe(&search_path).ok_or_else(|| "未找到 nvm".to_string())?;
        let root = exe
            .parent()
            .ok_or_else(|| "无法确定 nvm 根目录".to_string())?
            .to_string_lossy()
            .to_string();

        let node = detect_node();
        let node_path = node
            .path
            .clone()
            .ok_or_else(|| "未检测到本机 Node.js".to_string())?;
        let node_version = node
            .version
            .clone()
            .ok_or_else(|| "无法确定 Node 版本".to_string())?
            .trim_start_matches('v')
            .to_string();

        let target_dir = std::path::Path::new(&root).join(format!("v{node_version}"));
        if target_dir.exists() {
            // nvm 已有该版本：直接激活即可
            let use_out = run_nvm(&["use", &node_version]).map_err(|e| e.to_string())?;
            if !use_out.status.success() {
                return Err(format!(
                    "nvm use {node_version} 失败: {}",
                    String::from_utf8_lossy(&use_out.stderr).trim()
                ));
            }
            return Ok(format!("nvm 已有 v{node_version}，已直接激活"));
        }

        // 复制当前 Node 目录到 nvm（robocopy，保留原目录）
        let source_dir = std::path::Path::new(&node_path)
            .parent()
            .ok_or_else(|| "无法确定 Node 安装目录".to_string())?;
        let out = command_no_window("robocopy")
            .args([
                &source_dir.to_string_lossy(),
                &target_dir.to_string_lossy(),
                "/E",
                "/NFL",
                "/NDL",
                "/NJH",
                "/NJS",
                "/NP",
            ])
            .output()
            .map_err(|e| e.to_string())?;
        // robocopy 0-7 都算成功
        let code = out.status.code().unwrap_or(1);
        if code >= 8 {
            return Err(format!(
                "复制 Node 目录失败（robocopy 退出码 {code}）: {}",
                String::from_utf8_lossy(&out.stderr).trim()
            ));
        }

        let use_out = run_nvm(&["use", &node_version]).map_err(|e| e.to_string())?;
        if !use_out.status.success() {
            return Err(format!(
                "已复制但激活失败（nvm use {node_version}）: {}",
                String::from_utf8_lossy(&use_out.stderr).trim()
            ));
        }
        Ok(format!("已把本机 Node v{node_version} 归属 nvm 并激活"))
    })
    .await
    .map_err(|e| e.to_string())??;
    Ok(result)
}

/// 切换 nvm 当前使用的 Node 版本，并验证 node 命令在新终端中是否可用
#[tauri::command]
pub async fn nvm_use(version: String) -> Result<String, String> {
    let output = tokio::task::spawn_blocking(move || -> Result<String, String> {
        let out = run_nvm(&["use", &version]).map_err(|e| e.to_string())?;
        let text = format!(
            "{}{}",
            String::from_utf8_lossy(&out.stdout),
            String::from_utf8_lossy(&out.stderr)
        )
        .trim()
        .to_string();
        if !out.status.success() {
            return Err(if text.is_empty() {
                format!("nvm use {version} 失败")
            } else {
                text
            });
        }

        // 用合并注册表后的 PATH 验证 node 命令可用性——
        // 新开终端的环境即按注册表 PATH 解析，这里能找到就代表新终端可用。
        let search_path = refreshed_search_path();
        let node_check = command_no_window("node")
            .env("PATH", &search_path)
            .arg("--version")
            .output();
        let suffix = match node_check {
            Ok(check) if check.status.success() => format!(
                "（校验通过：node 命令可用，{}）",
                String::from_utf8_lossy(&check.stdout).trim()
            ),
            _ => "（注意：当前 PATH 中找不到 node，请点击「一键写入环境变量」后重试）".to_string(),
        };

        Ok(if text.is_empty() {
            suffix
        } else {
            format!("{text}{suffix}")
        })
    })
    .await
    .map_err(|e| e.to_string())??;
    Ok(output)
}

/// 通过 nvm 安装指定 Node 版本（首次自动配置国内镜像源）
#[tauri::command]
pub async fn nvm_install(version: String) -> Result<String, String> {
    let output = tokio::task::spawn_blocking(move || -> Result<String, String> {
        let version = version.trim_start_matches('v').to_string();
        // 未配置镜像时默认走国内源，避免 GitHub 直连超时
        let settings = run_nvm(&["node_mirror", "https://npmmirror.com/mirrors/node"])
            .map_err(|e| e.to_string())?;
        if !settings.status.success() {
            log::warn!("设置 nvm node_mirror 失败（可能已配置，继续安装）");
        }
        let out = run_nvm(&["install", &version]).map_err(|e| e.to_string())?;
        let text = format!(
            "{}{}",
            String::from_utf8_lossy(&out.stdout),
            String::from_utf8_lossy(&out.stderr)
        )
        .trim()
        .to_string();
        if !out.status.success() {
            return Err(if text.is_empty() {
                format!("nvm install v{version} 失败")
            } else {
                text
            });
        }
        Ok(if text.is_empty() {
            format!("v{version} 安装完成")
        } else {
            text
        })
    })
    .await
    .map_err(|e| e.to_string())??;
    Ok(output)
}

const NVM_REPO_API: &str = "https://api.github.com/repos/coreybutler/nvm-windows/releases/latest";

/// 一键安装 nvm：从 GitHub 最新 release 下载 nvm-setup.exe（可选加速镜像），
/// 下载完成立即启动安装向导。进度经 `nvm-download-progress` 事件推送。
#[tauri::command]
pub async fn install_nvm(app: AppHandle, mirror: String) -> Result<String, String> {
    use std::io::Write;
    use tauri::Emitter;
    use tauri_plugin_opener::OpenerExt;

    #[derive(Clone, Serialize)]
    struct Progress {
        downloaded: u64,
        total: Option<u64>,
    }

    let target = std::env::temp_dir().join("nvm-setup.exe");
    let target_str = target.to_string_lossy().to_string();
    let progress_app = app.clone();

    tokio::task::spawn_blocking(move || -> Result<(), AppError> {
        // 1) 取最新 release 的 nvm-setup.exe 下载地址（GitHub API 要求 UA）
        let client = reqwest::blocking::Client::builder()
            .user_agent("yuma-study")
            .build()
            .map_err(|e| AppError::Message(format!("创建 HTTP 客户端失败: {e}")))?;
        let release: serde_json::Value = client
            .get(NVM_REPO_API)
            .send()
            .map_err(|e| {
                AppError::localized(
                    "nvm.release.failed",
                    format!("获取 nvm 最新版本信息失败: {e}"),
                    format!("Failed to fetch latest nvm release info: {e}"),
                )
            })?
            .json()
            .map_err(|e| {
                AppError::localized(
                    "nvm.release.invalid",
                    format!("nvm 版本信息解析失败: {e}"),
                    format!("Failed to parse nvm release info: {e}"),
                )
            })?;
        let asset_url = release
            .get("assets")
            .and_then(|a| a.as_array())
            .and_then(|list| {
                list.iter().find(|asset| {
                    asset.get("name").and_then(|n| n.as_str()) == Some("nvm-setup.exe")
                })
            })
            .and_then(|asset| {
                asset
                    .get("browser_download_url")
                    .and_then(|u| u.as_str())
                    .map(str::to_string)
            })
            .ok_or_else(|| {
                AppError::localized(
                    "nvm.asset.missing",
                    "nvm 最新 release 中未找到 nvm-setup.exe",
                    "nvm-setup.exe not found in the latest nvm release",
                )
            })?;
        // 2) 可选加速镜像前缀
        let url = if mirror == "ghproxy" {
            format!("https://ghfast.top/{asset_url}")
        } else {
            asset_url
        };
        // 3) 下载
        let mut response = client.get(&url).send().map_err(|e| {
            AppError::localized(
                "nvm.download.failed",
                format!("下载 nvm-setup.exe 失败: {e}"),
                format!("Failed to download nvm-setup.exe: {e}"),
            )
        })?;
        if !response.status().is_success() {
            return Err(AppError::localized(
                "nvm.download.http_error",
                format!("下载失败：服务器返回 {}", response.status()),
                format!("Download failed: HTTP {}", response.status()),
            ));
        }
        let total = response.content_length();
        let mut file = std::fs::File::create(&target)
            .map_err(|e| AppError::Message(format!("创建临时文件失败: {e}")))?;
        let mut downloaded: u64 = 0;
        let mut buffer = [0u8; 64 * 1024];
        let mut last_emit = std::time::Instant::now();
        loop {
            use std::io::Read;
            let read = response
                .read(&mut buffer)
                .map_err(|e| AppError::Message(format!("读取下载数据失败: {e}")))?;
            if read == 0 {
                break;
            }
            file.write_all(&buffer[..read])
                .map_err(|e| AppError::Message(format!("写入文件失败: {e}")))?;
            downloaded += read as u64;
            if last_emit.elapsed() >= std::time::Duration::from_millis(150) {
                last_emit = std::time::Instant::now();
                let _ = progress_app.emit("nvm-download-progress", Progress { downloaded, total });
            }
        }
        let _ = progress_app.emit(
            "nvm-download-progress",
            Progress {
                downloaded,
                total: Some(downloaded),
            },
        );
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())?;

    app.opener()
        .open_path(target_str.clone(), None::<String>)
        .map_err(|e| format!("启动 nvm 安装器失败: {e}"))?;

    Ok(target_str)
}

/// reqwest::blocking::Response 没有直接的 read_chunk，包一层
trait ReadChunk {
    fn read_chunk(&mut self, buf: &mut [u8]) -> std::io::Result<usize>;
}

impl ReadChunk for reqwest::blocking::Response {
    fn read_chunk(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        use std::io::Read;
        self.read(buf)
    }
}

#[cfg(test)]
mod env_check_tests {
    use super::*;

    #[test]
    fn debug_env_configured_check() {
        let machine_key = concat!(
            r"HKLM\SYSTEM\CurrentControlSet\Control\Session",
            r" Manager\Environment"
        );
        // 直接观察 reg /v 查询的原始输出与退出码
        for (label, args) in [
            ("machine /v Path", vec![machine_key, "/v", "Path"]),
            ("user /v Path", vec![r"HKCU\Environment", "/v", "Path"]),
        ] {
            let mut cmd = command_no_window("reg");
            for a in &args {
                cmd.arg(a);
            }
            match cmd.output() {
                Ok(out) => println!(
                    "[{label}] status={} stdout={:?} stderr={:?}",
                    out.status,
                    String::from_utf8_lossy(&out.stdout),
                    String::from_utf8_lossy(&out.stderr)
                ),
                Err(e) => println!("[{label}] spawn error: {e}"),
            }
        }
        println!("machine vars: {:?}", registry_environment_values(machine_key));
        println!("user vars: {:?}", registry_environment_values(r"HKCU\Environment"));
        println!(
            "machine PATH raw: {:?}",
            registry_path(&[machine_key, "/v", "Path"])
        );
        println!(
            "user PATH raw: {:?}",
            registry_path(&[r"HKCU\Environment", "/v", "Path"])
        );
        let result = env_configured_check();
        println!("env_configured_check = {result}");
        assert!(result, "env_configured_check should be true on this machine");
    }
}
