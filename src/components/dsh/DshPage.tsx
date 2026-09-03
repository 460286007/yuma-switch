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
  Plus,
  Power,
  RefreshCw,
  Trash2,
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

interface HarnessKeyEntry {
  name: string;
  masked: string;
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
  // 多钥匙管理（页面底部）
  const [keys, setKeys] = useState<HarnessKeyEntry[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyValue, setNewKeyValue] = useState("");

  const refresh = useCallback(async () => {
    setBusy((b) => b ?? "refresh");
    try {
      const [s, k] = await Promise.all([
        invoke<HarnessStatus>("harness_status"),
        invoke<HarnessKeyEntry[]>("harness_list_keys").catch(() => []),
      ]);
      setStatus(s);
      setKeys(k);
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

  const addNamedKey = async () => {
    const name = newKeyName.trim();
    const value = newKeyValue.trim();
    if (!name || !value) return;
    try {
      const masked = await invoke<string>("harness_set_api_key", {
        apiKey: value,
        name,
      });
      toast.success(
        t("dsh.keyAdded", { defaultValue: "钥匙已添加" }),
        { description: `${name} = ${masked}` },
      );
      setNewKeyName("");
      setNewKeyValue("");
      await refresh();
    } catch (error) {
      toast.error(t("dsh.keyAddFailed", { defaultValue: "添加钥匙失败" }), {
        description: String(error),
      });
    }
  };

  const deleteKey = async (name: string) => {
    try {
      await invoke<boolean>("harness_delete_key", { name });
      toast.success(
        t("dsh.keyDeleted", { defaultValue: "已删除" }) + ` ${name}`,
      );
      await refresh();
    } catch (error) {
      toast.error(t("dsh.keyDeleteFailed", { defaultValue: "删除失败" }), {
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

      {/* 最底部：多钥匙管理 */}
      <div className="glass-card space-y-3 rounded-xl p-4">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">
            {t("dsh.keysSection", { defaultValue: "钥匙管理（多把）" })}
          </h3>
          <span className="text-[11px] text-muted-foreground">
            {keys.length}
          </span>
        </div>

        {keys.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {t("dsh.keysEmpty", {
              defaultValue: "还没有已存的钥匙。dsh settings.yaml 里 provider 的 apiKeyEnv 引用哪个名字，对应钥匙就会生效。",
            })}
          </p>
        ) : (
          <div className="space-y-1.5">
            {keys.map((k) => (
              <div
                key={k.name}
                className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/40 px-3 py-2"
              >
                <span className="shrink-0 font-mono text-xs font-medium">
                  {k.name}
                </span>
                <span className="flex-1 truncate font-mono text-xs text-muted-foreground">
                  {k.masked}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
                  aria-label={`${t("common.delete", { defaultValue: "删除" })} ${k.name}`}
                  onClick={() => void deleteKey(k.name)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* 添加表单（最底下，ZCode 供应商表单风格：标签在上、字段纵排） */}
        <div className="space-y-3 rounded-lg border border-border/60 bg-background/60 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label
                className="text-xs font-medium text-muted-foreground"
                htmlFor="dsh-new-key-name"
              >
                {t("dsh.keyNameLabel", { defaultValue: "钥匙名称" })}
              </label>
              <Input
                id="dsh-new-key-name"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="DEEPSEEK_API_KEY_2"
                className="font-mono"
              />
              <p className="text-[11px] text-muted-foreground">
                {t("dsh.keyNameHint", {
                  defaultValue: "环境变量名：字母/数字/下划线；dsh settings 的 apiKeyEnv 引用它",
                })}
              </p>
            </div>
            <div className="space-y-1.5">
              <label
                className="text-xs font-medium text-muted-foreground"
                htmlFor="dsh-new-key-value"
              >
                API Key
              </label>
              <Input
                id="dsh-new-key-value"
                type="password"
                value={newKeyValue}
                onChange={(e) => setNewKeyValue(e.target.value)}
                placeholder="sk-..."
                className="font-mono"
              />
              <p className="text-[11px] text-muted-foreground">
                {t("dsh.keyValueHint", {
                  defaultValue: "仅保存在本机 ~/.dsh/.credentials.yaml，DSH 即刻热生效",
                })}
              </p>
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={!newKeyName.trim() || !newKeyValue.trim()}
              onClick={() => void addNamedKey()}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              {t("dsh.addKey", { defaultValue: "添加钥匙" })}
            </Button>
          </div>
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
