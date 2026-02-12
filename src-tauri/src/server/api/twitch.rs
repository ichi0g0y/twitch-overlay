//! Twitch API endpoints (OAuth, verification, custom rewards, stream status).

use axum::extract::State;
use axum::Json;
use serde_json::{json, Value};

use crate::app::SharedState;

use super::err_json;

type ApiResult = Result<Json<Value>, (axum::http::StatusCode, Json<Value>)>;

/// GET /api/twitch/verify – Verify Twitch configuration
pub async fn verify_twitch(State(state): State<SharedState>) -> ApiResult {
    let config = state.config().await;
    let configured = !config.client_id.is_empty()
        && !config.client_secret.is_empty()
        && !config.twitch_user_id.is_empty();

    if !configured {
        return Ok(Json(json!({
            "verified": false,
            "error": "Twitch credentials not configured",
        })));
    }

    // Check for stored token
    let token = state
        .db()
        .get_latest_token()
        .map_err(|e| err_json(500, &e.to_string()))?;

    Ok(Json(json!({
        "verified": token.is_some(),
        "has_token": token.is_some(),
        "id": config.twitch_user_id,
    })))
}

/// GET /api/settings/auth/status
pub async fn auth_status(State(state): State<SharedState>) -> ApiResult {
    let token = state
        .db()
        .get_latest_token()
        .map_err(|e| err_json(500, &e.to_string()))?;

    let config = state.config().await;
    let auth_url = if !config.client_id.is_empty() {
        format!(
            "https://id.twitch.tv/oauth2/authorize?client_id={}&redirect_uri=http://localhost:30303/callback&response_type=code&scope=user:read:chat+channel:read:subscriptions+bits:read+channel:read:redemptions+moderator:read:followers+channel:manage:redemptions",
            config.client_id
        )
    } else {
        String::new()
    };

    Ok(Json(json!({
        "authenticated": token.is_some(),
        "authUrl": auth_url,
        "expiresAt": token.as_ref().map(|t| t.expires_at),
    })))
}

/// POST /api/twitch/refresh-token
pub async fn refresh_token(State(state): State<SharedState>) -> ApiResult {
    // TODO: Implement token refresh via twitch-client crate
    let token = state
        .db()
        .get_latest_token()
        .map_err(|e| err_json(500, &e.to_string()))?;

    Ok(Json(json!({
        "success": token.is_some(),
        "authenticated": token.is_some(),
        "message": "Token refresh not yet implemented in Rust backend",
    })))
}

/// GET /api/stream/status
pub async fn stream_status(State(_state): State<SharedState>) -> ApiResult {
    // TODO: Integrate with twitch-client for live stream status
    Ok(Json(json!({
        "is_live": false,
        "viewer_count": 0,
    })))
}
