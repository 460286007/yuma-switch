//! git 平台账号：管理 gitee / github 的多套账号，切换全局 git 身份
//! （user.name / user.email）。
//!
//! 账号信息存放在本机 settings（git_accounts），密码仅本地留存、
//! 不参与 git config —— git 提交身份只需要姓名和邮箱。
//! 切换通过 `git config --global` 参数化调用完成，不经过 shell。

use std::process::Command;

use crate::error::AppError;
use crate::settings::{mutate_settings, settings_store, GitAccount, GitAccounts};

pub const GIT_PLATFORMS: [&str; 2] = ["gitee", "github"];

fn validate_platform(platform: &str) -> Result<(), AppError> {
    if GIT_PLATFORMS.contains(&platform) {
        return Ok(());
    }
    Err(AppError::localized(
        "git_account.platform.invalid",
        format!("不支持的 git 平台: {platform}（可选: gitee, github）"),
        format!("Unsupported git platform: {platform} (allowed: gitee, github)"),
    ))
}

fn accounts_of<'a>(accounts: &'a GitAccounts, platform: &str) -> &'a [GitAccount] {
    if platform == "gitee" {
        &accounts.gitee
    } else {
        &accounts.github
    }
}

/// 每个平台保证至少有一个「默认账号」条目（字段留空，用户点编辑补全），
/// 首次读取时写入并持久化，后续以用户数据为准。
fn ensure_default_accounts(accounts: &mut GitAccounts) -> bool {
    let mut changed = false;
    if accounts.gitee.is_empty() {
        accounts.gitee.push(GitAccount {
            id: "gitee-default".to_string(),
            ..GitAccount::default()
        });
        changed = true;
    }
    if accounts.github.is_empty() {
        accounts.github.push(GitAccount {
            id: "github-default".to_string(),
            ..GitAccount::default()
        });
        changed = true;
    }
    changed
}

/// 读取 gitee / github 账号列表（含密码，仅本机使用）
#[tauri::command]
pub async fn get_git_accounts() -> Result<GitAccounts, String> {
    let mut accounts = {
        let settings = settings_store().read().map_err(|e| e.to_string())?;
        settings.git_accounts.clone().unwrap_or_default()
    };
    if ensure_default_accounts(&mut accounts) {
        let seeded = accounts.clone();
        mutate_settings(|settings| {
            settings.git_accounts = Some(seeded.clone());
        })
        .map_err(|e| e.to_string())?;
    }
    Ok(accounts)
}

/// 整体保存 gitee / github 账号列表（前端持有完整列表，增删改后回写）。
/// 若当前生效的账号已不在列表中，则同步清空当前账号标记。
#[tauri::command]
pub async fn save_git_accounts(accounts: GitAccounts) -> Result<bool, String> {
    mutate_settings(|settings| {
        let current_still_exists = settings
            .current_git_platform
            .as_deref()
            .and_then(|platform| {
                let exists = settings.current_git_account.as_deref().is_some_and(|id| {
                    accounts_of(&accounts, platform)
                        .iter()
                        .any(|account| account.id == id)
                });
                exists.then_some(())
            })
            .is_some();
        if !current_still_exists {
            settings.current_git_account = None;
        }
        settings.git_accounts = Some(accounts);
    })
    .map_err(|e| e.to_string())
    .map(|_| true)
}

/// 当前选中的 git 平台（gitee / github），未切换过时为 null
#[tauri::command]
pub async fn get_current_git_platform() -> Result<Option<String>, String> {
    let settings = settings_store().read().map_err(|e| e.to_string())?;
    Ok(settings.current_git_platform.clone())
}

/// 当前生效的 git 账号 ID
#[tauri::command]
pub async fn get_current_git_account() -> Result<Option<String>, String> {
    let settings = settings_store().read().map_err(|e| e.to_string())?;
    Ok(settings.current_git_account.clone())
}

/// GUI 进程里启动控制台子进程会闪黑窗，Windows 下统一加 CREATE_NO_WINDOW 抑制。
fn git_command_no_window(program: &str) -> Command {
    let mut command = Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}

fn run_git_config(key: &str, value: &str) -> Result<(), AppError> {
    let output = git_command_no_window("git")
        .args(["config", "--global", key, value])
        .output()
        .map_err(|error| {
            AppError::localized(
                "git_account.git.unavailable",
                format!("无法执行 git（请确认已安装并在 PATH 中）: {error}"),
                format!("Failed to run git (is it installed and on PATH?): {error}"),
            )
        })?;
    if !output.status.success() {
        return Err(AppError::localized(
            "git_account.config.failed",
            format!(
                "git config --global {key} 失败: {}",
                String::from_utf8_lossy(&output.stderr).trim()
            ),
            format!(
                "git config --global {key} failed: {}",
                String::from_utf8_lossy(&output.stderr).trim()
            ),
        ));
    }
    Ok(())
}

