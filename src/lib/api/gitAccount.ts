// git 平台账号：gitee / github 多账号管理与全局身份切换（后端 commands/git_account.rs）
import { invoke } from "@tauri-apps/api/core";

export type GitPlatform = "gitee" | "github";

export interface GitAccount {
  id: string;
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
