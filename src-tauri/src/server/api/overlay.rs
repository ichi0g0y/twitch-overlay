//! Overlay settings API:
//!   GET  /api/settings/overlay         – get overlay settings
//!   POST /api/settings/overlay         – update overlay settings (partial)
//!   POST /api/overlay/refresh          – re-broadcast settings to all WS clients

use axum::Json;
use axum::extract::State;
use serde_json::{Value, json};
use std::collections::HashMap;

use crate::app::SharedState;
use crate::config::SettingsManager;

use super::err_json;

/// Keys that belong to the overlay settings group.
const OVERLAY_KEYS: &[&str] = &[
    "MUSIC_ENABLED",
    "MUSIC_VOLUME",
    "MUSIC_PLAYLIST",
    "MUSIC_AUTO_PLAY",
    "FAX_ENABLED",
    "FAX_ANIMATION_SPEED",
    "FAX_IMAGE_TYPE",
    "OVERLAY_CLOCK_ENABLED",
    "OVERLAY_CLOCK_FORMAT",
    "OVERLAY_LOCATION_ENABLED",
    "OVERLAY_DATE_ENABLED",
    "OVERLAY_TIME_ENABLED",
    "OVERLAY_DEBUG_ENABLED",
    "OVERLAY_CARDS_EXPANDED",
    "OVERLAY_CARDS_LAYOUT",
    "CLOCK_ENABLED",
    "CLOCK_SHOW_ICONS",
    "REWARD_COUNT_ENABLED",
    "REWARD_COUNT_GROUP_ID",
    "REWARD_COUNT_POSITION",
    "MIC_TRANSCRIPT_ENABLED",
    "MIC_TRANSCRIPT_POSITION",
    "MIC_TRANSCRIPT_V_ALIGN",
    "MIC_TRANSCRIPT_FRAME_HEIGHT_PX",
    "MIC_TRANSCRIPT_FONT_SIZE",
    "MIC_TRANSCRIPT_MAX_LINES",
    "MIC_TRANSCRIPT_MAX_WIDTH_PX",
    "MIC_TRANSCRIPT_SPEECH_LANGUAGE",
    "MIC_TRANSCRIPT_SPEECH_ENABLED",
    "MIC_TRANSCRIPT_SPEECH_SHORT_PAUSE_MS",
    "MIC_TRANSCRIPT_SPEECH_INTERIM_THROTTLE_MS",
    "MIC_TRANSCRIPT_SPEECH_DUAL_INSTANCE_ENABLED",
    "MIC_TRANSCRIPT_SPEECH_RESTART_DELAY_MS",
    "MIC_TRANSCRIPT_BOUYOMI_ENABLED",
    "MIC_TRANSCRIPT_ANTI_SEXUAL_ENABLED",
    "MIC_TRANSCRIPT_TRANSLATION_ENABLED",
    "MIC_TRANSCRIPT_TRANSLATION_MODE",
    "MIC_TRANSCRIPT_TRANSLATION_LANGUAGE",
    "MIC_TRANSCRIPT_TRANSLATION_POSITION",
    "MIC_TRANSCRIPT_TRANSLATION_MAX_WIDTH_PX",
    "MIC_TRANSCRIPT_TRANSLATION_FONT_SIZE",
    "MIC_TRANSCRIPT_LINE_TTL_SECONDS",
    "MIC_TRANSCRIPT_LAST_TTL_SECONDS",
    "MIC_TRANSCRIPT_TEXT_ALIGN",
    "MIC_TRANSCRIPT_WHITE_SPACE",
    "MIC_TRANSCRIPT_BACKGROUND_COLOR",
    "MIC_TRANSCRIPT_TIMER_MS",
    "MIC_TRANSCRIPT_INTERIM_MARKER_LEFT",
    "MIC_TRANSCRIPT_INTERIM_MARKER_RIGHT",
    "MIC_TRANSCRIPT_LINE_SPACING_1_PX",
    "MIC_TRANSCRIPT_LINE_SPACING_2_PX",
    "MIC_TRANSCRIPT_LINE_SPACING_3_PX",
    "MIC_TRANSCRIPT_TEXT_COLOR",
    "MIC_TRANSCRIPT_STROKE_COLOR",
    "MIC_TRANSCRIPT_STROKE_WIDTH_PX",
    "MIC_TRANSCRIPT_FONT_WEIGHT",
    "MIC_TRANSCRIPT_FONT_FAMILY",
    "MIC_TRANSCRIPT_TRANSLATION_TEXT_COLOR",
    "MIC_TRANSCRIPT_TRANSLATION_STROKE_COLOR",
    "MIC_TRANSCRIPT_TRANSLATION_STROKE_WIDTH_PX",
    "MIC_TRANSCRIPT_TRANSLATION_FONT_WEIGHT",
    "MIC_TRANSCRIPT_TRANSLATION_FONT_FAMILY",
    "MIC_TRANSCRIPT_TRANSLATION2_LANGUAGE",
    "MIC_TRANSCRIPT_TRANSLATION3_LANGUAGE",
    "MIC_TRANSCRIPT_TRANSLATION2_FONT_SIZE",
    "MIC_TRANSCRIPT_TRANSLATION3_FONT_SIZE",
    "MIC_TRANSCRIPT_TRANSLATION2_TEXT_COLOR",
    "MIC_TRANSCRIPT_TRANSLATION2_STROKE_COLOR",
    "MIC_TRANSCRIPT_TRANSLATION2_STROKE_WIDTH_PX",
    "MIC_TRANSCRIPT_TRANSLATION2_FONT_WEIGHT",
    "MIC_TRANSCRIPT_TRANSLATION2_FONT_FAMILY",
    "MIC_TRANSCRIPT_TRANSLATION3_TEXT_COLOR",
    "MIC_TRANSCRIPT_TRANSLATION3_STROKE_COLOR",
    "MIC_TRANSCRIPT_TRANSLATION3_STROKE_WIDTH_PX",
    "MIC_TRANSCRIPT_TRANSLATION3_FONT_WEIGHT",
    "MIC_TRANSCRIPT_TRANSLATION3_FONT_FAMILY",
    "LOTTERY_ENABLED",
    "LOTTERY_REWARD_ID",
    "LOTTERY_LOCKED",
    "LOTTERY_DISPLAY_DURATION",
    "LOTTERY_ANIMATION_SPEED",
    "LOTTERY_TICKER_ENABLED",
    "TICKER_NOTICE_ENABLED",
    "TICKER_NOTICE_TEXT",
    "TICKER_NOTICE_FONT_SIZE",
    "TICKER_NOTICE_ALIGN",
    "BEST_QUALITY",
    "DITHER",
    "BLACK_POINT",
    "AUTO_ROTATE",
    "ROTATE_PRINT",
];

