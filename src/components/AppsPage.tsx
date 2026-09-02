import { useTranslation } from "react-i18next";
import type { AppId } from "@/lib/api";
import type { VisibleApps } from "@/types";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import { APP_IDS } from "@/config/appConfig";
import { AppGlyph, APP_DISPLAY_NAME } from "@/components/appGlyphs";

interface AppsPageProps {
  activeApp: AppId;
  visibleApps?: VisibleApps;
  onSelect: (app: AppId) => void;
}

/**
 * 应用列表页：所有可见应用以卡片网格展示，
 * 点击卡片切换当前应用并返回该应用的供应商列表。
 */
export function AppsPage({
  activeApp,
  visibleApps,
  onSelect,
}: AppsPageProps) {
  const { t } = useTranslation();

  const appsToShow = APP_IDS.filter((app) => {
    if (!visibleApps) return true;
    return visibleApps[app];
  });

  return (
    <div className="space-y-5 p-4 pt-6">
      <div>
        <h2 className="text-lg font-semibold">
          {t("appsPage.title", { defaultValue: "应用列表" })}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("appsPage.description", {
            defaultValue: "点击应用进入其供应商管理页面",
          })}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {appsToShow.map((app) => {
          const isActive = app === activeApp;
          return (
            <button
              key={app}
              type="button"
              onClick={() => onSelect(app)}
              aria-pressed={isActive}
              className={cn(
                "glass-card group flex flex-col items-center gap-3 rounded-xl p-5 transition-all",
                isActive
                  ? "ring-2 ring-teal-500/50 bg-teal-500/5"
                  : "hover:bg-muted/50",
              )}
            >
              <span
                className={cn(
                  "flex h-12 w-12 items-center justify-center rounded-xl bg-muted",
                  isActive && "bg-teal-500/15",
                )}
              >
                <AppGlyph app={app} isActive={false} size={28} />
              </span>
              <span className="flex items-center gap-1.5 text-sm font-medium">
                {APP_DISPLAY_NAME[app]}
                {isActive && <Check className="h-3.5 w-3.5 text-teal-500" />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
