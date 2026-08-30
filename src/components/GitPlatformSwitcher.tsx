import { useTranslation } from "react-i18next";
import { ProviderIcon } from "@/components/ProviderIcon";
import { cn } from "@/lib/utils";

interface GitPlatformSwitcherProps {
  active: boolean;
  onToggle: () => void;
}

/**
 * 顶栏 Git 入口（应用切换器左侧）。
 * 单按钮：Git 官方标 + "Git"；点击进入统一的 Git 账号页
 * （Gitee / GitHub 账号都在其中），再点一次返回应用列表。
 */
export function GitPlatformSwitcher({
  active,
  onToggle,
}: GitPlatformSwitcherProps) {
  const { t } = useTranslation();

  return (
    <div className="inline-flex" style={{ WebkitAppRegion: "no-drag" } as any}>
      <button
        type="button"
        title={t("gitAccount.switcherLabel", { defaultValue: "Git 平台" })}
        aria-label={t("gitAccount.switcherLabel", { defaultValue: "Git 平台" })}
        aria-pressed={active}
        onClick={onToggle}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-xl px-3 text-sm font-medium transition-all duration-200",
          active
            ? "bg-background text-foreground shadow-sm ring-1 ring-border"
            : "bg-muted text-muted-foreground hover:bg-background/60 hover:text-foreground",
        )}
      >
        <ProviderIcon icon="git" name="Git" size={16} />
        <span>Git</span>
      </button>
    </div>
  );
}
