use axum::Json;
use axum::extract::State;
use serde::Deserialize;

use crate::app::SharedState;

use super::broadcast::broadcast_lottery_winner_reset;
use super::{ApiResult, LOTTERY_RUNTIME, err_json};

#[derive(Debug, Deserialize)]
pub struct LotterySettingsUpdateRequest {
    pub reward_id: Option<String>,
    pub last_winner: Option<String>,
    pub base_tickets_limit: Option<i32>,
    pub final_tickets_limit: Option<i32>,
}

/// GET /api/lottery/settings
pub async fn get_lottery_settings(State(state): State<SharedState>) -> ApiResult {
    let settings = state
        .db()
        .get_lottery_settings()
        .map_err(|e| err_json(500, &e.to_string()))?;

    Ok(Json(
        serde_json::to_value(settings).unwrap_or_else(|_| serde_json::json!({})),
    ))
}

/// PUT /api/lottery/settings
pub async fn update_lottery_settings(
    State(state): State<SharedState>,
    Json(body): Json<LotterySettingsUpdateRequest>,
) -> ApiResult {
    let mut settings = state
        .db()
        .get_lottery_settings()
        .map_err(|e| err_json(500, &e.to_string()))?;

    if let Some(reward_id) = body.reward_id {
        settings.reward_id = reward_id.trim().to_string();
    }
    if let Some(last_winner) = body.last_winner {
        settings.last_winner = last_winner.trim().to_string();
    }
    if let Some(base_tickets_limit) = body.base_tickets_limit {
        if base_tickets_limit <= 0 {
            return Err(err_json(400, "base_tickets_limit must be greater than 0"));
        }
        settings.base_tickets_limit = base_tickets_limit;
    }
    if let Some(final_tickets_limit) = body.final_tickets_limit {
        if final_tickets_limit < 0 {
            return Err(err_json(
                400,
                "final_tickets_limit must be greater than or equal to 0",
            ));
        }
        settings.final_tickets_limit = final_tickets_limit;
    }

    state
        .db()
        .update_lottery_settings(&settings)
        .map_err(|e| err_json(500, &e.to_string()))?;

    let updated = state
        .db()
        .get_lottery_settings()
        .map_err(|e| err_json(500, &e.to_string()))?;

    Ok(Json(
        serde_json::to_value(updated).unwrap_or_else(|_| serde_json::json!({})),
    ))
}

/// POST /api/lottery/reset-winner
pub async fn reset_lottery_winner(State(state): State<SharedState>) -> ApiResult {
    state
        .db()
        .reset_last_winner()
        .map_err(|e| err_json(500, &e.to_string()))?;

    let mut runtime = LOTTERY_RUNTIME.write().await;
    runtime.winner = None;
    drop(runtime);

    broadcast_lottery_winner_reset(&state);

    Ok(Json(
        serde_json::json!({ "success": true, "message": "Last winner reset" }),
    ))
}
