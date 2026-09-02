// git 平台账号：gitee / github 多账号管理与全局身份切换（后端 commands/git_account.rs）
import { invoke } from "@tauri-apps/api/core";

export type GitPlatform = "gitee" | "github";

export interface GitAccount {
  id: string;
  /** 条目显示名称（如"工作号"），不参与 git 配置 */
  title: string;
  name: string;
  email: string;
  password: string;
  /** 本地项目路径（选填，仅记录） */
  projectPath: string;
}

export interface GitAccounts {
  gitee: GitAccount[];
  github: GitAccount[];
}

export interface GitSwitchResult {
  platform: string;
  name: string;
  email: string;
}

export const gitAccountApi = {
  async getAccounts(): Promise<GitAccounts> {
    return await invoke("get_git_accounts");
  },

  async saveAccounts(accounts: GitAccounts): Promise<boolean> {
    return await invoke("save_git_accounts", { accounts });
  },

  async getCurrentPlatform(): Promise<GitPlatform | null> {
    return await invoke("get_current_git_platform");
  },

  async getCurrentAccount(): Promise<string | null> {
    return await invoke("get_current_git_account");
  },

  async switchAccount(
    platform: GitPlatform,
    id: string,
  ): Promise<GitSwitchResult> {
    return await invoke("switch_git_account", { platform, id });
  },

  /** 在账号的项目路径（工作区）打开用户首选终端 */
  async openTerminal(cwd: string): Promise<boolean> {
    return await invoke("open_terminal_at_directory", { cwd });
  },

  /** 检测本机 Git 是否可用（返回版本号，未安装返回 null） */
  async getGitStatus(): Promise<string | null> {
    return await invoke("get_git_status");
  },
};

export const GIT_PLATFORM_LABEL: Record<GitPlatform, string> = {
  gitee: "Gitee",
  github: "GitHub",
};

export function newAccountId(): string {
  return `git-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}
