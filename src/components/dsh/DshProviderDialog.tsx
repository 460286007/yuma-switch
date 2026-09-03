import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { Check, ExternalLink, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FullScreenPanel } from "@/components/common/FullScreenPanel";
import { DeepSeekIcon } from "@/components/BrandIcons";
import { NodejsIcon } from "@/components/BrandIcons";
import { cn } from "@/lib/utils";

export interface DshProviderCardData {
  id: string;
  baseUrl: string;
  api: string;
  officialUrl: string | null;
  keyEnv: string;
  keyMasked: string | null;
  modelIds: string[];
  active: boolean;
}

interface Preset {
  key: string;
  name: string;
  baseUrl: string;
  official: string;
  models: { id: string; name: string }[];
}

/** 常用厂商预设（anthropic 兼容端点）；自定义留空手填 */
export const DSH_PRESETS: Preset[] = [
  {
    key: "deepseek",
    name: "DeepSeek 官方",
    baseUrl: "https://api.deepseek.com/anthropic",
    official: "https://platform.deepseek.com",
    models: [
      { id: "deepseek-chat", name: "DeepSeek Chat" },
      { id: "deepseek-reasoner", name: "DeepSeek Reasoner" },
    ],
  },
  {
    key: "glm",
    name: "BigModel GLM",
    baseUrl: "https://open.bigmodel.cn/api/anthropic",
    official: "https://open.bigmodel.cn",
    models: [{ id: "glm-5.3", name: "GLM 5.3" }],
  },
  {
    key: "zai",
    name: "Z.AI",
    baseUrl: "https://api.z.ai/api/anthropic",
    official: "https://z.ai",
    models: [{ id: "glm-5.3", name: "GLM 5.3" }],
  },
  {
    key: "custom",
    name: "自定义",
    baseUrl: "",
    official: "",
    models: [{ id: "glm-5.3", name: "GLM 5.3" }],
  },
];

interface DshProviderDialogProps {
  isOpen: boolean;
  /** 编辑时传入；新增为 null */
  editing: DshProviderCardData | null;
  onClose: () => void;
  onSaved: () => void;
}

function PresetIcon({ presetKey, size = 28 }: { presetKey: string; size?: number }) {
  if (presetKey === "deepseek") return <DeepSeekIcon size={size} className="text-[#4D6BFE]" />;
  if (presetKey === "glm" || presetKey === "zai") return <NodejsIcon size={size} />;
  return (
    <span className="text-xl">⚙️</span>
  );
}

