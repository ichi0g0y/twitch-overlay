//! Lottery / present management API.

use axum::Json;
use axum::extract::State;
use serde_json::{Value, json};
use std::sync::LazyLock;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::RwLock;

use crate::app::SharedState;
use overlay_db::lottery::LotteryParticipant;

use super::err_json;

type ApiResult = Result<Json<Value>, (axum::http::StatusCode, Json<Value>)>;

#[derive(Debug, Clone, Default)]
struct LotteryRuntimeState {
    is_running: bool,
    is_locked: bool,
    winner: Option<LotteryParticipant>,
}

static LOTTERY_RUNTIME: LazyLock<RwLock<LotteryRuntimeState>> =
    LazyLock::new(|| RwLock::new(LotteryRuntimeState::default()));

/// GET /api/lottery
pub async fn get_lottery(State(state): State<SharedState>) -> ApiResult {
    let participants = get_all_participants(&state)?;
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
    let p = LotteryParticipant {
        user_id: body["user_id"].as_str().unwrap_or("").to_string(),
        username: body["username"].as_str().unwrap_or("").to_string(),
        display_name: body["display_name"].as_str().unwrap_or("").to_string(),
        avatar_url: body["avatar_url"].as_str().unwrap_or("").to_string(),
        redeemed_at: body["redeemed_at"].as_str().unwrap_or("").to_string(),
        is_subscriber: body["is_subscriber"].as_bool().unwrap_or(false),
        subscriber_tier: body["subscriber_tier"].as_str().unwrap_or("").to_string(),
        entry_count: body["entry_count"].as_i64().unwrap_or(1) as i32,
        assigned_color: body["assigned_color"]
            .as_str()
            .unwrap_or("#ffffff")
            .to_string(),
    };

    state
        .db()
        .add_lottery_participant(&p)
        .map_err(|e| err_json(500, &e.to_string()))?;

    broadcast_participant_added(&state, &p);
    broadcast_participants_updated(&state);
    Ok(Json(json!({ "success": true })))
}

/// POST /api/lottery/clear
pub async fn clear_lottery(State(state): State<SharedState>) -> ApiResult {
    state
        .db()
        .clear_all_lottery_participants()
        .map_err(|e| err_json(500, &e.to_string()))?;

    let mut runtime = LOTTERY_RUNTIME.write().await;
    runtime.is_running = false;
    runtime.winner = None;

    broadcast_participants_cleared(&state);
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
    broadcast_participants_updated(&state);
    Ok(Json(json!({ "success": true })))
}

/// GET /api/present/participants
pub async fn get_present_participants(State(state): State<SharedState>) -> ApiResult {
    let participants = get_all_participants(&state)?;
    let mut runtime = LOTTERY_RUNTIME.write().await;
    if let Ok(Some(locked)) = state.db().get_setting("LOTTERY_LOCKED") {
        runtime.is_locked = locked == "true";
    }

    Ok(Json(json!({
        "enabled": true,
        "is_running": runtime.is_running,
        "is_locked": runtime.is_locked,
        "participants": participants,
        "winner": runtime.winner.clone(),
    })))
}

/// POST /api/present/test
pub async fn add_test_participant(State(state): State<SharedState>) -> ApiResult {
    let next_id = match get_all_participants(&state) {
        Ok(v) => v.len() + 1,
        Err(_) => 1,
    };

    let now = chrono::Utc::now().to_rfc3339();
    let is_subscriber = next_id % 2 == 0;
    let subscriber_tier = if is_subscriber {
        match next_id % 3 {
            0 => "3000",
            1 => "1000",
            _ => "2000",
        }
    } else {
        ""
    };

    let p = LotteryParticipant {
        user_id: format!("test-user-{next_id}"),
        username: format!("test_user_{next_id}"),
        display_name: format!("テストユーザー{next_id}"),
        avatar_url: String::new(),
        redeemed_at: now,
        is_subscriber,
        subscriber_tier: subscriber_tier.to_string(),
        entry_count: ((next_id % 3) as i32 + 1).min(3),
        assigned_color: "#ffffff".to_string(),
    };

    state
        .db()
        .add_lottery_participant(&p)
        .map_err(|e| err_json(500, &e.to_string()))?;

    broadcast_participant_added(&state, &p);
    broadcast_participants_updated(&state);

    Ok(Json(json!({
        "success": true,
        "message": "Test participant added",
        "participant": p,
    })))
}

