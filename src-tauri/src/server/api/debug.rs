//! Debug event simulation API.

use axum::Json;
use axum::extract::State;
use serde::Deserialize;
use serde_json::{Value, json};

use crate::app::SharedState;

use super::err_json;

type ApiResult = Result<Json<Value>, (axum::http::StatusCode, Json<Value>)>;

#[derive(Debug, Deserialize)]
pub struct DebugClockRequest {
    #[serde(default = "default_true", rename = "withStats")]
    with_stats: bool,
    #[serde(default, rename = "emptyLeaderboard")]
    empty_leaderboard: bool,
    #[serde(default, rename = "forcePrint", alias = "force")]
    force_print: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Deserialize)]
pub struct DebugChannelPointsRequest {
    #[serde(default)]
    username: String,
    #[serde(default, rename = "displayName")]
    display_name: String,
    #[serde(default, rename = "userInput")]
    user_input: String,
}

async fn ensure_debug_enabled(
    state: &SharedState,
) -> Result<(), (axum::http::StatusCode, Json<Value>)> {
    let debug_output_enabled = {
        let config = state.config().await;
        config.debug_output
    };
    let env_enabled = std::env::var("DEBUG_MODE")
        .map(|v| v.eq_ignore_ascii_case("true"))
        .unwrap_or(false);
    if debug_output_enabled || env_enabled {
        return Ok(());
    }
    Err(err_json(
        403,
        "Debug API is disabled. Set DEBUG_MODE=true or DEBUG_OUTPUT=true",
    ))
}

/// POST /debug/fax – Simulate FAX submission
pub async fn debug_fax(State(state): State<SharedState>, Json(body): Json<Value>) -> ApiResult {
    ensure_debug_enabled(&state).await?;
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
    Json(body): Json<DebugChannelPointsRequest>,
) -> ApiResult {
    ensure_debug_enabled(&state).await?;

    crate::services::channel_points_fax::process_debug_channel_points(
        &state,
        &body.username,
        &body.display_name,
        &body.user_input,
    )
    .await
    .map_err(|e| {
        err_json(
            500,
            &format!("Failed to process channel points redemption: {e}"),
        )
    })?;

    Ok(Json(json!({
        "status": "ok",
        "message": "Debug channel points redemption processed successfully"
    })))
}

/// POST /debug/follow
pub async fn debug_follow(State(state): State<SharedState>, Json(body): Json<Value>) -> ApiResult {
    ensure_debug_enabled(&state).await?;
    let msg = json!({ "type": "follow", "data": body });
    let _ = state.ws_sender().send(msg.to_string());
    Ok(Json(json!({ "status": "ok" })))
}

/// POST /debug/cheer
pub async fn debug_cheer(State(state): State<SharedState>, Json(body): Json<Value>) -> ApiResult {
    ensure_debug_enabled(&state).await?;
    let msg = json!({ "type": "cheer", "data": body });
    let _ = state.ws_sender().send(msg.to_string());
    Ok(Json(json!({ "status": "ok" })))
}

/// POST /debug/subscribe
pub async fn debug_subscribe(
    State(state): State<SharedState>,
    Json(body): Json<Value>,
) -> ApiResult {
    ensure_debug_enabled(&state).await?;
    let msg = json!({ "type": "subscribe", "data": body });
    let _ = state.ws_sender().send(msg.to_string());
    Ok(Json(json!({ "status": "ok" })))
}

/// POST /debug/clock
pub async fn debug_clock(
    State(state): State<SharedState>,
    Json(body): Json<DebugClockRequest>,
) -> ApiResult {
    ensure_debug_enabled(&state).await?;

    let time_str = crate::services::clock_print::enqueue_clock_print_with_options(
        &state,
        body.with_stats,
        body.empty_leaderboard,
        body.force_print,
    )
    .await
    .map_err(|e| err_json(500, &format!("Failed to print clock: {e}")))?;

    let msg = json!({
        "type": "clock_debug",
        "data": {
            "time": time_str,
            "withStats": body.with_stats,
            "emptyLeaderboard": body.empty_leaderboard,
            "forcePrint": body.force_print
        }
    });
    let _ = state.ws_sender().send(msg.to_string());

    let message = if body.with_stats {
        format!("Clock printed at {time_str} with leaderboard stats")
    } else {
        format!("Clock printed at {time_str}")
    };
    Ok(Json(json!({
        "status": "ok",
        "message": message,
        "time": time_str
    })))
}

/// POST /debug/raid
pub async fn debug_raid(State(state): State<SharedState>, Json(body): Json<Value>) -> ApiResult {
    ensure_debug_enabled(&state).await?;
    let msg = json!({ "type": "raid", "data": body });
    let _ = state.ws_sender().send(msg.to_string());
    Ok(Json(json!({ "status": "ok" })))
}

/// POST /debug/stream-online
pub async fn debug_stream_online(State(state): State<SharedState>) -> ApiResult {
    ensure_debug_enabled(&state).await?;
    state.set_stream_live(true).await;
    let msg = json!({ "type": "stream_status", "data": { "is_live": true } });
    let _ = state.ws_sender().send(msg.to_string());
    Ok(Json(json!({ "status": "ok" })))
}

/// POST /debug/stream-offline
pub async fn debug_stream_offline(State(state): State<SharedState>) -> ApiResult {
    ensure_debug_enabled(&state).await?;
    state.set_stream_live(false).await;
    let msg = json!({ "type": "stream_status", "data": { "is_live": false } });
    let _ = state.ws_sender().send(msg.to_string());
    Ok(Json(json!({ "status": "ok" })))
}

/// POST /debug/gift-sub
pub async fn debug_gift_sub(
    State(state): State<SharedState>,
    Json(body): Json<Value>,
) -> ApiResult {
    ensure_debug_enabled(&state).await?;
    let msg = json!({ "type": "gift_sub", "data": body });
    let _ = state.ws_sender().send(msg.to_string());
    Ok(Json(json!({ "status": "ok" })))
}

/// POST /debug/resub
pub async fn debug_resub(State(state): State<SharedState>, Json(body): Json<Value>) -> ApiResult {
    ensure_debug_enabled(&state).await?;
    let msg = json!({ "type": "resub", "data": body });
    let _ = state.ws_sender().send(msg.to_string());
    Ok(Json(json!({ "status": "ok" })))
}

/// POST /debug/shoutout
pub async fn debug_shoutout(
    State(state): State<SharedState>,
    Json(body): Json<Value>,
) -> ApiResult {
    ensure_debug_enabled(&state).await?;
    let msg = json!({ "type": "shoutout", "data": body });
    let _ = state.ws_sender().send(msg.to_string());
    Ok(Json(json!({ "status": "ok" })))
}

/// POST /api/debug/printer-status
pub async fn debug_printer_status(
    State(state): State<SharedState>,
    Json(body): Json<Value>,
) -> ApiResult {
    ensure_debug_enabled(&state).await?;
    let connected = body["connected"].as_bool().unwrap_or(false);
    let msg = json!({ "type": "printer_status", "data": { "connected": connected } });
    let _ = state.ws_sender().send(msg.to_string());
    Ok(Json(json!({ "success": true, "connected": connected })))
}
