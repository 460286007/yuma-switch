import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  Download,
  Loader2,
  RefreshCw,
  ShieldAlert,
  TerminalSquare,
  Trash2,
  XCircle,
} from "lucide-react";
import type { AppId } from "@/lib/api";
import { settingsApi } from "@/lib/api/settings";
import { devtoolsApi } from "@/lib/api/devtools";
import { ConfirmDialog } from "@/components/ConfirmDialog";

interface ToolManagementBarProps {
  appId: AppId;
}

/** AppId → 后端工具生命周期系统的 toolName（null 表示不适用） */
const TOOL_NAME: Partial<Record<AppId, string>> = {
  zcode: "zcode",
  claude: "claude",
  codex: "codex",
  gemini: "gemini",
  grokbuild: "grok",
  opencode: "opencode",
  openclaw: "openclaw",
  hermes: "hermes",
  pi: "pi",
};

/** 走后端生命周期安装/更新链的工具（zcode 非 npm 分发，仅状态+注册） */
const LIFECYCLE_TOOLS = new Set<string>([
  "claude",
  "codex",
  "gemini",
  "grok",
  "opencode",
  "openclaw",
  "hermes",
  "pi",
]);

/** 是否支持 npm 卸载（zcode 等非 npm 分发的工具不支持） */
const UNINSTALLABLE = new Set<AppId>([
  "claude",
  "codex",
  "gemini",
  "grokbuild",
  "opencode",
  "openclaw",
  "pi",
]);

// 模块级 TTL 缓存：探测要跑 --version 子进程 + npm 网络查最新版，代价高；
// 设置页 Tab 切换会重挂本组件，每次进页面都全量探测纯属浪费（与 AboutSection
// 的 toolVersionsCache 同思路）。手动「重新检测」与安装/卸载/注册后走 force。
const TOOL_BAR_CACHE_TTL_MS = 10 * 60 * 1000;
interface ToolBarCacheEntry {
  version: string | null;
  latest: string | null;
  installed: boolean | null;
  cmdAvailable: boolean | null;
  at: number;
}
const toolBarCache = new Map<string, ToolBarCacheEntry>();

/**
 * 应用页顶部的工具管理条：安装状态检测 + 安装/更新/卸载 +
 * 命令注册表（PATH）可用性检查与一键注册。
 */
