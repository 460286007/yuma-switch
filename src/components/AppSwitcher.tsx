import { useTranslation } from "react-i18next";
import type { AppId } from "@/lib/api";
import type { VisibleApps } from "@/types";
import { ProviderIcon } from "@/components/ProviderIcon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, Monitor, Terminal } from "lucide-react";
import { APP_IDS } from "@/config/appConfig";

const APP_BADGE_ICON: Partial<
  Record<AppId, { icon: typeof Terminal; offsetY?: number }>
> = {
  claude: { icon: Terminal },
  "claude-desktop": { icon: Monitor, offsetY: 0.5 },
};

interface AppSwitcherProps {
  activeApp: AppId;
  onSwitch: (app: AppId) => void;
  visibleApps?: VisibleApps;
}

const STORAGE_KEY = "cc-switch-last-app";

const APP_ICON_NAME: Record<AppId, string> = {
  claude: "claude",
  "claude-desktop": "claude",
  codex: "openai",
  gemini: "gemini",
  grokbuild: "grok",
  zcode: "zai",
  opencode: "opencode",
  openclaw: "openclaw",
  hermes: "hermes",
  pi: "pi",
};

const APP_DISPLAY_NAME: Record<AppId, string> = {
  claude: "Claude Code",
  "claude-desktop": "Claude Desktop",
  codex: "Codex",
  gemini: "Gemini",
  grokbuild: "Grok Build",
  zcode: "ZCode",
  opencode: "OpenCode",
  openclaw: "OpenClaw",
  hermes: "Hermes",
  pi: "Pi",
};

/** 应用图标 + 角标（Claude Code / Desktop 用角标区分终端与桌面） */
function AppGlyph({ app, isActive }: { app: AppId; isActive: boolean }) {
  const badgeConfig = APP_BADGE_ICON[app];
  const BadgeIcon = badgeConfig?.icon;
  return (
    <span className="relative inline-flex shrink-0">
      <ProviderIcon
        icon={APP_ICON_NAME[app]}
        name={APP_DISPLAY_NAME[app]}
        size={20}
      />
      {BadgeIcon && (
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-[3px] border h-[11px] w-[11px]",
            isActive
              ? "bg-background border-border text-foreground"
              : "bg-muted border-background text-muted-foreground group-hover:bg-background group-hover:text-foreground",
          )}
          aria-hidden="true"
        >
          <BadgeIcon
            className="h-[8px] w-[8px]"
            strokeWidth={2.5}
            style={
              badgeConfig?.offsetY
                ? { transform: `translateY(${badgeConfig.offsetY}px)` }
                : undefined
            }
          />
        </span>
      )}
    </span>
  );
}

/**
 * 顶栏应用切换：下拉列表样式（DropdownMenu 实现）。
 * 点击任意选项立即切换到对应应用页面——onSelect 对每次点击必然触发，
 * 不依赖受控 value 的变化。
 */
export function AppSwitcher({
  activeApp,
  onSwitch,
  visibleApps,
}: AppSwitcherProps) {
  useTranslation();

  const handleSwitch = (app: AppId) => {
    localStorage.setItem(STORAGE_KEY, app);
    onSwitch(app);
  };

  const appsToShow = APP_IDS.filter((app) => {
    if (!visibleApps) return true;
    return visibleApps[app];
  });

  return (
    <div
      className="inline-flex"
      style={{ WebkitAppRegion: "no-drag" } as any}
    >
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            "inline-flex h-8 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors",
            "text-foreground hover:bg-black/5 dark:hover:bg-white/5",
          )}
          aria-label="App Switcher"
        >
          <AppGlyph app={activeApp} isActive />
          <span>{APP_DISPLAY_NAME[activeApp]}</span>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[10rem]">
          {appsToShow.map((app) => {
            const isActive = app === activeApp;
            return (
              <DropdownMenuItem
                key={app}
                onSelect={() => handleSwitch(app)}
                className={cn(
                  "gap-2.5 py-2",
                  isActive && "bg-muted/60 font-medium",
                )}
              >
                <AppGlyph app={app} isActive={false} />
                <span className="flex-1 truncate text-left">
                  {APP_DISPLAY_NAME[app]}
                </span>
                {isActive && <Check className="h-4 w-4 shrink-0" />}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
