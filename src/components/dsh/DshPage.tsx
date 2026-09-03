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
  Power,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DeepSeekIcon } from "@/components/BrandIcons";
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
  const [apiKey, setApiKey] = useState("");

  const refresh = useCallback(async () => {
    setBusy((b) => b ?? "refresh");
    try {
      setStatus(await invoke<HarnessStatus>("harness_status"));
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
        toast.info(
          t("dsh.starting", { defaultValue: "正在后台启动 DSH…" }),
        );
        await invoke<string>("launch_deepseek_harness");
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

  const saveKey = async () => {
    const key = apiKey.trim();
    if (!key) return;
    try {
      const masked = await invoke<string>("harness_set_api_key", {
        apiKey: key,
      });
      toast.success(
        t("dsh.keySaved", { defaultValue: "钥匙已保存，DSH 即刻生效" }),
        { description: masked },
      );
      setApiKey("");
      await refresh();
    } catch (error) {
      toast.error(t("dsh.keySaveFailed", { defaultValue: "保存钥匙失败" }), {
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
      {/* 顶部：钥匙配置 */}
      <div className="glass-card space-y-3 rounded-xl p-4">
        <div className="flex items-center gap-2">
          <KeyRound
            className={cn(
              "h-4 w-4",
              status?.apiKeySet
                ? "text-emerald-500"
                : "text-orange-500",
            )}
          />
          <h3 className="text-sm font-semibold">
            {t("dsh.keySection", { defaultValue: "API 钥匙配置" })}
          </h3>
          {status?.apiKeySet && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
              {t("dsh.keyCurrent", { defaultValue: "已配置" })}{" "}
              <span className="font-mono">{status.apiKeyMasked}</span>
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="DEEPSEEK_API_KEY (sk-...)"
            className="font-mono"
          />
          <Button
            className="shrink-0"
            disabled={apiKey.trim().length === 0}
            onClick={() => void saveKey()}
          >
            {t("common.save", { defaultValue: "保存" })}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("dsh.keyHint", {
            defaultValue:
              "主钥匙即刻写入 DSH 并热生效；DSH Web 内的 Models 设置页还提供更多供应商与钥匙方案。",
          })}
        </p>
      </div>

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
