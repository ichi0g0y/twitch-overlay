use axum::Json;
use axum::extract::State;
use serde_json::{Value, json};

use crate::app::SharedState;
use overlay_db::lottery::LotteryParticipant;

use super::broadcast::{
    broadcast_participant_added, broadcast_participants_cleared, broadcast_participants_updated,
};
use super::color::assign_color_to_participant;
use super::{ApiResult, LOTTERY_RUNTIME, err_json, get_all_participants, get_ticket_limits};

/// GET /api/lottery
pub async fn get_lottery(State(state): State<SharedState>) -> ApiResult {
    let participants = get_all_participants(&state)?;
    let (base_tickets_limit, final_tickets_limit) = get_ticket_limits(&state)?;

    Ok(Json(json!({
        "participants": participants,
        "count": participants.len(),
        "base_tickets_limit": base_tickets_limit,
        "final_tickets_limit": final_tickets_limit,
    })))
}

/// POST /api/lottery/add-participant
pub async fn add_participant(
    State(state): State<SharedState>,
    Json(body): Json<Value>,
) -> ApiResult {
    let user_id = body["user_id"].as_str().unwrap_or("").trim().to_string();
    if user_id.is_empty() {
        return Err(err_json(400, "user_id is required"));
    }

    let mut participant = LotteryParticipant {
        user_id,
        username: body["username"].as_str().unwrap_or("").to_string(),
        display_name: body["display_name"].as_str().unwrap_or("").to_string(),
        avatar_url: body["avatar_url"].as_str().unwrap_or("").to_string(),
        redeemed_at: body["redeemed_at"]
            .as_str()
            .filter(|v| !v.trim().is_empty())
            .unwrap_or(&chrono::Utc::now().to_rfc3339())
            .to_string(),
        is_subscriber: body["is_subscriber"].as_bool().unwrap_or(false),
        subscribed_months: body["subscribed_months"].as_i64().unwrap_or(0).max(0) as i32,
        subscriber_tier: body["subscriber_tier"].as_str().unwrap_or("").to_string(),
        entry_count: body["entry_count"].as_i64().unwrap_or(1) as i32,
        assigned_color: body["assigned_color"].as_str().unwrap_or("").to_string(),
    };

    let existing_participants = get_all_participants(&state)?;
    participant.assigned_color =
        assign_color_to_participant(&state, &participant, &existing_participants).await;

    state
        .db()
        .add_lottery_participant(&participant)
        .map_err(|e| err_json(500, &e.to_string()))?;

    let latest_participants = get_all_participants(&state)?;
    let persisted_participant = latest_participants
        .iter()
        .find(|p| p.user_id == participant.user_id)
        .cloned()
        .unwrap_or(participant.clone());

    broadcast_participant_added(&state, &persisted_participant);
    broadcast_participants_updated(&state, &latest_participants);

    Ok(Json(json!({
        "success": true,
        "participant": persisted_participant,
    })))
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

    let latest_participants = get_all_participants(&state)?;
    broadcast_participants_updated(&state, &latest_participants);
    Ok(Json(json!({ "success": true })))
}

/// GET /api/present/participants
pub async fn get_present_participants(State(state): State<SharedState>) -> ApiResult {
    let participants = get_all_participants(&state)?;
    let (base_tickets_limit, final_tickets_limit) = get_ticket_limits(&state)?;

    let mut runtime = LOTTERY_RUNTIME.write().await;
    if let Ok(Some(locked)) = state.db().get_setting("LOTTERY_LOCKED") {
        runtime.is_locked = locked == "true";
    }

    Ok(Json(json!({
        "enabled": true,
        "is_running": runtime.is_running,
        "is_locked": runtime.is_locked,
        "base_tickets_limit": base_tickets_limit,
        "final_tickets_limit": final_tickets_limit,
        "participants": participants,
        "winner": runtime.winner.clone(),
    })))
}

