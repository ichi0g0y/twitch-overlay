//! Lottery / present management API.

use axum::extract::State;
use axum::Json;
use serde_json::{json, Value};

use crate::app::SharedState;

use super::err_json;

type ApiResult = Result<Json<Value>, (axum::http::StatusCode, Json<Value>)>;

/// GET /api/lottery
pub async fn get_lottery(State(state): State<SharedState>) -> ApiResult {
    let participants = state
        .db()
        .get_all_lottery_participants()
        .map_err(|e| err_json(500, &e.to_string()))?;
    Ok(Json(json!({
        "participants": participants,
        "count": participants.len(),
    })))
}

/// POST /api/lottery/add-participant
pub async fn add_participant(
    State(state): State<SharedState>,
    Json(body): Json<Value>,
) -> ApiResult {
    let p = overlay_db::lottery::LotteryParticipant {
        user_id: body["user_id"].as_str().unwrap_or("").to_string(),
        username: body["username"].as_str().unwrap_or("").to_string(),
        display_name: body["display_name"].as_str().unwrap_or("").to_string(),
        avatar_url: body["avatar_url"].as_str().unwrap_or("").to_string(),
        redeemed_at: body["redeemed_at"].as_str().unwrap_or("").to_string(),
        is_subscriber: body["is_subscriber"].as_bool().unwrap_or(false),
        subscriber_tier: body["subscriber_tier"].as_str().unwrap_or("").to_string(),
        entry_count: body["entry_count"].as_i64().unwrap_or(1) as i32,
        assigned_color: body["assigned_color"].as_str().unwrap_or("#ffffff").to_string(),
    };

    state
        .db()
        .add_lottery_participant(&p)
        .map_err(|e| err_json(500, &e.to_string()))?;

    // Broadcast updated participants
    broadcast_lottery(&state);
    Ok(Json(json!({ "success": true })))
}

/// POST /api/lottery/clear
pub async fn clear_lottery(State(state): State<SharedState>) -> ApiResult {
    state
        .db()
        .clear_all_lottery_participants()
        .map_err(|e| err_json(500, &e.to_string()))?;
    broadcast_lottery(&state);
    Ok(Json(json!({ "success": true })))
}

/// DELETE /api/lottery/:user_id
pub async fn remove_participant(
    State(state): State<SharedState>,
    axum::extract::Path(user_id): axum::extract::Path<String>,
) -> ApiResult {
    state
        .db()
        .delete_lottery_participant(&user_id)
        .map_err(|e| err_json(500, &e.to_string()))?;
    broadcast_lottery(&state);
    Ok(Json(json!({ "success": true })))
}

fn broadcast_lottery(state: &SharedState) {
    let participants = state.db().get_all_lottery_participants().unwrap_or_default();
    let msg = json!({ "type": "lottery_update", "data": { "participants": participants } });
    let _ = state.ws_sender().send(msg.to_string());
}
