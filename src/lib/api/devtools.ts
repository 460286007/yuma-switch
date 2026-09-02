// AI CLI 工具管理（后端 commands/devtools.rs + settings.ts 的生命周期命令）
import { invoke } from "@tauri-apps/api/core";
import type { AppId } from "./types";

export interface ToolCommandStatus {
  available: boolean;
  version: string | null;
}

export const devtoolsApi = {
  async checkCommand(app: AppId): Promise<ToolCommandStatus> {
    return await invoke("check_tool_command", { app });
  },

  /** 把工具安装目录写入用户 PATH（注册表） */
  async registerCommand(app: AppId): Promise<string> {
    return await invoke("register_tool_command", { app });
  },

  /** npm 全局卸载 */
  async uninstall(app: AppId): Promise<string> {
    return await invoke("uninstall_tool", { app });
  },
};