export function ToolManagementBar({ appId }: ToolManagementBarProps) {
  const { t } = useTranslation();
  const toolName = TOOL_NAME[appId];
  const [version, setVersion] = useState<string | null>(null);
  const [latest, setLatest] = useState<string | null>(null);
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [cmdAvailable, setCmdAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmUninstall, setConfirmUninstall] = useState(false);

  const hydrate = useCallback((entry: ToolBarCacheEntry) => {
    setVersion(entry.version);
    setLatest(entry.latest);
    setInstalled(entry.installed);
    setCmdAvailable(entry.cmdAvailable);
  }, []);

  const refresh = useCallback(
    async (force = false) => {
      if (!toolName) return;
      const cached = toolBarCache.get(appId);
      if (!force && cached && Date.now() - cached.at < TOOL_BAR_CACHE_TTL_MS) {
        hydrate(cached);
        return;
      }
      setBusy("refresh");
      try {
        const [versions, cmd] = await Promise.all([
          LIFECYCLE_TOOLS.has(toolName)
            ? settingsApi.getToolVersions([toolName]).catch(() => [])
            : Promise.resolve([]),
          devtoolsApi.checkCommand(appId),
        ]);
        const info = versions.find((v) => v.name === toolName);
        const nextVersion = info?.version ?? cmd.version ?? null;
        const nextLatest = info?.latest_version ?? null;
        const nextInstalled = LIFECYCLE_TOOLS.has(toolName)
          ? Boolean(info?.version) || Boolean(cmd.available)
          : cmd.available;
        setVersion(nextVersion);
        setLatest(nextLatest);
        setInstalled(nextInstalled);
        setCmdAvailable(cmd.available);
        toolBarCache.set(appId, {
          version: nextVersion,
          latest: nextLatest,
          installed: nextInstalled,
          cmdAvailable: cmd.available,
          at: Date.now(),
        });
      } catch {
        setInstalled(null);
        setCmdAvailable(null);
      } finally {
        setBusy(null);
      }
    },
    [appId, toolName, hydrate],
  );

  useEffect(() => {
    const cached = toolBarCache.get(appId);
    if (cached && Date.now() - cached.at < TOOL_BAR_CACHE_TTL_MS) {
      hydrate(cached);
      return;
    }
    setVersion(null);
    setLatest(null);
    setInstalled(null);
    setCmdAvailable(null);
    void refresh();
  }, [appId, refresh, hydrate]);

  if (!toolName) return null; // claude-desktop / zcode 等不适用

  const hasUpdate = installed && latest && version && latest !== version;

  const runLifecycle = async (action: "install" | "update") => {
    if (busy) return;
    setBusy(action);
    try {
      await settingsApi.runToolLifecycleAction([toolName], action);
      toast.success(
        t(`tools.${action}Done`, {
          defaultValue: action === "install" ? "安装完成" : "更新完成",
        }),
      );
    } catch (error) {
      toast.error(String(error), { duration: 8000 });
    } finally {
      await refresh(true);
    }
  };

  const handleUninstall = async () => {
    setConfirmUninstall(false);
    if (busy) return;
    setBusy("uninstall");
    try {
      const message = await devtoolsApi.uninstall(appId);
      toast.success(message);
    } catch (error) {
      toast.error(String(error), { duration: 8000 });
    } finally {
      await refresh(true);
    }
  };

  const handleRegister = async () => {
    if (busy) return;
    setBusy("register");
    try {
      const message = await devtoolsApi.registerCommand(appId);
      toast.success(message, { duration: 6000 });
    } catch (error) {
      toast.error(String(error));
    } finally {
      await refresh(true);
    }
  };

  return (
    <div className="glass-card flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl px-4 py-2.5 text-sm">
      {/* 安装状态 */}
      {busy === "refresh" ? (
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("tools.checking", { defaultValue: "检测工具状态…" })}
        </span>
      ) : installed === null ? (
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <TerminalSquare className="h-4 w-4" />
          {t("tools.statusUnknown", { defaultValue: "工具状态未知" })}
        </span>
      ) : installed ? (
        <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4" />
          {t("tools.installedAs", {
            version: version ?? "?",
            defaultValue: `已安装 ${version ?? ""}`,
          })}
          {hasUpdate && (
            <span className="ml-1 rounded-full bg-orange-500/15 px-2 py-0.5 text-[11px] text-orange-600 dark:text-orange-300">
              {t("tools.upgradable", {
                latest,
                defaultValue: `可更新到 ${latest}`,
              })}
            </span>
          )}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <XCircle className="h-4 w-4" />
          {t("tools.notInstalled", { defaultValue: "未安装" })}
        </span>
      )}

      {/* 命令可用性（注册表 PATH） */}
      {cmdAvailable === false && (
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500/10 px-2 py-1 text-xs text-orange-600 dark:text-orange-300">
          <ShieldAlert className="h-3.5 w-3.5" />
          {t("tools.cmdNotRegistered", {
            defaultValue: "命令未注册到系统 PATH",
          })}
        </span>
      )}

      <span className="flex-1" />

      {/* 操作按钮 */}
      <Button
        variant="ghost"
        size="sm"
        disabled={busy !== null}
        onClick={() => void refresh(true)}
        title={t("tools.refresh", { defaultValue: "重新检测" })}
      >
        <RefreshCw className="h-3.5 w-3.5" />
      </Button>
      {cmdAvailable === false && (
        <Button
          variant="outline"
          size="sm"
          disabled={busy !== null}
          onClick={() => void handleRegister()}
        >
          {busy === "register" ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <ShieldAlert className="mr-1 h-3.5 w-3.5" />
          )}
          {t("tools.register", { defaultValue: "一键注册" })}
        </Button>
      )}
      {installed === false && LIFECYCLE_TOOLS.has(toolName) && (
        <Button
          size="sm"
          disabled={busy !== null}
          onClick={() => void runLifecycle("install")}
        >
          {busy === "install" ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="mr-1 h-3.5 w-3.5" />
          )}
          {t("tools.install", { defaultValue: "一键安装" })}
        </Button>
      )}
      {installed && hasUpdate && LIFECYCLE_TOOLS.has(toolName) && (
        <Button
          size="sm"
          disabled={busy !== null}
          onClick={() => void runLifecycle("update")}
        >
          {busy === "update" ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="mr-1 h-3.5 w-3.5" />
          )}
          {t("tools.update", { defaultValue: "一键更新" })}
        </Button>
      )}
      {installed && UNINSTALLABLE.has(appId) && (
        <Button
          variant="ghost"
          size="sm"
          disabled={busy !== null}
          className={cn("text-muted-foreground hover:text-destructive")}
          onClick={() => setConfirmUninstall(true)}
        >
          {busy === "uninstall" ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="mr-1 h-3.5 w-3.5" />
          )}
          {t("tools.uninstall", { defaultValue: "卸载" })}
        </Button>
      )}

      <ConfirmDialog
        isOpen={confirmUninstall}
        title={t("tools.uninstallTitle", { defaultValue: "卸载工具" })}
        message={t("tools.uninstallConfirm", {
          defaultValue:
            "确定要卸载该 CLI 工具吗？已保存的供应商配置不受影响，可随时重新安装。",
        })}
        onConfirm={() => void handleUninstall()}
        onCancel={() => setConfirmUninstall(false)}
      />
    </div>
  );
}
