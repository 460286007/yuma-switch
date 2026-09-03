import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { DeepSeekIcon } from "@/components/BrandIcons";
import { cn } from "@/lib/utils";

interface DshViewButtonProps {
  active: boolean;
  onToggle: () => void;
}

/**
 * 顶栏 DeepSeek Harness 入口（胶囊内，视图切换）。
 * 显示运行状态小绿点（30s 轮询端口）；点击进入 DSH 管理页，
 * 再点一次（高亮态）返回应用列表。
 */
export function DshViewButton({ active, onToggle }: DshViewButtonProps) {
  const { t } = useTranslation();
  const [running, setRunning] = useState(false);

  const checkRunning = useCallback(async () => {
    try {
      const s = await invoke<{ running: boolean }>("harness_status");
      setRunning(Boolean(s?.running));
    } catch {
      setRunning(false);
    }
  }, []);

  useEffect(() => {
    void checkRunning();
    const timer = setInterval(() => void checkRunning(), 30_000);
    return () => clearInterval(timer);
  }, [checkRunning, active]);

  const title = t("dsh.viewTitle", {
    defaultValue: "DeepSeek Harness（部署 / 钥匙 / 开关）",
  });

  return (
    <div className="inline-flex" style={{ WebkitAppRegion: "no-drag" } as any}>
      <button
        type="button"
        title={title}
        aria-label={title}
        aria-pressed={active}
        onClick={onToggle}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition-all duration-200",
          active
            ? "bg-background text-foreground shadow-sm ring-1 ring-border"
            : "text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5",
        )}
      >
        <DeepSeekIcon size={16} className="text-[#4D6BFE]" />
        <span>DSH</span>
        {running && (
          <span
            className="ml-0.5 h-1.5 w-1.5 rounded-full bg-emerald-500"
            title={t("dsh.running", { defaultValue: "后台运行中" })}
          />
        )}
      </button>
    </div>
  );
}
