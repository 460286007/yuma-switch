use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;

use crate::config::{get_home_dir, write_text_file};
use crate::error::AppError;
use crate::provider::Provider;

pub const DEFAULT_MODEL: &str = "glm-5.3";
/// cc-switch 在 zcode 的 provider 表中使用的固定键。
/// zcode 的 `model.main` 形如 `<providerId>/<model>`，切换即改写该键并指向它。
pub const MANAGED_PROVIDER_KEY: &str = "cc-switch";

/// Zcode 配置目录（`~/.zcode`，可在设置中覆盖）。
pub fn get_zcode_config_dir() -> PathBuf {
    crate::settings::get_zcode_override_dir().unwrap_or_else(|| get_home_dir().join(".zcode"))
}

/// Zcode CLI live 配置路径（`~/.zcode/cli/config.json`）。
pub fn get_zcode_config_path() -> PathBuf {
    get_zcode_config_dir().join("cli").join("config.json")
}

/// 校验 provider 侧的 settings 快照（`{ "config": "<json text>" }`）。
///
/// 内层 JSON 必须是对象，且含非空 `baseURL` 与 `model`；
/// `apiKey` 允许为空（例如Coding Plan 走 OAuth 的场景由 zcode 自行处理）。
pub fn validate_settings(settings: &Value) -> Result<(), AppError> {
    let config_text = extract_config_text(settings)?;
    let parsed: Value = serde_json::from_str(&config_text).map_err(|error| {
        AppError::localized(
            "provider.zcode.config.invalid_json",
            format!("Zcode 配置必须是合法 JSON: {error}"),
            format!("Zcode configuration must be valid JSON: {error}"),
        )
    })?;
    let object = parsed.as_object().ok_or_else(|| {
        AppError::localized(
            "provider.zcode.config.not_object",
            "Zcode 配置必须是 JSON 对象",
            "Zcode configuration must be a JSON object",
        )
    })?;
    for field in ["baseURL", "model"] {
        let value = object.get(field).and_then(Value::as_str).map(str::trim);
        if value.is_none_or(str::is_empty) {
            return Err(AppError::localized(
                "provider.zcode.field.missing",
                format!("Zcode 配置缺少有效的 {field} 字段"),
                format!("Zcode configuration is missing a valid {field} field"),
            ));
        }
    }
    Ok(())
}

fn extract_config_text(settings: &Value) -> Result<String, AppError> {
    settings
        .get("config")
        .and_then(Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| {
            AppError::localized(
                "provider.zcode.config.missing",
                "Zcode 配置缺少 config 字段",
                "Zcode configuration is missing the config field",
            )
        })
}

/// 读取 live `~/.zcode/cli/config.json`，返回整个文档（供调用方合并）。
fn read_live_document() -> Result<Value, AppError> {
    let path = get_zcode_config_path();
    if !path.exists() {
        return Ok(json!({}));
    }
    let content = fs::read_to_string(&path).map_err(|error| AppError::io(&path, error))?;
    if content.trim().is_empty() {
        return Ok(json!({}));
    }
    serde_json::from_str(&content).map_err(|error| AppError::json(&path, error))
}

/// 把 provider 的 settings 快照写入 live 配置。
///
/// 只改写 `provider["cc-switch"]` 与 `model.main`，其余字段（permission、
/// storage、mcp、ui 等）原样保留，避免破坏用户其余的 zcode 设置。
pub fn write_zcode_provider_live(provider: &Provider) -> Result<(), AppError> {
    let settings = provider
        .settings_config
        .as_object()
        .ok_or_else(|| {
            AppError::localized(
                "provider.zcode.settings.not_object",
                "Zcode 配置必须是 JSON 对象",
                "Zcode configuration must be a JSON object",
            )
        })?
        .clone();
    let snapshot: Value = serde_json::to_value(&settings).unwrap_or_default();
    validate_settings(&snapshot)?;

    let config_text = extract_config_text(&snapshot)?;
    let parsed: Value = serde_json::from_str(&config_text).map_err(|error| {
        AppError::localized(
            "provider.zcode.config.invalid_json",
            format!("Zcode 配置必须是合法 JSON: {error}"),
            format!("Zcode configuration must be valid JSON: {error}"),
        )
    })?;
    let object = parsed.as_object().cloned().unwrap_or_default();
    let base_url = object.get("baseURL").and_then(Value::as_str).unwrap_or("");
    let api_key = object.get("apiKey").and_then(Value::as_str).unwrap_or("");
    let model = object.get("model").and_then(Value::as_str).unwrap_or("");
    let kind = object
        .get("kind")
        .and_then(Value::as_str)
        .unwrap_or("anthropic")
        .to_string();
    let provider_name = provider.name.clone();

    let mut document = read_live_document()?;
    if !document.is_object() {
        document = json!({});
    }

    let mut options = json!({ "baseURL": base_url });
    if !api_key.trim().is_empty() {
        options["apiKey"] = json!(api_key);
    }

    let provider_entry = json!({
        "kind": kind,
        "name": provider_name,
        "options": options,
        "headers": {},
        "models": {
            model: { "name": model }
        }
    });

    let object = document.as_object_mut().unwrap();
    let providers = object
        .entry("provider".to_string())
        .or_insert_with(|| json!({}));
    if !providers.is_object() {
        *providers = json!({});
    }
    providers
        .as_object_mut()
        .unwrap()
        .insert(MANAGED_PROVIDER_KEY.to_string(), provider_entry);

    object.insert(
        "model".to_string(),
        json!({ "main": format!("{MANAGED_PROVIDER_KEY}/{model}") }),
    );

    let serialized =
        serde_json::to_string_pretty(&document).map_err(|e| AppError::Message(e.to_string()))?;
    write_text_file(&get_zcode_config_path(), &serialized)
}

