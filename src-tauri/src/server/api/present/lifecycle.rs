use axum::Json;
use axum::extract::State;
use serde_json::json;

use crate::app::SharedState;

use overlay_db::lottery::LotteryParticipant;
use overlay_db::lottery_engine::{self, DrawOptions, LotteryError};
use overlay_db::lottery_history::LotteryHistory;

use super::broadcast::{
    broadcast_lottery_started, broadcast_lottery_stopped, broadcast_lottery_winner,
};
use super::participants::clear_lottery;
use super::{ApiResult, LOTTERY_RUNTIME, err_json, get_all_participants};

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
    drop(runtime);

    broadcast_lottery_started(&state, &participants);

    Ok(Json(
        json!({ "success": true, "message": "Lottery started" }),
    ))
}

/// POST /api/present/stop
pub async fn stop_present(State(state): State<SharedState>) -> ApiResult {
    let mut runtime = LOTTERY_RUNTIME.write().await;
    if !runtime.is_running {
        return Err(err_json(400, "Lottery not running"));
    }
    runtime.is_running = false;
    drop(runtime);

    execute_draw(&state).await
}

/// POST /api/present/draw
pub async fn draw_present(State(state): State<SharedState>) -> ApiResult {
    execute_draw(&state).await
}

/// POST /api/lottery/draw
pub async fn draw_lottery(State(state): State<SharedState>) -> ApiResult {
    execute_draw(&state).await
}

/// POST /api/present/clear
pub async fn clear_present(State(state): State<SharedState>) -> ApiResult {
    clear_lottery(State(state)).await
}

async fn execute_draw(state: &SharedState) -> ApiResult {
    let participants = get_all_participants(state)?;
    if participants.is_empty() {
        return Err(err_json(400, "No participants"));
    }

    let mut settings = state
        .db()
        .get_lottery_settings()
        .map_err(|e| err_json(500, &e.to_string()))?;

    let draw_result = lottery_engine::draw_lottery(
        &participants,
        &DrawOptions {
            base_tickets_limit: settings.base_tickets_limit,
            final_tickets_limit: settings.final_tickets_limit,
            last_winner: settings.last_winner.clone(),
        },
    )
    .map_err(map_draw_error)?;

    let winner = draw_result.winner.clone();
    let winner_index = find_winner_index(&participants, &winner.user_id);

    {
        let mut runtime = LOTTERY_RUNTIME.write().await;
        runtime.is_running = false;
        runtime.winner = Some(winner.clone());
    }

    settings.last_winner = winner.username.clone();
    if let Err(error) = state.db().update_lottery_settings(&settings) {
        tracing::warn!(%error, "Failed to update lottery last winner");
    }

    if let Err(error) = save_lottery_history(state, &settings, &draw_result, &winner.username) {
        tracing::warn!(%error, "Failed to save lottery history");
    }

    broadcast_lottery_stopped(state);
    broadcast_lottery_winner(
        state,
        &winner,
        winner_index,
        draw_result.total_participants,
        draw_result.total_tickets,
        &draw_result.participants_detail,
    );

    Ok(Json(json!({
        "success": true,
        "message": "Lottery stopped",
        "winner": winner,
        "winner_index": winner_index,
        "total_participants": draw_result.total_participants,
        "total_tickets": draw_result.total_tickets,
        "participants_detail": draw_result.participants_detail,
    })))
}

fn map_draw_error(error: LotteryError) -> (axum::http::StatusCode, Json<serde_json::Value>) {
    match error {
        LotteryError::NoParticipants => err_json(400, "No participants"),
        LotteryError::NoEligibleParticipants => err_json(400, "No eligible participants"),
        LotteryError::InvalidTotalTickets => err_json(500, "Invalid total tickets"),
    }
}

fn find_winner_index(participants: &[LotteryParticipant], user_id: &str) -> i32 {
    participants
        .iter()
        .position(|participant| participant.user_id == user_id)
        .map(|index| index as i32)
        .unwrap_or(-1)
}

fn save_lottery_history(
    state: &SharedState,
    settings: &overlay_db::lottery_settings::LotterySettings,
    draw_result: &overlay_db::lottery_engine::DrawResult,
    winner_username: &str,
) -> Result<(), overlay_db::DbError> {
    let participants_json = serde_json::to_string(&draw_result.participants_detail)
        .unwrap_or_else(|_| "[]".to_string());
    let reward_ids_json = if settings.reward_id.trim().is_empty() {
        "[]".to_string()
    } else {
        serde_json::to_string(&vec![settings.reward_id.clone()])
            .unwrap_or_else(|_| "[]".to_string())
    };

    state.db().save_lottery_history(&LotteryHistory {
        id: 0,
        winner_name: winner_username.to_string(),
        total_participants: draw_result.total_participants,
        total_tickets: draw_result.total_tickets,
        participants_json,
        reward_ids_json,
        drawn_at: String::new(),
    })
}