/// 切换全局 git 身份到指定平台的指定账号，返回实际写入的姓名/邮箱
#[tauri::command]
pub async fn switch_git_account(platform: String, id: String) -> Result<serde_json::Value, String> {
    switch_git_account_inner(&platform, &id).map_err(|e| e.to_string())
}

fn switch_git_account_inner(platform: &str, id: &str) -> Result<serde_json::Value, AppError> {
    validate_platform(platform)?;

    let account = {
        let settings = settings_store()
            .read()
            .map_err(|e| AppError::Message(format!("读取设置失败: {e}")))?;
        let accounts = settings.git_accounts.clone().unwrap_or_default();
        accounts_of(&accounts, platform)
            .iter()
            .find(|account| account.id == id)
            .cloned()
    };

    let Some(account) = account else {
        return Err(AppError::localized(
            "git_account.account.missing",
            format!("在 {platform} 下找不到该账号（可能已被删除），请刷新后重试"),
            format!(
                "Account not found under {platform} (it may have been deleted); refresh and retry"
            ),
        ));
    };

    if account.name.trim().is_empty() || account.email.trim().is_empty() {
        return Err(AppError::localized(
            "git_account.account.incomplete",
            "该账号缺少姓名或邮箱，请先编辑补全",
            "This account is missing a name or email; edit it first",
        ));
    }

    let name = account.name.trim().to_string();
    let email = account.email.trim().to_string();
    run_git_config("user.name", &name)?;
    run_git_config("user.email", &email)?;

    // 同步切换该站点的访问凭据（做法三 + 凭据存储；绝不写明文进 remote URL）
    let host = platform_host(platform);
    let username_key = format!("credential.https://{host}.username");
    run_git_config(&username_key, &name)?;
    let token = account.password.trim();
    if !token.is_empty() {
        store_credential(platform, &name, token)?;
    }

    mutate_settings(|settings| {
        settings.current_git_platform = Some(platform.to_string());
        settings.current_git_account = Some(id.to_string());
    })?;

    Ok(serde_json::json!({ "platform": platform, "name": name, "email": email }))
}

fn platform_host(platform: &str) -> &'static str {
    if platform == "gitee" {
        "gitee.com"
    } else {
        "github.com"
    }
}

/// 通过 `git credential approve` 把令牌写入系统凭据存储（Windows 下为 GCM）。
/// 令牌经 stdin 以 git-credential 协议传递——不出现在命令行参数、
/// 不写入任何 git 配置文件或 remote URL。
fn store_credential(platform: &str, username: &str, token: &str) -> Result<(), AppError> {
    use std::io::Write;
    use std::process::Stdio;

    let host = platform_host(platform);
    let payload = format!("protocol=https\nhost={host}\nusername={username}\npassword={token}\n");

    let mut child = git_command_no_window("git")
        .args(["credential", "approve"])
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| {
            AppError::localized(
                "git_account.git.unavailable",
                format!("无法执行 git（请确认已安装并在 PATH 中）: {error}"),
                format!("Failed to run git (is it installed and on PATH?): {error}"),
            )
        })?;
    if let Some(stdin) = child.stdin.as_mut() {
        // 忽略BrokenPipe：helper 提前退出时令牌仍可能已被消费
        let _ = stdin.write_all(payload.as_bytes());
    }
    let output = child
        .wait_with_output()
        .map_err(|e| AppError::Message(format!("git credential approve 执行失败: {e}")))?;
    if !output.status.success() {
        return Err(AppError::localized(
            "git_account.credential.failed",
            format!(
                "写入凭据失败（{}）: {}",
                host,
                String::from_utf8_lossy(&output.stderr).trim()
            ),
            format!(
                "Failed to store credential for {host}: {}",
                String::from_utf8_lossy(&output.stderr).trim()
            ),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_unknown_platform() {
        assert!(validate_platform("gitlab").is_err());
        assert!(validate_platform("gitee").is_ok());
        assert!(validate_platform("github").is_ok());
    }

    #[test]
    fn platform_host_maps_platforms() {
        assert_eq!(platform_host("gitee"), "gitee.com");
        assert_eq!(platform_host("github"), "github.com");
    }

    #[test]
    fn legacy_single_account_deserializes_into_list() {
        let legacy = serde_json::json!({
            "gitee": { "id": "a1", "name": "Alice", "email": "a@gitee.com", "password": "" },
            "github": [
                { "id": "b1", "name": "Bob", "email": "b@github.com", "password": "" }
            ]
        });
        let accounts: GitAccounts = serde_json::from_value(legacy).expect("parse legacy shape");
        assert_eq!(accounts.gitee.len(), 1);
        assert_eq!(accounts.gitee[0].email, "a@gitee.com");
        assert_eq!(accounts.github.len(), 1);
    }
}
