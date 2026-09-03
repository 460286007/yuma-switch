import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import {
  CheckCircle2,
  Download,
  ExternalLink,
  KeyRound,
  Loader2,
  PackageCheck,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DeepSeekIcon } from "@/components/BrandIcons";
import {
  DshProviderDialog,
  type DshProviderCardData,
} from "@/components/dsh/DshProviderDialog";
import { cn } from "@/lib/utils";

interface HarnessStatus {
  installed: boolean;
  ready: boolean;
  version: string | null;
  running: boolean;
  nodeVersion: string | null;
  pnpmVersion: string | null;
  apiKeySet: boolean;
  apiKeyMasked: string | null;
}

interface DshPageProps {
  /** 前往 Node 管理页（Node 缺失时的引导） */
  onGoToNodePage: () => void;
}

/**
 * DeepSeek Harness 管理页。
 * 顶部：钥匙配置（DSH Web 内可配多种供应商方案，主钥匙在此管理）
 * 中部：Node/pnpm/依赖 环境检测 → 一键部署
 * 底部：开启 / 关闭（后台服务，完全无窗口）
 */
export function DshPage({ onGoToNodePage }: DshPageProps) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<HarnessStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // refresh | deploy | toggle
  // 供应商与钥匙（页面底部）
  const [providers, setProviders] = useState<DshProviderCardData[]>([]);
  const [providerDialogOpen, setProviderDialogOpen] = useState(false);
  const [editingProvider, setEditingProvider] =
    useState<DshProviderCardData | null>(null);

  const refresh = useCallback(async () => {
    setBusy((b) => b ?? "refresh");
    try {
      const [s, p] = await Promise.all([
        invoke<HarnessStatus>("harness_status"),
        invoke<DshProviderCardData[]>("dsh_list_providers").catch(() => []),
      ]);
      setStatus(s);
      setProviders(p);
    } catch {
      setStatus(null);
    } finally {
      setBusy((b) => (b === "refresh" ? null : b));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 30_000);
    return () => clearInterval(timer);
  }, [refresh]);

  const deploy = async () => {
    if (busy) return;
    setBusy("deploy");
    try {
      const report = await invoke<string>("harness_deploy");
      toast.success(
        t("dsh.deployDone", { defaultValue: "DSH 部署完成" }),
        { description: report, closeButton: true },
      );
      await refresh();
    } catch (error) {
      toast.error(
        t("dsh.deployFailed", { defaultValue: "部署失败" }),
        { description: String(error), closeButton: true, duration: 10000 },
      );
    } finally {
      setBusy(null);
    }
  };

  const toggle = async () => {
    if (busy || !status) return;
    setBusy("toggle");
    try {
      if (status.running) {
        await invoke<boolean>("harness_stop");
        toast.success(t("dsh.stopped", { defaultValue: "DSH 已停止" }));
      } else {
        await invoke<string>("launch_deepseek_harness");
        toast.info(
          t("dsh.starting", {
            defaultValue:
              "正在后台启动（首次需安装依赖，可能几分钟），就绪后自动打开浏览器",
          }),
          { duration: 8000 },
        );
      }
      await refresh();
    } catch (error) {
      toast.error(t("dsh.toggleFailed", { defaultValue: "操作失败" }), {
        description: String(error),
        closeButton: true,
      });
    } finally {
      setBusy(null);
    }
  };

  const enableProvider = async (id: string) => {
    try {
      await invoke<boolean>("dsh_enable_provider", { id });
      toast.success(
        t("dsh.providerEnabled", { defaultValue: "已切换默认供应商" }),
        { description: id },
      );
      await refresh();
    } catch (error) {
      toast.error(
        t("dsh.providerEnableFailed", { defaultValue: "切换失败" }),
        { description: String(error) },
      );
    }
  };

  const deleteProvider = async (id: string) => {
    try {
      await invoke<boolean>("dsh_delete_provider", { id });
      toast.success(t("dsh.providerDeleted", { defaultValue: "已删除" }), {
        description: id,
      });
      await refresh();
    } catch (error) {
      toast.error(t("dsh.providerDeleteFailed", { defaultValue: "删除失败" }), {
        description: String(error),
      });
    }
  };

  const nodeMissing = status !== null && status.nodeVersion === null;
  const pnpmMissing = status !== null && status.pnpmVersion === null;
  const needDeploy = status !== null && (!status.ready || pnpmMissing);
  const canToggle = status !== null && status.ready && !needDeploy;

  return (
    <div className="space-y-5 p-4 pt-6">
      {/* 中部：环境检测 + 一键部署 */}
      <div className="glass-card space-y-3 rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DeepSeekIcon size={22} className="text-[#4D6BFE]" />
            <h3 className="text-sm font-semibold">
              {t("dsh.envSection", { defaultValue: "环境与部署" })}
            </h3>
            {status?.version && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                v{status.version}
              </span>
            )}
          </div>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy === "refresh"}
            onClick={() => void refresh()}
            title={t("tools.refresh", { defaultValue: "重新检测" })}
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", busy === "refresh" && "animate-spin")}
            />
          </Button>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <CheckItem
            ok={status?.nodeVersion != null}
            label="Node.js"
            value={status?.nodeVersion ?? t("dsh.notDetected", { defaultValue: "未检测到" })}
          />
          <CheckItem
            ok={status?.pnpmVersion != null}
            label="pnpm"
            value={status?.pnpmVersion ?? t("dsh.notDetected", { defaultValue: "未检测到（部署时自动安装）" })}
          />
          <CheckItem
            ok={status?.ready ?? false}
            label={t("dsh.deps", { defaultValue: "依赖" })}
            value={
              status?.ready
                ? t("dsh.depsReady", { defaultValue: "已安装" })
                : t("dsh.depsMissing", { defaultValue: "待部署" })
            }
          />
        </div>

        {nodeMissing ? (
          <div className="flex flex-col gap-2 rounded-lg border border-orange-500/30 bg-orange-500/10 p-3 sm:flex-row sm:items-center">
            <p className="flex-1 text-xs text-orange-700 dark:text-orange-300">
              {t("dsh.nodeMissingHint", {
                defaultValue: "DSH 需要 Node.js ≥ 20。点击前往 Node 页面下载安装，装好后回来点「刷新」。",
              })}
            </p>
            <Button size="sm" variant="outline" onClick={onGoToNodePage}>
              <Download className="mr-1 h-3.5 w-3.5" />
              {t("dsh.goNodePage", { defaultValue: "前往安装 Node" })}
            </Button>
          </div>
        ) : needDeploy ? (
          <Button
            className="w-full gap-2"
            disabled={busy !== null || !status?.installed}
            onClick={() => void deploy()}
          >
            {busy === "deploy" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <PackageCheck className="h-4 w-4" />
            )}
            {busy === "deploy"
              ? t("dsh.deploying", { defaultValue: "正在部署（安装 pnpm / 下载依赖）…" })
              : t("dsh.deploy", { defaultValue: "一键部署" })}
          </Button>
        ) : null}
      </div>

      {/* 底部：开启 / 关闭 */}
      <div className="glass-card flex flex-col gap-3 rounded-xl p-4 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center gap-2">
          {status?.running ? (
            <>
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              <div>
                <p className="text-sm font-medium">
                  {t("dsh.running", { defaultValue: "DSH 正在后台运行" })}
                </p>
                <p className="text-xs text-muted-foreground">http://127.0.0.1:3080</p>
              </div>
            </>
          ) : (
            <>
              <Power className="h-5 w-5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {t("dsh.notRunning", { defaultValue: "DSH 未运行" })}
              </p>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {status?.running && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                void invoke(
                  "open_external",
                  { url: "http://127.0.0.1:3080" },
                )
              }
            >
              <ExternalLink className="mr-1 h-3.5 w-3.5" />
              {t("dsh.openWeb", { defaultValue: "打开页面" })}
            </Button>
          )}
          <Button
            size="sm"
            variant={status?.running ? "destructive" : "default"}
            disabled={busy !== null || !canToggle}
            onClick={() => void toggle()}
          >
            {busy === "toggle" ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Power className="mr-1 h-3.5 w-3.5" />
            )}
            {status?.running
              ? t("dsh.stop", { defaultValue: "一键关闭" })
              : t("dsh.start", { defaultValue: "开启 DSH" })}
          </Button>
        </div>
      </div>

      {/* 最底部：供应商与钥匙管理（Claude 供应商页同款） */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">
              {t("dsh.providersSection", { defaultValue: "供应商与钥匙" })}
            </h3>
            <span className="text-[11px] text-muted-foreground">
              {providers.length}
            </span>
          </div>
          {/* 橙色圆形 + 按钮（与供应商页同款） */}
          <Button
            size="icon"
            className="bg-orange-500 hover:bg-orange-600 dark:bg-orange-500 dark:hover:bg-orange-600 text-white shadow-lg shadow-orange-500/30 rounded-full w-8 h-8"
            aria-label={t("dsh.addProvider", { defaultValue: "添加 DSH 供应商" })}
            title={t("dsh.addProvider", { defaultValue: "添加 DSH 供应商" })}
            onClick={() => {
              setEditingProvider(null);
              setProviderDialogOpen(true);
            }}
          >
            <Plus className="w-5 h-5" />
          </Button>
        </div>

        {providers.length === 0 ? (
          <div className="glass-card rounded-xl p-8 text-center">
            <p className="text-sm text-muted-foreground">
              {t("dsh.providersEmpty", {
                defaultValue:
                  "还没有供应商。点右上角 + 添加：选择厂商 → 填请求地址和 API Key 即可。",
              })}
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {providers.map((p) => (
              <div
                key={p.id}
                className={cn(
                  "glass-card flex flex-col gap-2 rounded-xl p-4 sm:flex-row sm:items-center",
                  p.active && "ring-2 ring-[#4D6BFE]/40 bg-[#4D6BFE]/5",
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <DeepSeekIcon size={14} className="shrink-0 text-[#4D6BFE]" />
                    <span className="truncate text-sm font-medium">{p.id}</span>
                    {p.active && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#4D6BFE]/15 px-2 py-0.5 text-[11px] text-[#4D6BFE]">
                        <CheckCircle2 className="h-3 w-3" />
                        {t("gitAccount.current", { defaultValue: "当前" })}
                      </span>
                    )}
                  </div>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {p.baseUrl}
                  </p>
                  <p className="truncate text-xs text-muted-foreground/80">
                    {p.keyMasked
                      ? `🔑 ${p.keyMasked}`
                      : t("dsh.keyNotSet", { defaultValue: "未配置钥匙" })}
                    {p.modelIds.length > 0 && ` · ${p.modelIds.join(", ")}`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {p.officialUrl && (
                    <Button
                      size="sm"
                      variant="ghost"
                      title={p.officialUrl}
                      onClick={() =>
                        void invoke("open_external", { url: p.officialUrl! })
                      }
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant={p.active ? "secondary" : "default"}
                    disabled={p.active}
                    onClick={() => void enableProvider(p.id)}
                  >
                    {p.active
                      ? t("gitAccount.inUse", { defaultValue: "使用中" })
                      : t("gitAccount.use", { defaultValue: "使用" })}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={t("common.edit", { defaultValue: "编辑" })}
                    onClick={() => {
                      setEditingProvider(p);
                      setProviderDialogOpen(true);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-muted-foreground hover:text-destructive"
                    aria-label={`${t("common.delete", { defaultValue: "删除" })} ${p.id}`}
                    onClick={() => void deleteProvider(p.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <DshProviderDialog
        isOpen={providerDialogOpen}
        editing={editingProvider}
        onClose={() => setProviderDialogOpen(false)}
        onSaved={() => void refresh()}
      />
    </div>
  );
}

function CheckItem({
  ok,
  label,
  value,
}: {
  ok: boolean | undefined;
  label: string;
  value: string;
}) {
  const pending = ok === undefined;
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/40 px-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          "truncate text-xs font-medium",
          pending
            ? "text-muted-foreground"
            : ok
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-orange-600 dark:text-orange-400",
        )}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

export default DshPage;