/// POST /api/present/start
pub async fn start_present(State(state): State<SharedState>) -> ApiResult {
    let participants = get_all_participants(&state)?;
    if participants.is_empty() {
        return Err(err_json(400, "No participants"));
    }

    let mut runtime = LOTTERY_RUNTIME.write().await;
    if runtime.is_running {
        return Err(err_json(400, "Lottery already running"));
    }
    runtime.is_running = true;
    runtime.winner = None;

    let msg = json!({
        "type": "lottery_started",
        "data": { "participants": participants, "started_at": chrono::Utc::now().to_rfc3339() }
    });
    let _ = state.ws_sender().send(msg.to_string());

    Ok(Json(
        json!({ "success": true, "message": "Lottery started" }),
    ))
}

/// POST /api/present/stop
pub async fn stop_present(State(state): State<SharedState>) -> ApiResult {
    let mut runtime = LOTTERY_RUNTIME.write().await;
    runtime.is_running = false;

    let msg = json!({
        "type": "lottery_stopped",
        "data": { "stopped_at": chrono::Utc::now().to_rfc3339() }
    });
    let _ = state.ws_sender().send(msg.to_string());

    Ok(Json(
        json!({ "success": true, "message": "Lottery stopped" }),
    ))
}

/// POST /api/present/draw
pub async fn draw_present(State(state): State<SharedState>) -> ApiResult {
    let participants = get_all_participants(&state)?;
    if participants.is_empty() {
        return Err(err_json(400, "No participants"));
    }

    let weighted = weighted_participants(&participants);
    let now_nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos() as usize)
        .unwrap_or(0);
    let winner = weighted[now_nanos % weighted.len()].clone();
    let winner_index = participants
        .iter()
        .position(|p| p.user_id == winner.user_id)
        .unwrap_or(0);

    let mut runtime = LOTTERY_RUNTIME.write().await;
    runtime.winner = Some(winner.clone());
    runtime.is_running = false;

    let msg = json!({
        "type": "lottery_winner",
        "data": { "winner": winner, "winner_index": winner_index }
    });
    let _ = state.ws_sender().send(msg.to_string());

    Ok(Json(json!({
        "success": true,
        "winner": runtime.winner.clone(),
        "winner_index": winner_index,
    })))
}

/// POST /api/present/clear
pub async fn clear_present(State(state): State<SharedState>) -> ApiResult {
    clear_lottery(State(state)).await
}

/// POST /api/present/lock
pub async fn lock_present(State(state): State<SharedState>) -> ApiResult {
    state
        .db()
        .set_setting("LOTTERY_LOCKED", "true", "normal")
        .map_err(|e| err_json(500, &e.to_string()))?;

    let mut runtime = LOTTERY_RUNTIME.write().await;
    runtime.is_locked = true;

    let msg = json!({
        "type": "lottery_locked",
        "data": { "is_locked": true, "locked_at": chrono::Utc::now().to_rfc3339() }
    });
    let _ = state.ws_sender().send(msg.to_string());

    Ok(Json(
        json!({ "success": true, "message": "Lottery locked" }),
    ))
}

/// POST /api/present/unlock
pub async fn unlock_present(State(state): State<SharedState>) -> ApiResult {
    state
        .db()
        .set_setting("LOTTERY_LOCKED", "false", "normal")
        .map_err(|e| err_json(500, &e.to_string()))?;

    let mut runtime = LOTTERY_RUNTIME.write().await;
    runtime.is_locked = false;

    let msg = json!({
        "type": "lottery_unlocked",
        "data": { "is_locked": false, "unlocked_at": chrono::Utc::now().to_rfc3339() }
    });
    let _ = state.ws_sender().send(msg.to_string());

    Ok(Json(
        json!({ "success": true, "message": "Lottery unlocked" }),
    ))
}