/** 添加/编辑 DSH 供应商（模仿 Claude 添加供应商页：预设选择 + 表单） */
export function DshProviderDialog({
  isOpen,
  editing,
  onClose,
  onSaved,
}: DshProviderDialogProps) {
  const { t } = useTranslation();
  const [presetKey, setPresetKey] = useState("deepseek");
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [officialUrl, setOfficialUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (editing) {
      // 编辑：回填，预设标记为自定义（字段自由改）
      setPresetKey("custom");
      setName(editing.id);
      setBaseUrl(editing.baseUrl);
      setOfficialUrl(editing.officialUrl ?? "");
      setApiKey("");
    } else {
      applyPreset(DSH_PRESETS[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editing]);

  const applyPreset = (p: Preset) => {
    setPresetKey(p.key);
    setName(p.name);
    setBaseUrl(p.baseUrl);
    setOfficialUrl(p.official);
    setApiKey("");
  };

  const selectedModels =
    DSH_PRESETS.find((p) => p.key === presetKey)?.models ??
    DSH_PRESETS[3].models;

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const id = await invoke<string>("dsh_save_provider", {
        input: {
          id: editing?.id ?? null,
          name: name.trim(),
          baseUrl: baseUrl.trim(),
          officialUrl: officialUrl.trim() || null,
          apiKey: apiKey.trim() || null,
          models: selectedModels,
        },
      });
      toast.success(
        editing
          ? t("dsh.providerUpdated", { defaultValue: "供应商已更新" })
          : t("dsh.providerAdded", { defaultValue: "供应商已添加" }),
        { description: id },
      );
      onSaved();
      onClose();
    } catch (error) {
      toast.error(
        t("dsh.providerSaveFailed", { defaultValue: "保存供应商失败" }),
        { description: String(error), closeButton: true },
      );
    } finally {
      setSaving(false);
    }
  };

  const valid = name.trim() && baseUrl.trim() && (editing || apiKey.trim());

  return (
    <FullScreenPanel
      isOpen={isOpen}
      title={
        editing
          ? t("dsh.editProvider", { defaultValue: "编辑 DSH 供应商" })
          : t("dsh.addProvider", { defaultValue: "添加 DSH 供应商" })
      }
      onClose={onClose}
      contentClassName="pt-4"
      footer={
        <Button type="submit" form="dsh-provider-form" disabled={!valid || saving}>
          <Save className="mr-2 h-4 w-4" />
          {t("common.save", { defaultValue: "保存" })}
        </Button>
      }
    >
      <form
        id="dsh-provider-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="glass mx-auto max-w-2xl space-y-6 rounded-xl border border-white/10 p-6"
      >
        {/* 预设选择（编辑时隐藏） */}
        {!editing && (
          <div className="space-y-2">
            <p className="text-center text-sm text-muted-foreground">
              {t("dsh.chooseVendor", { defaultValue: "选择哪一家的 API？" })}
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {DSH_PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => applyPreset(p)}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-xl border-2 px-2 py-3 transition-all",
                    presetKey === p.key
                      ? "border-[#4D6BFE]/60 bg-[#4D6BFE]/10 shadow-sm"
                      : "border-muted bg-muted/30 hover:border-muted-foreground/30 hover:bg-muted/50",
                  )}
                >
                  <PresetIcon presetKey={p.key} />
                  <span
                    className={cn(
                      "text-xs font-medium",
                      presetKey === p.key
                        ? "text-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {p.name}
                  </span>
                  {presetKey === p.key && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#4D6BFE]/15 px-2 py-0.5 text-[10px] text-[#4D6BFE]">
                      <Check className="h-3 w-3" />
                      {t("gitAccount.selected", { defaultValue: "已选择" })}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <label className="block text-sm font-medium text-foreground" htmlFor="dsh-p-name">
            {t("dsh.providerName", { defaultValue: "名称" })}
          </label>
          <Input
            id="dsh-p-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("dsh.providerNamePlaceholder", { defaultValue: "如 DeepSeek 官方 / GLM 主力号" })}
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-foreground" htmlFor="dsh-p-url">
            {t("dsh.baseUrl", { defaultValue: "请求地址（Base URL）" })}
          </label>
          <Input
            id="dsh-p-url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.deepseek.com/anthropic"
            className="font-mono"
          />
          {officialUrl && (
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs text-[#4D6BFE] hover:underline"
              onClick={() =>
                void invoke("open_external", { url: officialUrl })
              }
            >
              <ExternalLink className="h-3 w-3" />
              {officialUrl}
            </button>
          )}
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-foreground" htmlFor="dsh-p-key">
            API Key
          </label>
          <Input
            id="dsh-p-key"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={
              editing
                ? t("dsh.keyKeepPlaceholder", { defaultValue: "留空表示保持原有钥匙不变" })
                : "sk-..."
            }
            className="font-mono"
          />
          {editing?.keyMasked && (
            <p className="text-xs text-muted-foreground">
              {t("dsh.keyCurrent", { defaultValue: "当前" })}:{" "}
              <span className="font-mono">{editing.keyMasked}</span>
            </p>
          )}
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-foreground" htmlFor="dsh-p-official">
            {t("dsh.officialUrl", { defaultValue: "官网链接（选填）" })}
          </label>
          <Input
            id="dsh-p-official"
            value={officialUrl}
            onChange={(e) => setOfficialUrl(e.target.value)}
            placeholder="https://..."
            className="font-mono"
          />
        </div>

        <p className="text-xs text-muted-foreground">
          {t("dsh.providerHint", {
            defaultValue:
              "保存后写入 DSH 配置并即刻生效；在此「使用」即可切换默认供应商。模型随预设自动配置。",
          })}
        </p>
      </form>
    </FullScreenPanel>
  );
}
