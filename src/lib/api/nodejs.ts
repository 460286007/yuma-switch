// Node.js 版本管理（后端 commands/nodejs.rs）
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type NodeMirror = "official" | "npmmirror";

export interface NodeStatus {
  installed: boolean;
  version: string | null;
  path: string | null;
}

export interface NodeVersion {
  version: string;
  lts: boolean;
}

export interface NodeInstallerFile {
  path: string;
  version: string;
  size: number;
}

export interface NvmStatus {
  installed: boolean;
  version: string | null;
  /** nvm 安装根目录 */
  root: string | null;
  /** 环境变量是否已写入注册表 */
  envConfigured: boolean;
  /** 已安装的 Node 版本列表 */
  versions: string[];
  /** 当前激活版本 */
  current: string | null;
  /** 本机 Node 是否已由 nvm 接管 */
  nodeManaged: boolean;
}

export interface NvmDownloadProgress {
  downloaded: number;
  total: number | null;
}

export interface NodeDownloadProgress {
  downloaded: number;
  total: number | null;
}

export const nodeApi = {
  async getStatus(): Promise<NodeStatus> {
    return await invoke("get_node_status");
  },

  async listVersions(mirror: NodeMirror): Promise<NodeVersion[]> {
    return await invoke("list_node_versions", { mirror });
  },

  /** 扫描临时目录找回已下载的安装包 */
  async listDownloaded(): Promise<NodeInstallerFile[]> {
    return await invoke("list_downloaded_node_installers");
  },

  /** 启动指定安装包（系统安装向导） */
  async runInstaller(path: string): Promise<void> {
    await invoke("run_node_installer", { path });
  },

  /** 在资源管理器中定位安装包 */
  async revealInstaller(path: string): Promise<void> {
    await invoke("reveal_node_installer", { path });
  },

  /** 删除安装包文件 */
  async deleteInstaller(path: string): Promise<void> {
    await invoke("delete_node_installer", { path });
  },

  /** 下载安装包到临时目录（不自动安装），返回安装包路径 */
  async downloadAndInstall(
    version: string,
    mirror: NodeMirror,
  ): Promise<string> {
    return await invoke("download_node_installer", { version, mirror });
  },

  async getNvmStatus(): Promise<NvmStatus> {
    return await invoke("get_nvm_status");
  },

  /** 一键写入 nvm 环境变量到注册表（用户级） */
  async ensureNvmEnv(): Promise<string[]> {
    return await invoke("ensure_nvm_env");
  },

  /** 把本机 Node 归属 nvm（复制版本目录并激活） */
  async adoptNodeToNvm(): Promise<string> {
    return await invoke("adopt_node_to_nvm");
  },

  /** 切换 nvm 当前 Node 版本（返回值含 node 命令可用性校验结果） */
  async nvmUse(version: string): Promise<string> {
    return await invoke("nvm_use", { version });
  },

  /** 通过 nvm 安装指定 Node 版本 */
  async nvmInstall(version: string): Promise<string> {
    return await invoke("nvm_install", { version });
  },

  /** 一键安装 nvm：下载 nvm-setup.exe 并启动安装向导 */
  async installNvm(mirror: "official" | "ghproxy"): Promise<string> {
    return await invoke("install_nvm", { mirror });
  },

  onNvmDownloadProgress(
    handler: (progress: NvmDownloadProgress) => void,
  ): Promise<UnlistenFn> {
    return listen<NvmDownloadProgress>("nvm-download-progress", (event) =>
      handler(event.payload),
    );
  },

  onDownloadProgress(
    handler: (progress: NodeDownloadProgress) => void,
  ): Promise<UnlistenFn> {
    return listen<NodeDownloadProgress>("node-download-progress", (event) =>
      handler(event.payload),
    );
  },
};
