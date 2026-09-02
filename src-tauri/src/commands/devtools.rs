//! AI CLI 工具的卸载与"命令注册"（PATH 可用性检查 + 一键写入用户 PATH）。
//!
//! 安装/更新沿用 misc.rs 的生命周期系统，这里补齐：
//! - uninstall_tool：npm 全局卸载
//! - check_tool_command：用合并注册表后的 PATH 验证 <cmd> --version 是否可用
//!   （即"新终端能否识别"，注册表 PATH 是新终端的解析来源）
//! - register_tool_command：定位安装目录并写入用户 PATH，随后复验

use serde::Serialize;
use std::process::Command;
use tauri::AppHandle;

use crate::commands::nodejs::refreshed_search_path;
#[derive(Debug, Clone, Serialize)]
pub struct ToolCommandStatus {
    pub available: bool,
    pub version: Option<String>,
}

fn command_no_window(program: &str) -> Command {
    let mut command = Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}

/// appId → 可执行命令名（与各 CLI 的命令行入口一致）
fn tool_command_name(app: &str) -> Option<&'static str> {
    match app {
        "claude" => Some("claude"),
        "codex" => Some("codex"),
        "gemini" => Some("gemini"),
        "grokbuild" => Some("grok"),
        "opencode" => Some("opencode"),
        "openclaw" => Some("openclaw"),
        "hermes" => Some("hermes"),
        "pi" => Some("pi"),
        "zcode" => Some("zcode"),
        _ => None,
    }
}

/// npm 全局包名（用于卸载；zcode 等非 npm 分发的工具返回 None）
fn tool_npm_package(app: &str) -> Option<&'static str> {
    match app {
        "claude" => Some("@anthropic-ai/claude-code"),
        "codex" => Some("@openai/codex"),
        "gemini" => Some("@google/gemini-cli"),
        "grokbuild" => Some("@xai-official/grok"),
        "opencode" => Some("opencode-ai"),
        "openclaw" => Some("openclaw"),
        "pi" => Some("@earendil-works/pi-coding-agent"),
        _ => None,
    }
}

/// 检查工具命令在新终端中是否可用（以合并注册表后的 PATH 解析）
#[tauri::command]
pub async fn check_tool_command(app: String) -> Result<ToolCommandStatus, String> {
    let status = tokio::task::spawn_blocking(move || {
        let Some(cmd_name) = tool_command_name(&app) else {
            return ToolCommandStatus {
                available: false,
                version: None,
            };
        };

        // Windows：npm 全局包只有 .cmd/.bat 垫片、没有 .exe，CreateProcess
        // 直调探不到 → 复用 misc 的 PATHEXT 感知解析（where 定位 + 过滤
        // App Execution Alias），避免"已装好却报 命令未注册到 PATH"的误报。
        #[cfg(target_os = "windows")]
        {
            return match super::misc::probe_path_default_version(cmd_name) {
                super::misc::ShellProbe::Found(version) => ToolCommandStatus {
                    available: true,
                    version: Some(version),
                },
                // 命令存在但 --version 非零退出（如 Node 版本不满足）：
                // PATH 注册本身没问题，不算"未注册"。
                super::misc::ShellProbe::FoundButFailed(_) => ToolCommandStatus {
                    available: true,
                    version: None,
                },
                super::misc::ShellProbe::NotFound(_) => ToolCommandStatus {
                    available: false,
                    version: None,
                },
            };
        }

        #[cfg(not(target_os = "windows"))]
        {
            let search_path = refreshed_search_path();
            let out = command_no_window(cmd_name)
                .env("PATH", &search_path)
                .arg("--version")
                .output();
            match out {
                Ok(out) if out.status.success() => {
                    let text = format!(
                        "{}{}",
                        String::from_utf8_lossy(&out.stdout),
                        String::from_utf8_lossy(&out.stderr)
                    );
                    let version = text
                        .lines()
                        .find(|l| !l.trim().is_empty())
                        .map(|l| l.trim().to_string());
                    ToolCommandStatus {
                        available: true,
                        version,
                    }
                }
                _ => ToolCommandStatus {
                    available: false,
                    version: None,
                },
            }
        }
    })
    .await
    .map_err(|e| e.to_string())?;
    Ok(status)
}

