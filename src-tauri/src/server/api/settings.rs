//! Settings management API:
//!   GET  /api/settings/v2   – get all settings + feature status
//!   PUT  /api/settings/v2   – update settings
//!   POST /api/settings/v2   – reset settings to defaults
//!   GET  /api/settings/status – lightweight feature status

use axum::extract::State;
use axum::Json;
use serde_json::{json, Value};
use std::collections::HashMap;

use crate::app::SharedState;
use crate::config::SettingsManager;

use super::err_json;

/// GET /api/settings/v2
pub async fn get_settings(
    State(state): State<SharedState>,
) -> Result<Json<Value>, (axum::http::StatusCode, Json<Value>)> {
    let sm = SettingsManager::new(state.db().clone());

    let all = sm
        .get_all_settings()
        .map_err(|e| err_json(500, &format!("Failed to get settings: {e}")))?;

    let status = sm
        .check_feature_status()
        .map_err(|e| err_json(500, &format!("Failed to check status: {e}")))?;

    // Convert settings to JSON map
    let settings_map: HashMap<String, Value> = all
        .into_iter()
        .map(|(key, info)| {
            let val = json!({
                "key": info.key,
                "value": info.value,
                "type": info.setting_type,
                "required": info.required,
                "description": info.description,
                "has_value": info.has_value,
            });
            (key, val)
        })
        .collect();

    Ok(Json(json!({
        "settings": settings_map,
        "status": status,
    })))
}

/// PUT /api/settings/v2
pub async fn update_settings(
    State(state): State<SharedState>,
    Json(body): Json<HashMap<String, String>>,
) -> Result<Json<Value>, (axum::http::StatusCode, Json<Value>)> {
    let sm = SettingsManager::new(state.db().clone());

    let mut updated = 0u32;
    for (key, value) in &body {
        sm.set_setting(key, value)
            .map_err(|e| err_json(400, &format!("{key}: {e}")))?;
        updated += 1;
    }

    // Reload runtime config
    state
        .reload_config()
        .await
        .map_err(|e| err_json(500, &format!("Failed to reload config: {e}")))?;

    let status = sm
        .check_feature_status()
        .map_err(|e| err_json(500, &format!("Failed to check status: {e}")))?;

    let all = sm
        .get_all_settings()
        .map_err(|e| err_json(500, &format!("Failed to get settings: {e}")))?;

    let settings_map: HashMap<String, Value> = all
        .into_iter()
        .map(|(key, info)| {
            (
                key,
                json!({
                    "key": info.key,
                    "value": info.value,
                    "type": info.setting_type,
                    "required": info.required,
                    "description": info.description,
                    "has_value": info.has_value,
                }),
            )
        })
        .collect();

    Ok(Json(json!({
        "success": true,
        "status": status,
        "message": format!("Updated {updated} setting(s) successfully"),
        "settings": settings_map,
    })))
}

/// POST /api/settings/v2 – reset settings
pub async fn reset_settings(
    State(state): State<SharedState>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, (axum::http::StatusCode, Json<Value>)> {
    use crate::config::defaults::DEFAULT_SETTINGS;

    let _sm = SettingsManager::new(state.db().clone());
    let keys: Vec<String> = body
        .get("keys")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();

    let targets: Vec<&str> = if keys.is_empty() {
        DEFAULT_SETTINGS.keys().copied().collect()
    } else {
        keys.iter().map(|s| s.as_str()).collect()
    };

    let mut reset_count = 0u32;
    for key in &targets {
        if let Some(def) = DEFAULT_SETTINGS.get(key) {
            let type_str = if def.secret { "secret" } else { "normal" };
            state
                .db()
                .set_setting(key, def.default, type_str)
                .map_err(|e| err_json(500, &format!("Failed to reset {key}: {e}")))?;
            reset_count += 1;
        }
    }

    state
        .reload_config()
        .await
        .map_err(|e| err_json(500, &format!("Failed to reload config: {e}")))?;

    Ok(Json(json!({
        "success": true,
        "message": format!("Reset {reset_count} setting(s) to default values"),
    })))
}

/// GET /api/settings/status
pub async fn get_settings_status(
    State(state): State<SharedState>,
) -> Result<Json<Value>, (axum::http::StatusCode, Json<Value>)> {
    let sm = SettingsManager::new(state.db().clone());
    let status = sm
        .check_feature_status()
        .map_err(|e| err_json(500, &format!("Failed to check status: {e}")))?;
    Ok(Json(serde_json::to_value(status).unwrap()))
}
