import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { NodejsIcon } from "@/components/BrandIcons";
import { nodeApi, type NodeStatus } from "@/lib/api/nodejs";

interface NodeVersionSwitcherProps {
  active: boolean;
  onToggle: () => void;
}

/**
 * 顶栏 Node.js 入口按钮（Git 按钮左侧）。
 * 显示本机 Node 版本（未安装则橙色提示）；点击进入 Node.js 版本管理页，
 * 再点一次（高亮态）返回应用列表。
 */
export function NodeVersionSwitcher({
  active,
  onToggle,
}: NodeVersionSwitcherProps) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<NodeStatus | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await nodeApi.getStatus());
    } catch {
      setStatus({ installed: false, version: null, path: null });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, active]); // 每次进入/离开管理页后刷新按钮上的版本显示

  const label = status
    ? status.installed
      ? `Node ${status.version ?? "?"}`
      : t("nodejs.notInstalled", { defaultValue: "Node 未安装" })
    : "Node…";

  return (
    <div className="inline-flex" style={{ WebkitAppRegion: "no-drag" } as any}>
      <button
        type="button"
        title="Node.js"
        aria-label="Node.js"
        aria-pressed={active}
        onClick={onToggle}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-xl px-3 text-sm font-medium transition-all duration-200",
          active
            ? "bg-background text-foreground shadow-sm ring-1 ring-border"
            : status?.installed
              ? "bg-muted text-muted-foreground hover:bg-background/60 hover:text-foreground"
              : "bg-orange-500/10 text-orange-600 hover:bg-orange-500/20 dark:text-orange-300",
        )}
      >
        <NodejsIcon size={16} />
        <span>{label}</span>
      </button>
    </div>
  );
}
