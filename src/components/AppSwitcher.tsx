import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";

interface AppSwitcherProps {
  active: boolean;
  onToggle: () => void;
}

/**
 * 顶栏「AI CLI」入口按钮（Node / Git 右侧）。
 * 点击进入应用列表页，再点一次（高亮态）返回当前应用的供应商页。
 */
export function AppSwitcher({ active, onToggle }: AppSwitcherProps) {
  const { t } = useTranslation();
  return (
    <div
      className="inline-flex"
      style={{ WebkitAppRegion: "no-drag" } as any}
    >
      <button
        type="button"
        title="AI CLI"
        aria-label="AI CLI"
        aria-pressed={active}
        onClick={onToggle}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-xl px-3 text-sm font-medium transition-all duration-200",
          active
            ? "bg-background text-foreground shadow-sm ring-1 ring-border"
            : "bg-muted text-muted-foreground hover:bg-background/60 hover:text-foreground",
        )}
      >
        <Sparkles className="h-4 w-4 text-violet-500" />
        <span>{t("appsPage.buttonLabel", { defaultValue: "AI CLI" })}</span>
      </button>
    </div>
  );
}