/// GET /api/settings/overlay
pub async fn get_overlay_settings(
    State(state): State<SharedState>,
) -> Result<Json<Value>, (axum::http::StatusCode, Json<Value>)> {
    let settings = build_overlay_json(&state)?;
    Ok(Json(settings))
}

/// POST /api/settings/overlay – partial update
pub async fn update_overlay_settings(
    State(state): State<SharedState>,
    Json(body): Json<HashMap<String, Value>>,
) -> Result<Json<Value>, (axum::http::StatusCode, Json<Value>)> {
    let sm = SettingsManager::new(state.db().clone());

    // Convert JSON key format (snake_case) to DB key format (SCREAMING_SNAKE_CASE)
    for (key, value) in &body {
        let db_key = key.to_uppercase();
        let str_val = match value {
            Value::String(s) => s.clone(),
            Value::Bool(b) => b.to_string(),
            Value::Number(n) => n.to_string(),
            _ => value.to_string(),
        };
        if let Err(e) = sm.set_setting(&db_key, &str_val) {
            tracing::warn!("Failed to set overlay setting {db_key}: {e}");
        }
    }

    // Reload runtime config
    state
        .reload_config()
        .await
        .map_err(|e| err_json(500, &format!("Failed to reload config: {e}")))?;

    // Broadcast updated settings via WebSocket
    broadcast_overlay_settings(&state)?;

    Ok(Json(json!({ "status": "ok" })))
}

/// POST /api/overlay/refresh
pub async fn refresh_overlay(
    State(state): State<SharedState>,
) -> Result<Json<Value>, (axum::http::StatusCode, Json<Value>)> {
    broadcast_overlay_settings(&state)?;
    Ok(Json(json!({
        "success": true,
        "message": "Overlay settings refreshed"
    })))
}

/// Build the overlay settings JSON from DB.
fn build_overlay_json(state: &SharedState) -> Result<Value, (axum::http::StatusCode, Json<Value>)> {
    let sm = SettingsManager::new(state.db().clone());

    let mut map = serde_json::Map::new();
    for &key in OVERLAY_KEYS {
        let val = sm.get_setting(key).unwrap_or_default();
        // Use snake_case keys for JSON
        let json_key = key.to_lowercase();
        map.insert(json_key, Value::String(val));
    }

    Ok(Value::Object(map))
}

/// Broadcast overlay settings to all WebSocket clients.
fn broadcast_overlay_settings(
    state: &SharedState,
) -> Result<(), (axum::http::StatusCode, Json<Value>)> {
    let settings = build_overlay_json(state)?;
    let msg = json!({
        "type": "settings",
        "data": settings,
    });
    let _ = state.ws_sender().send(msg.to_string());
    Ok(())
}