/// 定位工具安装目录：优先 where 定位命令所在目录，其次常见 npm/本地 bin 目录
fn locate_tool_dirs(app: &str, cmd_name: &str) -> Vec<std::path::PathBuf> {
    let mut dirs: Vec<std::path::PathBuf> = Vec::new();
    let search_path = refreshed_search_path();

    // where 定位（Windows）
    if cfg!(windows) {
        let system_root = std::env::var_os("SystemRoot")
            .map(std::path::PathBuf::from)
            .unwrap_or_else(|| std::path::PathBuf::from(r"C:\Windows"));
        let where_exe = system_root.join("System32").join("where.exe");
        if let Ok(out) = command_no_window(&where_exe.to_string_lossy())
            .env("PATH", &search_path)
            .arg(format!("{cmd_name}.exe"))
            .arg(format!("{cmd_name}.cmd"))
            .output()
        {
            if out.status.success() {
                for line in String::from_utf8_lossy(&out.stdout).lines() {
                    if let Some(parent) = std::path::Path::new(line.trim()).parent() {
                        if !dirs.iter().any(|d| d == parent) {
                            dirs.push(parent.to_path_buf());
                        }
                    }
                }
            }
        }
    }

    // 常见目录兜底
    let mut candidates: Vec<std::path::PathBuf> = Vec::new();
    if let Some(appdata) = std::env::var_os("APPDATA") {
        candidates.push(std::path::PathBuf::from(appdata).join("npm"));
    }
    if let Some(home) = std::env::var_os("USERPROFILE") {
        let home = std::path::PathBuf::from(home);
        candidates.push(home.join(r".local\bin"));
        candidates.push(home.join("bin"));
    }
    for dir in candidates {
        if dir.exists() && !dirs.iter().any(|d| d == &dir) {
            dirs.push(dir);
        }
    }
    let _ = app;
    dirs
}

/// 一键注册：把工具所在目录写入用户 PATH（注册表），并复验命令可用性。
/// 返回人类可读的结果说明。
#[tauri::command]
pub async fn register_tool_command(_app: AppHandle, app: String) -> Result<String, String> {
    let result = tokio::task::spawn_blocking(move || -> Result<String, String> {
        let Some(cmd_name) = tool_command_name(&app) else {
            return Err("不支持的工具".to_string());
        };

        let dirs = locate_tool_dirs(&app, cmd_name);
        if dirs.is_empty() {
            return Err("未找到该工具的安装目录，请先安装".to_string());
        }

        // 现有用户 PATH
        let user_path =
            crate::commands::nodejs::registry_path(&[r"HKCU\Environment", "/v", "Path"])
                .unwrap_or_default();
        let normalized = user_path.replace('/', "\\").to_uppercase();

        let mut added: Vec<String> = Vec::new();
        for dir in &dirs {
            let dir_str = dir.to_string_lossy().to_string();
            if normalized.contains(&dir_str.replace('/', "\\").to_uppercase()) {
                continue;
            }
            added.push(dir_str);
        }
        if added.is_empty() {
            return Ok("该工具目录已在用户 PATH 中".to_string());
        }

        let appended = if user_path.trim().is_empty() {
            added.join(";")
        } else {
            format!("{};{}", user_path.trim_end_matches(';'), added.join(";"))
        };
        let script =
            format!("[Environment]::SetEnvironmentVariable('Path', @'\n{appended}\n'@, 'User')");
        let out = command_no_window("powershell")
            .args(["-NoProfile", "-Command", &script])
            .output()
            .map_err(|e| e.to_string())?;
        if !out.status.success() {
            return Err(format!(
                "写入用户 PATH 失败: {}",
                String::from_utf8_lossy(&out.stderr).trim()
            ));
        }

        // 复验
        let search_path = refreshed_search_path();
        let verify = command_no_window(cmd_name)
            .env("PATH", &search_path)
            .arg("--version")
            .output();
        match verify {
            Ok(v) if v.status.success() => Ok(format!(
                "已写入用户 PATH：{}（新终端即可识别 {cmd_name} 命令）",
                added.join("；")
            )),
            _ => Ok(format!(
                "已写入用户 PATH：{}，但仍未检测到 {cmd_name} 可执行文件，请确认安装完整",
                added.join("；")
            )),
        }
    })
    .await
    .map_err(|e| e.to_string())??;
    Ok(result)
}

/// npm 全局卸载工具
#[tauri::command]
pub async fn uninstall_tool(app: String) -> Result<String, String> {
    let result = tokio::task::spawn_blocking(move || -> Result<String, String> {
        let Some(pkg) = tool_npm_package(&app) else {
            return Err("该工具非 npm 分发，请手动卸载".to_string());
        };
        let search_path = refreshed_search_path();
        let mut cmd = command_no_window(if cfg!(windows) { "cmd" } else { "sh" });
        if cfg!(windows) {
            cmd.arg("/C").arg("npm").arg("uninstall").arg("-g").arg(pkg);
        } else {
            cmd.arg("-c").arg(format!("npm uninstall -g {pkg}"));
        }
        cmd.env("PATH", &search_path);
        let out = cmd.output().map_err(|e| e.to_string())?;
        let text = format!(
            "{}{}",
            String::from_utf8_lossy(&out.stdout),
            String::from_utf8_lossy(&out.stderr)
        )
        .trim()
        .to_string();
        if !out.status.success() {
            return Err(if text.is_empty() {
                format!("卸载 {pkg} 失败")
            } else {
                text
            });
        }
        Ok(format!("已卸载 {pkg}"))
    })
    .await
    .map_err(|e| e.to_string())??;
    Ok(result)
}