/// 读取 live 配置，返回与 `write_zcode_provider_live` 对称的 settings 快照。
///
/// 以 `model.main` 指向的 provider 为当前供应商；当它不是 cc-switch
/// 托管键时，仍按同形状抽取（导入已有配置用）。
pub fn read_zcode_live_settings() -> Result<Value, AppError> {
    let path = get_zcode_config_path();
    if !path.exists() {
        return Err(AppError::localized(
            "zcode.config.missing",
            "Zcode 配置文件不存在",
            "Zcode configuration file not found",
        ));
    }
    let document = read_live_document()?;
    let empty = Value::Null;
    let providers = document
        .get("provider")
        .and_then(Value::as_object)
        .ok_or_else(|| {
            AppError::localized(
                "zcode.provider.missing",
                "Zcode 配置缺少 provider 段",
                "Zcode configuration is missing the provider section",
            )
        })?;
    let main = document
        .pointer("/model/main")
        .and_then(Value::as_str)
        .unwrap_or("");
    let provider_key = main.split('/').next().unwrap_or("");
    let entry = providers
        .get(provider_key)
        .unwrap_or(&empty)
        .get("options")
        .cloned()
        .unwrap_or_else(|| json!({}));
    let model = main.split('/').nth(1).unwrap_or(DEFAULT_MODEL);

    let snapshot = json!({
        "providerId": provider_key,
        "kind": providers.get(provider_key).and_then(|e| e.get("kind")).and_then(Value::as_str).unwrap_or("anthropic"),
        "baseURL": entry.get("baseURL").and_then(Value::as_str).unwrap_or(""),
        "apiKey": entry.get("apiKey").and_then(Value::as_str).unwrap_or(""),
        "model": model,
    });
    Ok(json!({ "config": snapshot.to_string() }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serial_test::serial;
    use tempfile::TempDir;

    fn provider_with(config: &str) -> Provider {
        Provider::with_id(
            "zcode-1".to_string(),
            "BigModel".to_string(),
            json!({ "config": config }),
            None,
        )
    }

    #[test]
    fn validates_settings_shape() {
        let ok = json!({ "config": r#"{"baseURL":"https://open.bigmodel.cn/api/anthropic","apiKey":"sk","model":"glm-5.3"}"# });
        validate_settings(&ok).expect("valid settings");
        let missing_model = json!({ "config": r#"{"baseURL":"https://x"}"# });
        assert!(validate_settings(&missing_model).is_err());
        let bad_json = json!({ "config": "not json" });
        assert!(validate_settings(&bad_json).is_err());
    }

    #[test]
    #[serial]
    fn writes_managed_provider_and_reads_back() {
        let temp = TempDir::new().expect("temp dir");
        let original = std::env::var_os("CC_SWITCH_TEST_HOME");
        std::env::set_var("CC_SWITCH_TEST_HOME", temp.path());

        let config = r#"{"kind":"anthropic","baseURL":"https://open.bigmodel.cn/api/anthropic","apiKey":"sk-test","model":"glm-5.3"}"#;
        write_zcode_provider_live(&provider_with(config)).expect("write live");

        let path = get_zcode_config_path();
        let live: Value =
            serde_json::from_str(&fs::read_to_string(path).expect("read live")).expect("parse");
        assert_eq!(
            live.pointer("/model/main").and_then(Value::as_str),
            Some("cc-switch/glm-5.3")
        );
        assert_eq!(
            live.pointer("/provider/cc-switch/options/baseURL")
                .and_then(Value::as_str),
            Some("https://open.bigmodel.cn/api/anthropic")
        );

        let settings = read_zcode_live_settings().expect("read back");
        let snapshot: Value =
            serde_json::from_str(settings.get("config").and_then(Value::as_str).unwrap()).unwrap();
        assert_eq!(
            snapshot.get("baseURL").and_then(Value::as_str),
            Some("https://open.bigmodel.cn/api/anthropic")
        );
        assert_eq!(
            snapshot.get("model").and_then(Value::as_str),
            Some("glm-5.3")
        );

        match original {
            Some(value) => std::env::set_var("CC_SWITCH_TEST_HOME", value),
            None => std::env::remove_var("CC_SWITCH_TEST_HOME"),
        }
    }

    #[test]
    #[serial]
    fn preserves_unrelated_sections() {
        let temp = TempDir::new().expect("temp dir");
        let original = std::env::var_os("CC_SWITCH_TEST_HOME");
        std::env::set_var("CC_SWITCH_TEST_HOME", temp.path());

        let path = get_zcode_config_path();
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(
            &path,
            r#"{"permission":{"mode":"build"},"provider":{"builtin:zai":{"kind":"anthropic","options":{"baseURL":"https://api.z.ai"}}}}"#,
        )
        .unwrap();

        let config = r#"{"baseURL":"https://x","model":"glm-5.3"}"#;
        write_zcode_provider_live(&provider_with(config)).expect("write live");
        let live: Value = serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(
            live.pointer("/permission/mode").and_then(Value::as_str),
            Some("build")
        );
        assert!(live.pointer("/provider/builtin:zai").is_some());

        match original {
            Some(value) => std::env::set_var("CC_SWITCH_TEST_HOME", value),
            None => std::env::remove_var("CC_SWITCH_TEST_HOME"),
        }
    }
}
