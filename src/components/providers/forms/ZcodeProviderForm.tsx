import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { providerSchema, type ProviderFormData } from "@/lib/schemas/provider";
import type { ProviderCategory } from "@/types";
import type { ProviderFormProps, ProviderFormValues } from "./ProviderForm";
import { BasicFormFields } from "./BasicFormFields";
import ApiKeyInput from "./ApiKeyInput";
import {
  buildZcodeConfig,
  parseZcodeConfig,
  zcodeProviderPresets,
  ZCODE_DEFAULT_MODEL,
} from "@/config/zcodeProviderPresets";

type ZcodeProviderFormProps = Omit<ProviderFormProps, "appId">;

const CUSTOM_PRESET_ID = "custom";

/**
 * ZCode 供应商表单：Base URL + API Key + 模型。
 * settingsConfig 存 JSON 文本（`{ kind, baseURL, apiKey, model }`），
 * 切换时由后端写入 `~/.zcode/cli/config.json` 的 `cc-switch` provider 键。
 */
export function ZcodeProviderForm({
  submitLabel,
  onSubmit,
  onCancel,
  onSubmittingChange,
  initialData,
  showButtons = true,
}: ZcodeProviderFormProps) {
  const { t } = useTranslation();
  const initialConfigText =
    typeof initialData?.settingsConfig?.config === "string"
      ? initialData.settingsConfig.config
      : undefined;
  const initialConfig = useMemo(
    () => parseZcodeConfig(initialConfigText),
    [initialConfigText],
  );

  const [baseUrl, setBaseUrl] = useState(initialConfig?.baseURL ?? "");
  const [apiKey, setApiKey] = useState(initialConfig?.apiKey ?? "");
  const [model, setModel] = useState(
    initialConfig?.model ?? ZCODE_DEFAULT_MODEL,
  );
  const [category, setCategory] = useState<ProviderCategory | undefined>(
    initialData?.category ?? "custom",
  );

  const form = useForm<ProviderFormData>({
    resolver: zodResolver(providerSchema),
    defaultValues: {
      name: initialData?.name ?? "",
      websiteUrl: initialData?.websiteUrl ?? "",
      // settingsConfig 必须始终是合法 JSON：schema 会校验 min(1) + JSON.parse，
      // 留空会在隐藏字段上校验失败，表现为提交无反应。真实内容在提交时重写。
      settingsConfig:
        initialConfigText ??
        JSON.stringify({
          config: buildZcodeConfig({
            baseURL: "",
            apiKey: "",
            model: initialConfig?.model ?? ZCODE_DEFAULT_MODEL,
          }),
        }),
      // 新增默认用 BigModel（zhipu）logo；编辑时留空走卡片层的 zcode 回落逻辑
      icon: initialData?.icon ?? (initialData ? "" : "zhipu"),
      iconColor: initialData?.iconColor ?? "",
    },
    mode: "onSubmit",
  });
  const { isSubmitting } = form.formState;

  useEffect(() => {
    onSubmittingChange?.(isSubmitting);
  }, [isSubmitting, onSubmittingChange]);

  const handlePresetChange = (presetName: string) => {
    const preset = zcodeProviderPresets.find((p) => p.name === presetName);
    if (!preset) return;
    if (presetName === CUSTOM_PRESET_ID) {
      setCategory("custom");
      return;
    }
    const presetName2 = preset.nameKey
      ? String(t(preset.nameKey))
      : preset.name;
    form.setValue("name", presetName2);
    form.setValue("websiteUrl", preset.websiteUrl ?? "");
    setBaseUrl(preset.baseURL);
    setModel(preset.model);
    setCategory(preset.category ?? "custom");
  };

  const handleSubmit = async (values: ProviderFormData) => {
    const name = values.name.trim();
    if (!name || !baseUrl.trim() || !model.trim()) {
      toast.error(
        t("zcode.requiredFields", {
          defaultValue: "请填写供应商名称、API 地址和模型",
        }),
      );
      return;
    }
    const config = buildZcodeConfig({
      baseURL: baseUrl.trim(),
      apiKey: apiKey.trim(),
      model: model.trim(),
    });
    const payload: ProviderFormValues = {
      ...values,
      name,
      websiteUrl: values.websiteUrl?.trim() ?? "",
      notes: values.notes?.trim() ?? "",
      settingsConfig: JSON.stringify({ config }),
      presetCategory: category ?? "custom",
    };
    await onSubmit(payload);
  };

  const presetOptions = useMemo(
    () =>
      zcodeProviderPresets.map((preset) => ({
        value: preset.name,
        label: preset.nameKey ? String(t(preset.nameKey)) : preset.name,
      })),
    [t],
  );

  return (
    <Form {...form}>
      <form
        id="provider-form"
        onSubmit={form.handleSubmit(handleSubmit)}
        className="space-y-6 glass rounded-xl p-6 border border-white/10"
      >
        {!initialData && (
          <FormItem>
            <FormLabel htmlFor="zcode-preset">
              {t("zcode.preset", { defaultValue: "预设" })}
            </FormLabel>
            <Select onValueChange={handlePresetChange}>
              <SelectTrigger id="zcode-preset">
                <SelectValue
                  placeholder={t("zcode.selectPreset", {
                    defaultValue: "选择预设供应商",
                  })}
                />
              </SelectTrigger>
              <SelectContent>
                {presetOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormItem>
        )}

        <BasicFormFields form={form} />

        <FormItem>
          <FormLabel htmlFor="zcode-base-url">
            {t("zcode.baseUrl", { defaultValue: "API 地址 (Base URL)" })}
          </FormLabel>
          <Input
            id="zcode-base-url"
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            placeholder="https://open.bigmodel.cn/api/anthropic"
          />
        </FormItem>

        <ApiKeyInput
          id="zcode-api-key"
          value={apiKey}
          onChange={setApiKey}
          placeholder={t("common.enterApiKey", {
            defaultValue: "请输入 API Key",
          })}
        />

        <FormItem>
          <FormLabel htmlFor="zcode-model">
            {t("zcode.model", { defaultValue: "模型" })}
          </FormLabel>
          <Input
            id="zcode-model"
            value={model}
            onChange={(event) => setModel(event.target.value)}
            placeholder={ZCODE_DEFAULT_MODEL}
          />
        </FormItem>

        <FormField
          control={form.control}
          name="settingsConfig"
          render={() => (
            <FormItem className="hidden">
              <FormControl>
                <Input type="hidden" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {showButtons && (
          <div className="flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={onCancel}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {submitLabel}
            </Button>
          </div>
        )}
      </form>
    </Form>
  );
}
