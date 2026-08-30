/**
 * ZCode 预设供应商配置模板
 *
 * ZCode 的供应商配置存储在 `~/.zcode/cli/config.json` 的 `provider` 段，
 * 每个条目形如 `{ kind, name, options: { apiKey, baseURL }, models }`，
 * `model.main` 以 `<providerId>/<model>` 的形式指向当前供应商。
 * cc-switch 切换时写固定的 `cc-switch` provider 键（见后端 zcode_config.rs）。
 *
 * config 字段是 JSON 文本，包含 baseURL / apiKey / model / kind 四个字段。
 */
import type { ProviderCategory } from "../types";

export const ZCODE_DEFAULT_MODEL = "glm-5.3";

export interface ZcodeProviderPreset {
  name: string;
  nameKey?: string;
  websiteUrl: string;
  apiKeyUrl?: string;
  category?: ProviderCategory;
  baseURL: string;
  model: string;
  icon?: string;
  iconColor?: string;
  /** API Key 是否必填（Coding Plan 类走 zcode 自带 OAuth，可留空） */
  apiKeyRequired?: boolean;
}

export function buildZcodeConfig(input: {
  baseURL: string;
  apiKey: string;
  model: string;
  kind?: string;
}): string {
  return JSON.stringify(
    {
      kind: input.kind ?? "anthropic",
      baseURL: input.baseURL,
      apiKey: input.apiKey,
      model: input.model,
    },
    null,
    2,
  );
}

export interface ParsedZcodeConfig {
  kind: string;
  baseURL: string;
  apiKey: string;
  model: string;
}

export function parseZcodeConfig(
  configText: string | undefined,
): ParsedZcodeConfig | null {
  if (!configText) return null;
  try {
    const parsed = JSON.parse(configText) as Record<string, unknown>;
    return {
      kind: typeof parsed.kind === "string" ? parsed.kind : "anthropic",
      baseURL: typeof parsed.baseURL === "string" ? parsed.baseURL : "",
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
      model: typeof parsed.model === "string" ? parsed.model : "",
    };
  } catch {
    return null;
  }
}

export const zcodeProviderPresets: ZcodeProviderPreset[] = [
  {
    name: "BigModel",
    nameKey: "zcode.presets.bigmodel",
    websiteUrl: "https://open.bigmodel.cn",
    apiKeyUrl: "https://open.bigmodel.cn/usercenter/apikeys",
    category: "official",
    baseURL: "https://open.bigmodel.cn/api/anthropic",
    model: ZCODE_DEFAULT_MODEL,
    icon: "zhipu",
    apiKeyRequired: true,
  },
  {
    name: "Z.AI Coding Plan",
    nameKey: "zcode.presets.zai",
    websiteUrl: "https://z.ai",
    apiKeyUrl: "https://z.ai/manage-apikey/apikey",
    category: "official",
    baseURL: "https://api.z.ai/api/anthropic",
    model: ZCODE_DEFAULT_MODEL,
    icon: "zai",
  },
  {
    name: "Custom",
    nameKey: "zcode.presets.custom",
    websiteUrl: "",
    category: "custom",
    baseURL: "",
    model: ZCODE_DEFAULT_MODEL,
  },
];
