import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { KeyRound, Loader2, Power, Rocket } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface HarnessStatus {
  installed: boolean;
  ready: boolean;
  version: string | null;
  running: boolean;
  nodeVersion: string | null;
  apiKeySet: boolean;
  apiKeyMasked: string | null;
}

/**
 * 顶栏 DeepSeek Harness 开关 + 钥匙管理（胶囊内）。
 * - 开关：后台启动/停止 dsh web（完全无窗口，日志 %TEMP%\yuma-dsh-web.log）
 * - 钥匙：写入 ~/.dsh/.credentials.yaml，dsh 热生效且 Models 页可见
 */
export function HarnessLauncherButton() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<HarnessStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setStatus(await invoke<HarnessStatus>("harness_status"));
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
    // 30s 轮询运行状态（轻量：一次端口探测 + node --version）
    const timer = setInterval(() => void refresh(), 30_000);
    return () => clearInterval(timer);
  }, [refresh]);

  const toggle = async () => {
    if (busy || !status) return;
    const wasRunning = status.running;
    setBusy(true);
    try {
      if (wasRunning) {
        await invoke<boolean>("harness_stop");
        toast.success(
          t("harness.stopped", { defaultValue: "DeepSeek Harness 已停止" }),
        );
      } else {
        if (!status.installed) {
          toast.error(
            t("harness.missing", { defaultValue: "未找到内置 harness 目录" }),
          );
          return;
        }
        if (!status.nodeVersion) {
          toast.error(
            t("harness.noNode", {
              defaultValue:
                "未检测到 Node.js，无法启动（可在顶栏 Node 入口安装）",
            }),
          );
          return;
        }
        toast.info(
          t("harness.starting", {
            defaultValue: "正在后台启动（首次需安装依赖，可能需要几分钟）…",
          }),
        );
        await invoke<string>("launch_deepseek_harness");
      }
    } catch (error) {
      toast.error(
        t("harness.toggleFailed", { defaultValue: "操作 DeepSeek Harness 失败" }),
        { description: String(error), closeButton: true },
      );
    } finally {
      setBusy(false);
      void refresh();
    }
  };

  const running = status?.running ?? false;

  return (
    <>
      <div
        className="inline-flex items-center gap-0.5"
        style={{ WebkitAppRegion: "no-drag" } as any}
      >
        <button
          type="button"
          title={
            running
              ? t("harness.stopTitle", { defaultValue: "停止 DeepSeek Harness（后台服务）" })
              : t("harness.startTitle", {
                  defaultValue: "后台启动 DeepSeek Harness 并打开 Web UI",
                })
          }
          aria-label="DeepSeek Harness toggle"
          onClick={toggle}
          disabled={busy}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-all duration-200",
            running
              ? "bg-background text-foreground shadow-sm ring-1 ring-border"
              : "text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5",
          )}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : running ? (
            <Power className="h-4 w-4 text-emerald-500" />
          ) : (
            <Rocket className="h-4 w-4" />
          )}
          <span>DSH</span>
          {running && (
            <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />
          )}
        </button>
        <button
          type="button"
          title={t("harness.keyTitle", { defaultValue: "管理 DeepSeek Harness API 钥匙" })}
          aria-label="DeepSeek Harness API key"
          onClick={() => setKeyDialogOpen(true)}
          className={cn(
            "inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors",
            status?.apiKeySet
              ? "text-emerald-600 hover:bg-black/5 dark:text-emerald-400 dark:hover:bg-white/5"
              : "text-orange-500 hover:bg-orange-500/10",
          )}
        >
          <KeyRound className="h-4 w-4" />
        </button>
      </div>

      {keyDialogOpen && (
        <HarnessKeyDialog
          current={status?.apiKeyMasked ?? null}
          nodeVersion={status?.nodeVersion ?? null}
          onClose={() => setKeyDialogOpen(false)}
          onSaved={() => void refresh()}
        />
      )}
    </>
  );
}

function HarnessKeyDialog({
  current,
  nodeVersion,
  onClose,
  onSaved,
}: {
  current: string | null;
  nodeVersion: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const masked = await invoke<string>("harness_set_api_key", {
        apiKey: key,
      });
      toast.success(
        t("harness.keySaved", { defaultValue: "钥匙已保存，Harness 即刻生效" }),
        { description: masked },
      );
      onSaved();
      onClose();
    } catch (error) {
      toast.error(t("harness.keySaveFailed", { defaultValue: "保存钥匙失败" }), {
        description: String(error),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h3 className="text-base font-semibold">
            {t("harness.keyDialogTitle", {
              defaultValue: "DeepSeek Harness API 钥匙",
            })}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("harness.keyDialogHint", {
              defaultValue:
                "保存到 ~/.dsh/.credentials.yaml，Harness 即刻热生效，并可在其 Models 设置页查看已存储的钥匙。",
            })}
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground" htmlFor="dsh-api-key">
            DEEPSEEK_API_KEY
          </label>
          <Input
            id="dsh-api-key"
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={
              current
                ? t("harness.keyPlaceholderSet", {
                    defaultValue: `当前：${current}，输入新值覆盖`,
                  })
                : "sk-..."
            }
          />
          {current && (
            <p className="text-[11px] text-muted-foreground">
              {t("harness.keyCurrent", { defaultValue: "当前已配置" })}:{" "}
              <span className="font-mono">{current}</span>
            </p>
          )}
          {nodeVersion && (
            <p className="text-[11px] text-muted-foreground">
              Node: <span className="font-mono">{nodeVersion}</span>
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t("common.cancel", { defaultValue: "取消" })}
          </Button>
          <Button
            size="sm"
            disabled={saving || key.trim().length === 0}
            onClick={() => void save()}
          >
            {saving && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
            {t("common.save", { defaultValue: "保存" })}
          </Button>
        </div>
      </div>
    </div>
  );
}