/// POST /api/present/test
pub async fn add_test_participant(State(state): State<SharedState>) -> ApiResult {
    let existing = get_all_participants(&state)?;
    let next_id = existing.len() + 1;

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

    let mut participant = LotteryParticipant {
        user_id: format!("test-user-{next_id}"),
        username: format!("test_user_{next_id}"),
        display_name: format!("テストユーザー{next_id}"),
        avatar_url: String::new(),
        redeemed_at: chrono::Utc::now().to_rfc3339(),
        is_subscriber,
        subscribed_months: if is_subscriber {
            (next_id % 24) as i32 + 1
        } else {
            0
        },
        subscriber_tier: subscriber_tier.to_string(),
        entry_count: ((next_id % 3) as i32 + 1).min(3),
        assigned_color: String::new(),
    };

    participant.assigned_color = assign_color_to_participant(&state, &participant, &existing).await;

    state
        .db()
        .add_lottery_participant(&participant)
        .map_err(|e| err_json(500, &e.to_string()))?;

    let latest_participants = get_all_participants(&state)?;
    let persisted_participant = latest_participants
        .iter()
        .find(|p| p.user_id == participant.user_id)
        .cloned()
        .unwrap_or(participant.clone());

    broadcast_participant_added(&state, &persisted_participant);
    broadcast_participants_updated(&state, &latest_participants);

    Ok(Json(json!({
        "success": true,
        "message": "Test participant added",
        "participant": persisted_participant,
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

    let latest_participants = get_all_participants(&state)?;
    broadcast_participants_updated(&state, &latest_participants);
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
    let participants = get_all_participants(&state)?;
    let Some(mut participant) = participants.iter().find(|p| p.user_id == user_id).cloned() else {
        return Err(err_json(404, "Participant not found"));
    };

    let base_tickets_limit = state
        .db()
        .get_lottery_settings()
        .map(|settings| settings.base_tickets_limit.max(1))
        .unwrap_or(3);

    let old_is_subscriber = participant.is_subscriber;

    if let Some(entry_count) = body.get("entry_count").and_then(|v| v.as_i64()) {
        participant.entry_count = (entry_count as i32).clamp(1, base_tickets_limit);
    }
    if let Some(is_subscriber) = body.get("is_subscriber").and_then(|v| v.as_bool()) {
        participant.is_subscriber = is_subscriber;
    }
    if let Some(subscriber_tier) = body.get("subscriber_tier").and_then(|v| v.as_str()) {
        participant.subscriber_tier = subscriber_tier.to_string();
    }
    if let Some(subscribed_months) = body.get("subscribed_months").and_then(|v| v.as_i64()) {
        participant.subscribed_months = (subscribed_months as i32).max(0);
    }
    if let Some(display_name) = body.get("display_name").and_then(|v| v.as_str()) {
        if !display_name.trim().is_empty() {
            participant.display_name = display_name.to_string();
        }
    }
    if let Some(username) = body.get("username").and_then(|v| v.as_str()) {
        if !username.trim().is_empty() {
            participant.username = username.to_string();
        }
    }

    let requested_assigned_color = body
        .get("assigned_color")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .unwrap_or("");

    if !requested_assigned_color.is_empty() {
        participant.assigned_color = requested_assigned_color.to_string();
    } else if participant.assigned_color.trim().is_empty()
        || participant.is_subscriber != old_is_subscriber
    {
        let others: Vec<_> = participants
            .iter()
            .filter(|p| p.user_id != user_id)
            .cloned()
            .collect();
        participant.assigned_color =
            assign_color_to_participant(&state, &participant, &others).await;
    }

    state
        .db()
        .update_lottery_participant(&user_id, &participant)
        .map_err(|e| err_json(500, &e.to_string()))?;

    let latest_participants = get_all_participants(&state)?;
    broadcast_participants_updated(&state, &latest_participants);

    Ok(Json(
        json!({ "success": true, "message": "Participant updated" }),
    ))
}
