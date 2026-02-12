//! Reward counts and reward groups API.

use axum::extract::{Path, State};
use axum::Json;
use serde_json::{json, Value};

use crate::app::SharedState;

use super::err_json;

type ApiResult = Result<Json<Value>, (axum::http::StatusCode, Json<Value>)>;

// --- Reward Counts ---

/// GET /api/twitch/reward-counts
pub async fn get_all_counts(State(state): State<SharedState>) -> ApiResult {
    let counts = state
        .db()
        .get_all_reward_counts()
        .map_err(|e| err_json(500, &e.to_string()))?;
    Ok(Json(json!(counts)))
}

/// POST /api/twitch/reward-counts/reset
pub async fn reset_all_counts(State(state): State<SharedState>) -> ApiResult {
    state
        .db()
        .reset_all_reward_counts()
        .map_err(|e| err_json(500, &e.to_string()))?;
    broadcast_reward_update(&state);
    Ok(Json(json!({ "status": "success" })))
}

/// POST /api/twitch/reward-counts/:id/reset
pub async fn reset_count(
    State(state): State<SharedState>,
    Path(id): Path<String>,
) -> ApiResult {
    state
        .db()
        .reset_reward_count(&id)
        .map_err(|e| err_json(500, &e.to_string()))?;
    broadcast_reward_update(&state);
    Ok(Json(json!({ "status": "success" })))
}

/// DELETE /api/twitch/reward-counts/:reward_id/users/:index
pub async fn remove_user_from_count(
    State(state): State<SharedState>,
    Path((reward_id, index)): Path<(String, usize)>,
) -> ApiResult {
    state
        .db()
        .remove_one_user_from_reward_count(&reward_id, index)
        .map_err(|e| err_json(500, &e.to_string()))?;
    broadcast_reward_update(&state);
    Ok(Json(json!({ "success": true, "message": "User removed" })))
}

/// PUT /api/twitch/rewards/:id/display-name
pub async fn set_display_name(
    State(state): State<SharedState>,
    Path(id): Path<String>,
    Json(body): Json<Value>,
) -> ApiResult {
    let name = body["display_name"]
        .as_str()
        .ok_or_else(|| err_json(400, "display_name required"))?;
    state
        .db()
        .set_reward_display_name(&id, name)
        .map_err(|e| err_json(500, &e.to_string()))?;
    Ok(Json(json!({ "status": "ok" })))
}

// --- Reward Groups ---

/// GET /api/twitch/reward-groups
pub async fn get_groups(State(state): State<SharedState>) -> ApiResult {
    let groups = state
        .db()
        .get_reward_groups()
        .map_err(|e| err_json(500, &e.to_string()))?;

    let mut result = Vec::new();
    for g in groups {
        let ids = state.db().get_group_rewards(g.id).unwrap_or_default();
        result.push(json!({
            "id": g.id, "name": g.name, "is_enabled": g.is_enabled,
            "created_at": g.created_at, "updated_at": g.updated_at,
            "reward_ids": ids,
        }));
    }
    Ok(Json(json!({ "data": result })))
}

/// POST /api/twitch/reward-groups
pub async fn create_group(
    State(state): State<SharedState>,
    Json(body): Json<Value>,
) -> ApiResult {
    let name = body["name"]
        .as_str()
        .ok_or_else(|| err_json(400, "name required"))?;
    let g = state
        .db()
        .create_reward_group(name)
        .map_err(|e| err_json(500, &e.to_string()))?;
    Ok(Json(json!(g)))
}

/// DELETE /api/twitch/reward-groups/:id
pub async fn delete_group(
    State(state): State<SharedState>,
    Path(id): Path<i64>,
) -> ApiResult {
    state
        .db()
        .delete_reward_group(id)
        .map_err(|e| err_json(500, &e.to_string()))?;
    Ok(Json(json!({ "success": true, "message": "Group deleted" })))
}

/// POST /api/twitch/reward-groups/:id/toggle
pub async fn toggle_group(
    State(state): State<SharedState>,
    Path(id): Path<i64>,
) -> ApiResult {
    let g = state
        .db()
        .get_reward_group(id)
        .map_err(|e| err_json(404, &e.to_string()))?;
    let new_val = !g.is_enabled;
    state
        .db()
        .update_reward_group_enabled(id, new_val)
        .map_err(|e| err_json(500, &e.to_string()))?;
    Ok(Json(json!({ "success": true, "enabled": new_val })))
}

/// POST /api/twitch/reward-groups/:gid/rewards/:rid
pub async fn add_reward_to_group(
    State(state): State<SharedState>,
    Path((gid, rid)): Path<(i64, String)>,
) -> ApiResult {
    state
        .db()
        .add_reward_to_group(gid, &rid)
        .map_err(|e| err_json(500, &e.to_string()))?;
    Ok(Json(json!({ "success": true })))
}

/// DELETE /api/twitch/reward-groups/:gid/rewards/:rid
pub async fn remove_reward_from_group(
    State(state): State<SharedState>,
    Path((gid, rid)): Path<(i64, String)>,
) -> ApiResult {
    state
        .db()
        .remove_reward_from_group(gid, &rid)
        .map_err(|e| err_json(500, &e.to_string()))?;
    Ok(Json(json!({ "success": true })))
}

/// GET /api/twitch/reward-groups/:id/counts
pub async fn get_group_counts(
    State(state): State<SharedState>,
    Path(id): Path<i64>,
) -> ApiResult {
    let counts = state
        .db()
        .get_group_reward_counts(id)
        .map_err(|e| err_json(500, &e.to_string()))?;
    Ok(Json(json!(counts)))
}

fn broadcast_reward_update(state: &SharedState) {
    let counts = state.db().get_all_reward_counts().unwrap_or_default();
    let msg = json!({ "type": "reward_counts", "data": counts });
    let _ = state.ws_sender().send(msg.to_string());
}
