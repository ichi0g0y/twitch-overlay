//! Music playback state and control API.

use axum::extract::State;
use axum::Json;
use serde_json::{json, Value};

use crate::app::SharedState;
use overlay_db::music::PlaybackState;

use super::err_json;

type ApiResult = Result<Json<Value>, (axum::http::StatusCode, Json<Value>)>;

/// GET /api/music/state
pub async fn get_playback_state(State(state): State<SharedState>) -> ApiResult {
    let ps = state
        .db()
        .get_playback_state()
        .map_err(|e| err_json(500, &e.to_string()))?;
    Ok(Json(json!(ps)))
}

/// POST /api/music/state/update
pub async fn save_playback_state(
    State(state): State<SharedState>,
    Json(body): Json<PlaybackState>,
) -> ApiResult {
    state
        .db()
        .save_playback_state(&body)
        .map_err(|e| err_json(500, &e.to_string()))?;
    Ok(Json(json!({ "status": "ok" })))
}

/// POST /api/music/status/update – overlay reports current status
pub async fn update_music_status(
    State(state): State<SharedState>,
    Json(body): Json<Value>,
) -> ApiResult {
    // Broadcast to WebSocket clients
    let msg = json!({ "type": "music_status", "data": body });
    let _ = state.ws_sender().send(msg.to_string());
    Ok(Json(json!({ "status": "ok" })))
}

/// GET /api/music/status
pub async fn get_music_status(State(state): State<SharedState>) -> ApiResult {
    let ps = state
        .db()
        .get_playback_state()
        .map_err(|e| err_json(500, &e.to_string()))?;
    Ok(Json(json!({ "status": "ok", "data": ps })))
}

/// POST /api/music/control/:action
pub async fn music_control(
    State(state): State<SharedState>,
    axum::extract::Path(action): axum::extract::Path<String>,
    body: Option<Json<Value>>,
) -> ApiResult {
    let body_val = body.map(|b| b.0).unwrap_or(json!({}));
    let msg = json!({
        "type": "music_control",
        "action": action,
        "data": body_val,
    });
    let _ = state.ws_sender().send(msg.to_string());
    Ok(Json(json!({ "status": "ok", "action": action })))
}