/// POST /api/present/refresh-subscribers
pub async fn refresh_present_subscribers(State(state): State<SharedState>) -> ApiResult {
    let participants = get_all_participants(&state)?;
    if participants.is_empty() {
        return Ok(Json(json!({ "success": true, "updated": 0 })));
    }

    // Get Twitch API token and config
    let db_token = state
        .db()
        .get_latest_token()
        .ok()
        .flatten()
        .ok_or_else(|| err_json(401, "No Twitch token available"))?;

    let config = state.config().await;
    let broadcaster_id = config.twitch_user_id.clone();
    let client_id = config.client_id.clone();
    drop(config);

    if broadcaster_id.is_empty() || client_id.is_empty() {
        return Err(err_json(400, "Twitch credentials not configured"));
    }

    let token = twitch_client::Token {
        access_token: db_token.access_token,
        refresh_token: db_token.refresh_token,
        scope: db_token.scope,
        expires_at: db_token.expires_at,
    };
    let api = twitch_client::api::TwitchApiClient::new(client_id);

    let mut updated_count = 0u32;
    let mut updated_participants = participants.clone();

    for p in &mut updated_participants {
        if p.user_id.starts_with("test-user-") {
            continue;
        }
        match api
            .get_user_subscription(&token, &broadcaster_id, &p.user_id)
            .await
        {
            Ok(Some(sub)) => {
                let was_sub = p.is_subscriber;
                p.is_subscriber = true;
                p.subscriber_tier = sub.tier;
                if !was_sub {
                    updated_count += 1;
                }
            }
            Ok(None) => {
                if p.is_subscriber {
                    p.is_subscriber = false;
                    p.subscriber_tier = String::new();
                    updated_count += 1;
                }
            }
            Err(e) => {
                tracing::warn!(user_id = %p.user_id, error = %e, "Failed to check subscription");
            }
        }
    }

    // Persist changes if any were updated
    if updated_count > 0 {
        state
            .db()
            .clear_all_lottery_participants()
            .map_err(|e| err_json(500, &e.to_string()))?;
        for p in &updated_participants {
            state
                .db()
                .add_lottery_participant(p)
                .map_err(|e| err_json(500, &e.to_string()))?;
        }
    }

    broadcast_participants_updated(&state);
    Ok(Json(json!({
        "success": true,
        "message": format!("{updated_count} participant(s) updated"),
        "updated": updated_count,
    })))
}

/// DELETE /api/present/participants/:user_id
pub async fn delete_present_participant(
    State(state): State<SharedState>,
    axum::extract::Path(user_id): axum::extract::Path<String>,
) -> ApiResult {
    state
        .db()
        .delete_lottery_participant(&user_id)
        .map_err(|e| err_json(500, &e.to_string()))?;
    broadcast_participants_updated(&state);
    Ok(Json(
        json!({ "success": true, "message": "Participant deleted" }),
    ))
}

/// PUT /api/present/participants/:user_id
pub async fn update_present_participant(
    State(state): State<SharedState>,
    axum::extract::Path(user_id): axum::extract::Path<String>,
    Json(body): Json<Value>,
) -> ApiResult {
    let mut participants = get_all_participants(&state)?;
    let mut found = false;

    for p in &mut participants {
        if p.user_id == user_id {
            found = true;
            if let Some(entry_count) = body.get("entry_count").and_then(|v| v.as_i64()) {
                p.entry_count = (entry_count as i32).clamp(1, 3);
            }
            if let Some(is_subscriber) = body.get("is_subscriber").and_then(|v| v.as_bool()) {
                p.is_subscriber = is_subscriber;
            }
            if let Some(subscriber_tier) = body.get("subscriber_tier").and_then(|v| v.as_str()) {
                p.subscriber_tier = subscriber_tier.to_string();
            }
            if let Some(display_name) = body.get("display_name").and_then(|v| v.as_str()) {
                if !display_name.is_empty() {
                    p.display_name = display_name.to_string();
                }
            }
        }
    }

    if !found {
        return Err(err_json(404, "Participant not found"));
    }

    state
        .db()
        .clear_all_lottery_participants()
        .map_err(|e| err_json(500, &e.to_string()))?;
    for p in &participants {
        state
            .db()
            .add_lottery_participant(p)
            .map_err(|e| err_json(500, &e.to_string()))?;
    }

    broadcast_participants_updated(&state);
    Ok(Json(
        json!({ "success": true, "message": "Participant updated" }),
    ))
}

fn get_all_participants(
    state: &SharedState,
) -> Result<Vec<LotteryParticipant>, (axum::http::StatusCode, Json<Value>)> {
    state
        .db()
        .get_all_lottery_participants()
        .map_err(|e| err_json(500, &e.to_string()))
}

fn weighted_participants(participants: &[LotteryParticipant]) -> Vec<LotteryParticipant> {
    let mut weighted = Vec::new();
    for p in participants {
        let count = p.entry_count.max(1).min(3) as usize;
        for _ in 0..count {
            weighted.push(p.clone());
        }
    }
    if weighted.is_empty() {
        return participants.to_vec();
    }
    weighted
}

fn broadcast_participant_added(state: &SharedState, participant: &LotteryParticipant) {
    let msg = json!({ "type": "lottery_participant_added", "data": participant });
    let _ = state.ws_sender().send(msg.to_string());
}

fn broadcast_participants_updated(state: &SharedState) {
    let participants = state
        .db()
        .get_all_lottery_participants()
        .unwrap_or_default();
    let msg = json!({ "type": "lottery_participants_updated", "data": participants });
    let _ = state.ws_sender().send(msg.to_string());
}

fn broadcast_participants_cleared(state: &SharedState) {
    let msg = json!({ "type": "lottery_participants_cleared", "data": null });
    let _ = state.ws_sender().send(msg.to_string());
}
