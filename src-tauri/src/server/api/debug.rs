//! Debug event simulation API.

use axum::Json;
use axum::extract::State;
use serde_json::{Value, json};

use crate::app::SharedState;

use super::err_json;

type ApiResult = Result<Json<Value>, (axum::http::StatusCode, Json<Value>)>;

/// POST /debug/fax – Simulate FAX submission
pub async fn debug_fax(State(state): State<SharedState>, Json(body): Json<Value>) -> ApiResult {
    let msg = json!({ "type": "fax", "data": body });
    state
        .ws_sender()
        .send(msg.to_string())
        .map_err(|e| err_json(500, &e.to_string()))?;
    Ok(Json(json!({ "status": "ok", "message": "Debug FAX sent" })))
}

/// POST /debug/channel-points – Simulate channel points
pub async fn debug_channel_points(
    State(state): State<SharedState>,
    Json(body): Json<Value>,
) -> ApiResult {
    let msg = json!({ "type": "channel_points", "data": body });
    let _ = state.ws_sender().send(msg.to_string());
    Ok(Json(json!({ "status": "ok" })))
}

/// POST /debug/follow
pub async fn debug_follow(State(state): State<SharedState>, Json(body): Json<Value>) -> ApiResult {
    let msg = json!({ "type": "follow", "data": body });
    let _ = state.ws_sender().send(msg.to_string());
    Ok(Json(json!({ "status": "ok" })))
}

/// POST /debug/cheer
pub async fn debug_cheer(State(state): State<SharedState>, Json(body): Json<Value>) -> ApiResult {
    let msg = json!({ "type": "cheer", "data": body });
    let _ = state.ws_sender().send(msg.to_string());
    Ok(Json(json!({ "status": "ok" })))
}

/// POST /debug/subscribe
pub async fn debug_subscribe(
    State(state): State<SharedState>,
    Json(body): Json<Value>,
) -> ApiResult {
    let msg = json!({ "type": "subscribe", "data": body });
    let _ = state.ws_sender().send(msg.to_string());
    Ok(Json(json!({ "status": "ok" })))
}

/// POST /debug/clock
pub async fn debug_clock(State(state): State<SharedState>, Json(body): Json<Value>) -> ApiResult {
    let msg = json!({ "type": "clock_debug", "data": body });
    let _ = state.ws_sender().send(msg.to_string());
    Ok(Json(
        json!({ "status": "ok", "message": "Debug clock event sent" }),
    ))
}

/// POST /debug/raid
pub async fn debug_raid(State(state): State<SharedState>, Json(body): Json<Value>) -> ApiResult {
    let msg = json!({ "type": "raid", "data": body });
    let _ = state.ws_sender().send(msg.to_string());
    Ok(Json(json!({ "status": "ok" })))
}

/// POST /debug/stream-online
pub async fn debug_stream_online(State(state): State<SharedState>) -> ApiResult {
    let msg = json!({ "type": "stream_status", "data": { "is_live": true } });
    let _ = state.ws_sender().send(msg.to_string());
    Ok(Json(json!({ "status": "ok" })))
}

/// POST /debug/stream-offline
pub async fn debug_stream_offline(State(state): State<SharedState>) -> ApiResult {
    let msg = json!({ "type": "stream_status", "data": { "is_live": false } });
    let _ = state.ws_sender().send(msg.to_string());
    Ok(Json(json!({ "status": "ok" })))
}

/// POST /debug/gift-sub
pub async fn debug_gift_sub(
    State(state): State<SharedState>,
    Json(body): Json<Value>,
) -> ApiResult {
    let msg = json!({ "type": "gift_sub", "data": body });
    let _ = state.ws_sender().send(msg.to_string());
    Ok(Json(json!({ "status": "ok" })))
}

/// POST /debug/resub
pub async fn debug_resub(State(state): State<SharedState>, Json(body): Json<Value>) -> ApiResult {
    let msg = json!({ "type": "resub", "data": body });
    let _ = state.ws_sender().send(msg.to_string());
    Ok(Json(json!({ "status": "ok" })))
}

/// POST /debug/shoutout
pub async fn debug_shoutout(
    State(state): State<SharedState>,
    Json(body): Json<Value>,
) -> ApiResult {
    let msg = json!({ "type": "shoutout", "data": body });
    let _ = state.ws_sender().send(msg.to_string());
    Ok(Json(json!({ "status": "ok" })))
}

/// POST /api/debug/printer-status
pub async fn debug_printer_status(
    State(state): State<SharedState>,
    Json(body): Json<Value>,
) -> ApiResult {
    let connected = body["connected"].as_bool().unwrap_or(false);
    let msg = json!({ "type": "printer_status", "data": { "connected": connected } });
    let _ = state.ws_sender().send(msg.to_string());
    Ok(Json(json!({ "success": true, "connected": connected })))
}
