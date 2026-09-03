import { useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { Loader2, Rocket } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 顶栏 DeepSeek Harness 启动按钮（胶囊内）。
 * 点击：已在跑则直接打开浏览器；首次启动自动安装依赖后常驻运行 dsh web
 * 并打开 http://127.0.0.1:3080。首次安装依赖可能需要几分钟。
 */
export function HarnessLauncherButton() {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  const handleLaunch = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await invoke<string>("launch_deepseek_harness");
    } catch (error) {
      toast.error(
        t("harness.launchFailed", { defaultValue: "启动 DeepSeek Harness 失败" }),
        { description: String(error), closeButton: true },
      );
    } finally {
      setBusy(false);
    }
  };

  const title = busy
    ? t("harness.starting", { defaultValue: "正在启动（首次需安装依赖，可能需要几分钟）…" })
    : t("harness.launch", { defaultValue: "启动 DeepSeek Harness（Web UI）" });

  return (
    <div className="inline-flex" style={{ WebkitAppRegion: "no-drag" } as any}>
      <button
        type="button"
        title={title}
        aria-label={title}
        onClick={handleLaunch}
        disabled={busy}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-all duration-200",
          busy
            ? "bg-background text-foreground shadow-sm ring-1 ring-border"
            : "text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5",
        )}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Rocket className="h-4 w-4" />
        )}
        <span>DSH</span>
      </button>
    </div>
  );
}
