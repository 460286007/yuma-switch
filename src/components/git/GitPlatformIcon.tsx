import { ProviderIcon } from "@/components/ProviderIcon";
import { GIT_PLATFORM_LABEL, type GitPlatform } from "@/lib/api/gitAccount";

interface GitPlatformIconProps {
  platform: GitPlatform;
  size?: number;
}

/**
 * git 平台图标。GitHub 官方标为纯黑剪影，深色主题下直接渲染会隐没，
 * 按官方用法固定为白底芯片 + 黑色图标；Gitee 为品牌红，正常渲染。
 */
export function GitPlatformIcon({ platform, size = 16 }: GitPlatformIconProps) {
  if (platform === "github") {
    return (
      <span className="inline-flex items-center justify-center rounded-[4px] bg-white p-[2px] leading-none">
        <ProviderIcon icon="github" name="GitHub" size={size} color="#181717" />
      </span>
    );
  }
  return (
    <ProviderIcon
      icon="gitee"
      name={GIT_PLATFORM_LABEL[platform]}
      size={size}
    />
  );
}
