use axum::Json;
use axum::extract::State;
use serde_json::json;

use crate::app::SharedState;

use super::broadcast::broadcast_lottery_locked;
use super::{ApiResult, LOTTERY_RUNTIME, err_json};

/// POST /api/present/lock
pub async fn lock_present(State(state): State<SharedState>) -> ApiResult {
    set_lottery_locked(&state, true).await
}

/// POST /api/present/unlock
pub async fn unlock_present(State(state): State<SharedState>) -> ApiResult {
    set_lottery_locked(&state, false).await
}

async fn set_lottery_locked(state: &SharedState, is_locked: bool) -> ApiResult {
    state
        .db()
        .set_setting(
            "LOTTERY_LOCKED",
            if is_locked { "true" } else { "false" },
            "normal",
        )
        .map_err(|e| err_json(500, &e.to_string()))?;

    let mut runtime = LOTTERY_RUNTIME.write().await;
    runtime.is_locked = is_locked;
    drop(runtime);

    let reward_sync_warning = sync_twitch_reward_state(state, !is_locked).await;

    broadcast_lottery_locked(state, is_locked);

    Ok(Json(json!({
        "success": true,
        "message": if is_locked { "Lottery locked" } else { "Lottery unlocked" },
        "reward_sync_warning": reward_sync_warning,
    })))
}

async fn sync_twitch_reward_state(state: &SharedState, reward_enabled: bool) -> Option<String> {
    let reward_id = state
        .db()
        .get_setting("LOTTERY_REWARD_ID")
        .ok()
        .flatten()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let Some(reward_id) = reward_id else {
        return Some("LOTTERY_REWARD_ID is not configured; skipped Twitch reward sync".to_string());
    };

    let db_token = match state.db().get_latest_token().ok().flatten() {
        Some(token) => token,
        None => {
            return Some("Twitch token is not available; skipped Twitch reward sync".to_string());
        }
    };

    let config = state.config().await;
    if config.client_id.is_empty() || config.twitch_user_id.is_empty() {
        return Some(
            "Twitch credentials are not configured; skipped Twitch reward sync".to_string(),
        );
    }

    let token = twitch_client::Token {
        access_token: db_token.access_token,
        refresh_token: db_token.refresh_token,
        scope: db_token.scope,
        expires_at: db_token.expires_at,
    };

    let api = twitch_client::api::TwitchApiClient::new(config.client_id.clone());
    let broadcaster_id = config.twitch_user_id.clone();
    drop(config);

    match api
        .update_reward_enabled(&token, &broadcaster_id, &reward_id, reward_enabled)
        .await
    {
        Ok(_) => None,
        Err(error) => {
            tracing::warn!(%error, reward_id, reward_enabled, "Failed to sync lottery reward state");
            Some(format!("Failed to sync Twitch reward state: {error}"))
        }
    }
}
