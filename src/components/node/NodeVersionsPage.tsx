import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Check,
  Download,
  FolderOpen,
  ChevronDown,
  ChevronUp,
  Loader2,
  Layers,
  PackageCheck,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { NodejsIcon } from "@/components/BrandIcons";
import {
  nodeApi,
  type NodeInstallerFile,
  type NodeMirror,
  type NodeStatus,
  type NodeVersion,
  type NvmStatus,
} from "@/lib/api/nodejs";

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Node.js 版本管理页：检测本机版本、选择镜像下载 LTS 安装包、
 * 管理已下载的安装包（安装 / 定位 / 删除）。
 */
export function NodeVersionsPage() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<NodeStatus | null>(null);
  const [mirror, setMirror] = useState<NodeMirror>("npmmirror");
  const [versions, setVersions] = useState<NodeVersion[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [progress, setProgress] = useState<{
    done: number;
    total: number | null;
  } | null>(null);
  const [downloaded, setDownloaded] = useState<NodeInstallerFile[]>([]);
  const [nvm, setNvm] = useState<NvmStatus | null>(null);
  const [nvmInstalling, setNvmInstalling] = useState(false);
  const [nvmProgress, setNvmProgress] = useState<{
    done: number;
    total: number | null;
  } | null>(null);
  const [nvmMirror, setNvmMirror] = useState<"official" | "ghproxy">("ghproxy");
  // 本机已有 Node 时，下载区默认折叠为一个入口按钮
  const [showVersions, setShowVersions] = useState(false);
  const [envWriting, setEnvWriting] = useState(false);
  const [adopting, setAdopting] = useState(false);
  const [switchingNvm, setSwitchingNvm] = useState<string | null>(null);
  const [showNvmInstall, setShowNvmInstall] = useState(false);
  const [nvmInstallingVer, setNvmInstallingVer] = useState<string | null>(null);
  const pollTimersRef = useRef<ReturnType<typeof setInterval>[]>([]);
  const unlistenRef = useRef<(() => void) | null>(null);
  const nvmUnlistenRef = useRef<(() => void) | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await nodeApi.getStatus());
    } catch {
      setStatus({ installed: false, version: null, path: null });
    }
  }, []);

  const refreshNvm = useCallback(async () => {
    try {
      setNvm(await nodeApi.getNvmStatus());
    } catch {
      setNvm({
        installed: false,
        version: null,
        root: null,
        envConfigured: false,
        versions: [],
        current: null,
        nodeManaged: false,
      });
    }
  }, []);

  const refreshDownloaded = useCallback(async () => {
    try {
      setDownloaded(await nodeApi.listDownloaded());
    } catch {
      setDownloaded([]);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
    void refreshDownloaded();
    void refreshNvm();
    void nodeApi
      .onDownloadProgress((p) =>
        setProgress({ done: p.downloaded, total: p.total }),
      )
      .then((unlisten) => {
        unlistenRef.current = unlisten;
      });
    void nodeApi
      .onNvmDownloadProgress((p) =>
        setNvmProgress({ done: p.downloaded, total: p.total }),
      )
      .then((unlisten) => {
        nvmUnlistenRef.current = unlisten;
      });
    return () => {
      unlistenRef.current?.();
      nvmUnlistenRef.current?.();
      pollTimersRef.current.forEach((timer) => clearInterval(timer));
    };
  }, [refreshStatus, refreshDownloaded]);

  useEffect(() => {
    setListLoading(true);
    nodeApi
      .listVersions(mirror)
      .then(setVersions)
      .catch((error) => toast.error(String(error)))
      .finally(() => setListLoading(false));
  }, [mirror]);

  const handleDownload = async (version: string) => {
    if (downloading) return;
    setDownloading(version);
    setProgress({ done: 0, total: null });
    try {
      await nodeApi.downloadAndInstall(version, mirror);
      toast.success(
        t("nodejs.downloadDone", {
          defaultValue: "下载完成，可在「已下载的安装包」中安装或删除",
        }),
      );
    } catch (error) {
      toast.error(String(error));
    } finally {
      setDownloading(null);
      setProgress(null);
      void refreshDownloaded();
    }
  };

  const handleInstall = async (file: NodeInstallerFile) => {
    try {
      await nodeApi.runInstaller(file.path);
      toast.success(
        t("nodejs.installerLaunched", {
          defaultValue: "安装器已启动，请在弹出的安装向导中完成安装",
        }),
      );
      let attempts = 0;
      const timer = setInterval(() => {
        attempts += 1;
        void refreshStatus();
        if (attempts >= 12) clearInterval(timer);
      }, 5000);
      pollTimersRef.current.push(timer);
    } catch (error) {
      toast.error(String(error));
    }
  };

  const handleDelete = async (file: NodeInstallerFile) => {
    try {
      await nodeApi.deleteInstaller(file.path);
      void refreshDownloaded();
    } catch (error) {
      toast.error(String(error));
    }
  };

  const handleInstallNvm = async () => {
    if (nvmInstalling) return;
    setNvmInstalling(true);
    setNvmProgress({ done: 0, total: null });
    try {
      await nodeApi.installNvm(nvmMirror);
      toast.success(
        t("nvm.installerLaunched", {
          defaultValue: "nvm 安装器已启动，请在向导中完成安装",
        }),
      );
      let attempts = 0;
      const timer = setInterval(() => {
        attempts += 1;
        void refreshNvm();
        if (attempts >= 12) clearInterval(timer);
      }, 5000);
      pollTimersRef.current.push(timer);
    } catch (error) {
      toast.error(String(error));
    } finally {
      setNvmInstalling(false);
      setNvmProgress(null);
    }
  };

  const handleWriteEnv = async () => {
    setEnvWriting(true);
    try {
      const actions = await nodeApi.ensureNvmEnv();
      toast.success(
        actions.join("\n") ||
          t("nvm.envWritten", { defaultValue: "环境变量已写入" }),
        { duration: 6000 },
      );
      void refreshNvm();
    } catch (error) {
      toast.error(String(error));
    } finally {
      setEnvWriting(false);
    }
  };

  const handleAdopt = async () => {
    setAdopting(true);
    try {
      const message = await nodeApi.adoptNodeToNvm();
      toast.success(message);
      void refreshNvm();
      void refreshStatus();
    } catch (error) {
      toast.error(String(error));
    } finally {
      setAdopting(false);
    }
  };

  const handleNvmUse = async (version: string) => {
    if (switchingNvm) return;
    setSwitchingNvm(version);
    try {
      const output = await nodeApi.nvmUse(version);
      toast.success(
        output || t("nvm.switchSuccess", { defaultValue: "版本已切换" }),
      );
    } catch (error) {
      toast.error(String(error));
    } finally {
      setSwitchingNvm(null);
      void refreshNvm();
      void refreshStatus();
    }
  };

  const handleNvmInstall = async (version: string) => {
    if (nvmInstallingVer) return;
    setNvmInstallingVer(version);
    try {
      const output = await nodeApi.nvmInstall(version);
      toast.success(output, { duration: 6000 });
    } catch (error) {
      toast.error(String(error), { duration: 8000 });
    } finally {
      setNvmInstallingVer(null);
      void refreshNvm();
    }
  };

  const handleVersionClick = (item: NodeVersion) => {
    const existing = downloaded.find((file) => file.version === item.version);
    if (existing) {
      void handleInstall(existing);
    } else {
      void handleDownload(item.version);
    }
  };

  return (
    <div className="space-y-5 p-4 pt-6">
      {/* 当前状态卡片 */}
      <div className="glass-card flex items-center gap-3 rounded-xl p-4">
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
            status?.installed
              ? "bg-emerald-500/10"
              : "bg-orange-500/10",
          )}
        >
          <NodejsIcon size={24} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {status?.installed
              ? t("nodejs.currentVersion", {
                  version: status.version ?? "?",
                  defaultValue: `已安装 ${status.version ?? "?"}`,
                })
              : t("nodejs.notInstalledLong", {
                  defaultValue: "本机未检测到 Node.js",
                })}
          </p>
          {status?.installed && status.path && (
            <p className="truncate text-xs text-muted-foreground">
              {status.path}
            </p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void refreshStatus()}
          className="shrink-0"
        >
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          {t("nodejs.refresh", { defaultValue: "重新检测" })}
        </Button>
      </div>

      {/* nvm 管理（Node 已安装时显示） */}
      {status?.installed && (
        <div className="glass-card space-y-3 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                nvm?.installed
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
                  : "bg-muted text-muted-foreground",
              )}
            >
              <Layers className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                {nvm?.installed
                  ? t("nvm.installed", {
                      version: nvm.version ?? "?",
                      defaultValue: `nvm 已安装（${nvm.version ?? "?"}）`,
                    })
                  : t("nvm.notInstalled", { defaultValue: "nvm 未安装" })}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {nvm?.installed
                  ? (nvm.root ?? "")
                  : t("nvm.hintNotInstalled", {
                      defaultValue:
                        "nvm 可在同一台机器管理多个 Node 版本并随时切换",
                    })}
              </p>
            </div>
            {nvm?.installed && (
              <button
                type="button"
                onClick={() => {
                  void refreshNvm();
                  void refreshStatus();
                }}
                title={t("nvm.refresh", { defaultValue: "刷新 nvm 状态" })}
                className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            )}
            {!nvm?.installed && (
              <div className="flex shrink-0 items-center gap-2">
                <div className="flex items-center gap-1">
                  {(
                    [
                      {
                        id: "ghproxy",
                        label: t("nvm.mirrorFast", {
                          defaultValue: "加速镜像",
                        }),
                      },
                      {
                        id: "official",
                        label: t("nvm.mirrorOfficial", {
                          defaultValue: "GitHub",
                        }),
                      },
                    ] as Array<{ id: "official" | "ghproxy"; label: string }>
                  ).map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setNvmMirror(option.id)}
                      className={cn(
                        "rounded-md border px-2 py-0.5 text-xs transition-colors",
                        nvmMirror === option.id
                          ? "border-orange-500/50 bg-orange-500/10 text-foreground"
                          : "border-border text-muted-foreground hover:bg-muted/60",
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <Button
                  size="sm"
                  disabled={nvmInstalling}
                  onClick={() => void handleInstallNvm()}
                >
                  {nvmInstalling ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="mr-1 h-3.5 w-3.5" />
                  )}
                  {t("nvm.install", { defaultValue: "安装 nvm" })}
                </Button>
              </div>
            )}
          </div>

          {nvmInstalling && nvmProgress && (
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-orange-500 transition-all"
                style={{
                  width: nvmProgress.total
                    ? `${Math.min(100, (nvmProgress.done / nvmProgress.total) * 100)}%`
                    : "100%",
                }}
              />
            </div>
          )}

          {nvm?.installed && !nvm.envConfigured && (
            <div className="flex items-center gap-3 rounded-lg bg-orange-500/10 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-orange-600 dark:text-orange-300">
                  {t("nvm.envMissing", {
                    defaultValue: "nvm 环境变量未写入系统（NVM_HOME / PATH）",
                  })}
                </p>
                {envWriting && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {t("nvm.envWriting", { defaultValue: "正在写入…" })}
                  </p>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={envWriting}
                onClick={() => void handleWriteEnv()}
                className="shrink-0"
              >
                {t("nvm.writeEnv", { defaultValue: "一键写入环境变量" })}
              </Button>
            </div>
          )}

          {nvm?.installed &&
            status.installed &&
            !nvm.nodeManaged &&
            !nvm.versions.includes(
              (status.version ?? "").replace(/^v/, ""),
            ) && (
              <div className="flex items-center gap-3 rounded-lg bg-muted/60 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium">
                    {t("nvm.adoptPrompt", {
                      version: status.version ?? "",
                      defaultValue: `本机 Node（${status.version ?? ""}）尚未归属 nvm 管理`,
                    })}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={adopting}
                  onClick={() => void handleAdopt()}
                  className="shrink-0"
                >
                  {adopting ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  {t("nvm.adopt", { defaultValue: "一键归属 nvm" })}
                </Button>
              </div>
            )}

          {nvm?.installed && nvm.versions.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">
                {t("nvm.versionsTitle", {
                  defaultValue: "已安装的 Node 版本（点击切换）",
                })}
              </p>
              {(() => {
                const installedSet = new Set(
                  nvm.versions.map((v) => v.replace(/^v/, "")),
                );
                const available = versions
                  .map((v) => v.version.replace(/^v/, ""))
                  .filter((v) => !installedSet.has(v));
                return (
                  <div className="space-y-1.5">
                    <button
                      type="button"
                      onClick={() => setShowNvmInstall((open) => !open)}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      {showNvmInstall ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                      {t("nvm.getMore", {
                        defaultValue: "获取其它 Node 版本（经 nvm 安装）",
                      })}
                    </button>
                    {showNvmInstall && (
                      <div className="flex flex-wrap gap-2">
                        {available.length === 0 ? (
                          <span className="text-xs text-muted-foreground">
                            {t("nvm.allInstalled", {
                              defaultValue: "可获取的版本都已安装",
                            })}
                          </span>
                        ) : (
                          available.map((version) => (
                            <button
                              key={version}
                              type="button"
                              disabled={nvmInstallingVer !== null}
                              onClick={() => void handleNvmInstall(version)}
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-lg border border-dashed px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-orange-500/50 hover:bg-orange-500/5 hover:text-foreground",
                                nvmInstallingVer === version && "opacity-60",
                              )}
                            >
                              {nvmInstallingVer === version ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-orange-500" />
                              ) : (
                                <Download className="h-3.5 w-3.5" />
                              )}
                              v{version}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
              <div className="flex flex-wrap gap-2">
                {nvm.versions.map((version) => {
                  const active =
                    nvm.current === version ||
                    (nvm.current === null &&
                      (status.version ?? "").replace(/^v/, "") === version);
                  return (
                    <button
                      key={version}
                      type="button"
                      disabled={switchingNvm !== null}
                      onClick={() => void handleNvmUse(version)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                        active
                          ? "border-teal-500/60 bg-teal-500/10 text-foreground"
                          : "border-border text-muted-foreground hover:bg-muted/60",
                        switchingNvm === version && "opacity-60",
                      )}
                    >
                      {switchingNvm === version ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : active ? (
                        <Check className="h-3.5 w-3.5 text-teal-500" />
                      ) : null}
                      v{version}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 已安装时折叠下载区；未安装时直接展开 */}
      {status?.installed && (
        <div className="flex justify-center py-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowVersions((open) => !open)}
          >
            {showVersions ? (
              <ChevronUp className="mr-1.5 h-4 w-4" />
            ) : (
              <ChevronDown className="mr-1.5 h-4 w-4" />
            )}
            {showVersions
              ? t("nodejs.collapseVersions", { defaultValue: "收起版本列表" })
              : t("nodejs.replacePrompt", {
                  defaultValue: "需要替换其它的 Node.js 版本吗？",
                })}
          </Button>
        </div>
      )}
      {(!status?.installed || showVersions) && (
        <>
          {/* 镜像选择 */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {t("nodejs.mirrorLabel", { defaultValue: "下载源" })}
            </span>
            {(
              [
                {
                  id: "npmmirror",
                  label: t("nodejs.mirrorChina", { defaultValue: "国内镜像" }),
                },
                {
                  id: "official",
                  label: t("nodejs.mirrorOfficial", { defaultValue: "官方源" }),
                },
              ] as Array<{ id: NodeMirror; label: string }>
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setMirror(option.id)}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                  mirror === option.id
                    ? "border-orange-500/50 bg-orange-500/10 text-foreground"
                    : "border-border text-muted-foreground hover:bg-muted/60",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          {/* 已下载的安装包 */}
          {downloaded.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">
                {t("nodejs.downloadedGroup", {
                  defaultValue: "已下载的安装包",
                })}
              </h3>
              <div className="grid gap-2">
                {downloaded.map((file) => (
                  <div
                    key={file.path}
                    className="glass-card flex items-center gap-3 rounded-xl p-3.5"
                  >
                    <PackageCheck className="h-5 w-5 shrink-0 text-emerald-500" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        Node {file.version}
                        {status?.version === file.version && (
                          <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-teal-500/15 px-2 py-0.5 text-[11px] text-teal-600 dark:text-teal-300">
                            <Check className="h-3 w-3" />
                            {t("nodejs.current", { defaultValue: "当前" })}
                          </span>
                        )}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {file.path} · {formatBytes(file.size)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        size="sm"
                        onClick={() => void handleInstall(file)}
                      >
                        <Download className="mr-1 h-3.5 w-3.5" />
                        {t("nodejs.install", { defaultValue: "安装" })}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title={t("nodejs.reveal", {
                          defaultValue: "打开文件夹",
                        })}
                        onClick={() =>
                          void nodeApi
                            .revealInstaller(file.path)
                            .catch((e) => toast.error(String(e)))
                        }
                      >
                        <FolderOpen className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title={t("nodejs.deleteInstaller", {
                          defaultValue: "删除安装包",
                        })}
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => void handleDelete(file)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 版本列表 */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">
              {t("nodejs.ltsGroup", {
                defaultValue: "LTS 长期支持版（每条线的最新版）",
              })}
            </h3>
            {downloading && progress && (
              <div className="glass-card space-y-1.5 rounded-xl p-3.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {downloading}
                  </span>
                  <span>
                    {progress.total
                      ? `${formatBytes(progress.done)} / ${formatBytes(progress.total)}`
                      : formatBytes(progress.done)}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-orange-500 transition-all"
                    style={{
                      width: progress.total
                        ? `${Math.min(100, (progress.done / progress.total) * 100)}%`
                        : "100%",
                    }}
                  />
                </div>
              </div>
            )}
            <div className="grid gap-2">
              {listLoading ? (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("nodejs.loadingVersions", {
                    defaultValue: "获取版本列表…",
                  })}
                </div>
              ) : (
                versions.map((item) => {
                  const isCurrent = status?.version === item.version;
                  const isDownloaded = downloaded.some(
                    (file) => file.version === item.version,
                  );
                  return (
                    <div
                      key={item.version}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleVersionClick(item)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") handleVersionClick(item);
                      }}
                      className={cn(
                        "glass-card group flex cursor-pointer items-center gap-3 rounded-xl p-4 transition-all",
                        isCurrent
                          ? "ring-2 ring-teal-500/50 bg-teal-500/5"
                          : "hover:bg-muted/50",
                        downloading === item.version && "opacity-60",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted",
                          isCurrent && "bg-teal-500/15",
                        )}
                      >
                        {downloading === item.version ? (
                          <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
                        ) : (
                          <NodejsIcon size={20} />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">
                            Node {item.version}
                          </span>
                          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-300">
                            LTS
                          </span>
                          {isCurrent && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-teal-500/15 px-2 py-0.5 text-xs text-teal-600 dark:text-teal-300">
                              <Check className="h-3 w-3" />
                              {t("nodejs.current", { defaultValue: "当前" })}
                            </span>
                          )}
                          {isDownloaded && !isCurrent && (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                              {t("nodejs.downloaded", {
                                defaultValue: "已下载",
                              })}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {isDownloaded
                            ? t("nodejs.clickToInstall", {
                                defaultValue: "已下载，点击直接安装",
                              })
                            : t("nodejs.clickToDownload", {
                                defaultValue: "点击下载安装包",
                              })}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant={isCurrent ? "secondary" : "default"}
                        disabled={isCurrent || downloading !== null}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleVersionClick(item);
                        }}
                      >
                        {isCurrent
                          ? t("nodejs.inUse", { defaultValue: "使用中" })
                          : t("nodejs.install", { defaultValue: "安装" })}
                      </Button>
                    </div>
                  );
                })
              )}
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("nodejs.hint", {
                defaultValue:
                  "点击版本下载安装包（已下载的直接安装）；安装与清理在「已下载的安装包」区操作",
              })}
            </p>
          </section>
        </>
      )}
    </div>
  );
}
