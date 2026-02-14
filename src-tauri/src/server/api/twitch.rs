//! Twitch API endpoints (OAuth, verification, custom rewards, stream status).

use axum::Json;
use axum::extract::{Path, Query, State};
use axum::response::{Html, IntoResponse, Redirect};
use serde::Deserialize;
use serde_json::{Value, json};

use twitch_client::TwitchError;
use twitch_client::api::{CreateRewardRequest, TwitchApiClient, UpdateRewardRequest};
use twitch_client::auth::TwitchAuth;

use crate::app::SharedState;

use super::err_json;

type ApiResult = Result<Json<Value>, (axum::http::StatusCode, Json<Value>)>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn to_twitch_token(db: &overlay_db::tokens::Token) -> twitch_client::Token {
    twitch_client::Token {
        access_token: db.access_token.clone(),
        refresh_token: db.refresh_token.clone(),
        scope: db.scope.clone(),
        expires_at: db.expires_at,
    }
}

fn to_db_token(t: &twitch_client::Token) -> overlay_db::tokens::Token {
    overlay_db::tokens::Token {
        access_token: t.access_token.clone(),
        refresh_token: t.refresh_token.clone(),
        scope: t.scope.clone(),
        expires_at: t.expires_at,
    }
}

fn map_twitch_error(err: TwitchError) -> (axum::http::StatusCode, Json<Value>) {
    match err {
        TwitchError::AuthRequired => err_json(401, "Authentication required"),
        TwitchError::ApiError { status, message } => err_json(status, &message),
        other => err_json(500, &other.to_string()),
    }
}

async fn create_auth(
    state: &SharedState,
) -> Result<TwitchAuth, (axum::http::StatusCode, Json<Value>)> {
    let config = state.config().await;
    if config.client_id.is_empty() || config.client_secret.is_empty() {
        return Err(err_json(400, "Twitch credentials not configured"));
    }
    let redirect_uri = format!("http://127.0.0.1:{}/callback", config.server_port);
    Ok(TwitchAuth::new(
        config.client_id.clone(),
        config.client_secret.clone(),
        redirect_uri,
    ))
}

async fn get_valid_token(
    state: &SharedState,
) -> Result<twitch_client::Token, (axum::http::StatusCode, Json<Value>)> {
    let db_token = state
        .db()
        .get_latest_token()
        .map_err(|e| err_json(500, &e.to_string()))?
        .ok_or_else(|| err_json(401, "No Twitch token stored"))?;

    let current = to_twitch_token(&db_token);
    let auth = create_auth(state).await?;
    let refreshed = auth
        .get_or_refresh_token(&current)
        .await
        .map_err(map_twitch_error)?;

    if let Some(token) = refreshed {
        state
            .db()
            .save_token(&to_db_token(&token))
            .map_err(|e| err_json(500, &e.to_string()))?;
        tracing::info!(expires_at = token.expires_at, "Token auto-refreshed");
        return Ok(token);
    }

    Ok(current)
}

// ---------------------------------------------------------------------------
// Verification & Auth status
// ---------------------------------------------------------------------------

/// GET /api/twitch/verify
pub async fn verify_twitch(State(state): State<SharedState>) -> ApiResult {
    let config = state.config().await;
    let configured = !config.client_id.is_empty()
        && !config.client_secret.is_empty()
        && !config.twitch_user_id.is_empty();
    if !configured {
        return Ok(Json(
            json!({ "verified": false, "error": "Twitch credentials not configured" }),
        ));
    }
    let token = state
        .db()
        .get_latest_token()
        .map_err(|e| err_json(500, &e.to_string()))?;
    Ok(Json(json!({
        "verified": token.is_some(),
        "has_token": token.is_some(),
        "id": config.twitch_user_id
    })))
}

/// GET /api/settings/auth/status
pub async fn auth_status(State(state): State<SharedState>) -> ApiResult {
    let token = state
        .db()
        .get_latest_token()
        .map_err(|e| err_json(500, &e.to_string()))?;
    let auth_url = match create_auth(&state).await {
        Ok(auth) => auth.get_auth_url().unwrap_or_default(),
        Err(_) => String::new(),
    };
    Ok(Json(json!({
        "authenticated": token.is_some(),
        "authUrl": auth_url,
        "expiresAt": token.as_ref().map(|t| t.expires_at),
    })))
}

// ---------------------------------------------------------------------------
// OAuth flow
// ---------------------------------------------------------------------------

/// GET /auth – Redirect to Twitch OAuth
pub async fn auth_redirect(State(state): State<SharedState>) -> impl IntoResponse {
    let auth = match create_auth(&state).await {
        Ok(a) => a,
        Err(e) => return Err(e),
    };
    let url = auth
        .get_auth_url()
        .map_err(|e| err_json(500, &e.to_string()))?;
    Ok(Redirect::temporary(&url))
}

#[derive(Debug, Deserialize)]
pub struct CallbackQuery {
    pub code: Option<String>,
    pub error: Option<String>,
    pub error_description: Option<String>,
}

/// GET /callback – Exchange OAuth code for tokens.
pub async fn callback(
    State(state): State<SharedState>,
    Query(q): Query<CallbackQuery>,
) -> Result<Html<String>, (axum::http::StatusCode, Json<Value>)> {
    if let Some(error) = q.error {
        let desc = q.error_description.unwrap_or_default();
        return Ok(Html(format!(
            r#"<!DOCTYPE html><html><body><h2>認証エラー</h2><p>{error}: {desc}</p>
            <script>setTimeout(()=>window.close(),5000)</script></body></html>"#
        )));
    }
    let code = q
        .code
        .filter(|c| !c.is_empty())
        .ok_or_else(|| err_json(400, "OAuth code missing"))?;
    let auth = create_auth(&state).await?;
    let token = auth.exchange_code(&code).await.map_err(map_twitch_error)?;
    state
        .db()
        .save_token(&to_db_token(&token))
        .map_err(|e| err_json(500, &e.to_string()))?;
    tracing::info!(expires_at = token.expires_at, "OAuth token saved");
    let _ = state
        .ws_sender()
        .send(json!({"type":"auth_success","data":{"authenticated":true}}).to_string());

    Ok(Html(
        r#"<!DOCTYPE html><html><body>
<h2>認証成功！</h2><p>このウィンドウは自動的に閉じます。</p>
<script>setTimeout(()=>window.close(),2000)</script></body></html>"#
            .to_string(),
    ))
}

// ---------------------------------------------------------------------------
// Token refresh
// ---------------------------------------------------------------------------

/// POST /api/twitch/refresh-token
pub async fn refresh_token(State(state): State<SharedState>) -> ApiResult {
    let current = get_valid_token(&state).await?;
    let auth = create_auth(&state).await?;
    let new_token = auth
        .refresh_token(&current.refresh_token)
        .await
        .map_err(map_twitch_error)?;
    state
        .db()
        .save_token(&to_db_token(&new_token))
        .map_err(|e| err_json(500, &e.to_string()))?;
    tracing::info!(expires_at = new_token.expires_at, "Token refreshed");
    Ok(Json(
        json!({ "success": true, "expires_at": new_token.expires_at }),
    ))
}

// ---------------------------------------------------------------------------
// Stream status
// ---------------------------------------------------------------------------

/// GET /api/stream/status
pub async fn stream_status(State(state): State<SharedState>) -> ApiResult {
    let token = match get_valid_token(&state).await {
        Ok(t) => t,
        Err(_) => return Ok(Json(json!({ "is_live": false, "viewer_count": 0 }))),
    };
    let (client_id, twitch_user_id) = {
        let config = state.config().await;
        (config.client_id.clone(), config.twitch_user_id.clone())
    };
    if twitch_user_id.is_empty() {
        return Ok(Json(json!({ "is_live": false, "viewer_count": 0 })));
    }
    let client = TwitchApiClient::new(client_id);
    let status = client
        .get_stream_info(&token, &twitch_user_id)
        .await
        .map_err(map_twitch_error)?;
    state.set_stream_live(status.is_live).await;
    Ok(Json(json!({
        "is_live": status.is_live,
        "viewer_count": status.viewer_count,
        "info": status.info
    })))
}

// ---------------------------------------------------------------------------
// Custom rewards CRUD
// ---------------------------------------------------------------------------

/// GET /api/twitch/custom-rewards
pub async fn get_custom_rewards(State(state): State<SharedState>) -> ApiResult {
    let token = get_valid_token(&state).await?;
    let config = state.config().await;
    if config.twitch_user_id.is_empty() {
        return Err(err_json(400, "TWITCH_USER_ID is not configured"));
    }
    let client = TwitchApiClient::new(config.client_id.clone());
    let rewards = client
        .get_custom_rewards(&token, &config.twitch_user_id)
        .await
        .map_err(map_twitch_error)?;
    Ok(Json(json!({ "data": rewards })))
}

/// POST /api/twitch/custom-rewards
pub async fn create_custom_reward(
    State(state): State<SharedState>,
    Json(body): Json<Value>,
) -> ApiResult {
    let token = get_valid_token(&state).await?;
    let config = state.config().await;
    if config.twitch_user_id.is_empty() {
        return Err(err_json(400, "TWITCH_USER_ID is not configured"));
    }
    let client = TwitchApiClient::new(config.client_id.clone());
    let req = CreateRewardRequest {
        title: body["title"].as_str().unwrap_or("").to_string(),
        cost: body["cost"].as_u64().unwrap_or(100),
        prompt: body["prompt"].as_str().map(String::from),
        is_enabled: body["is_enabled"].as_bool(),
        background_color: body["background_color"].as_str().map(String::from),
        is_user_input_required: body["is_user_input_required"].as_bool(),
        should_redemptions_skip_request_queue: body["should_redemptions_skip_request_queue"]
            .as_bool(),
    };
    let reward = client
        .create_custom_reward(&token, &config.twitch_user_id, &req)
        .await
        .map_err(map_twitch_error)?;
    let _ = state
        .db()
        .record_app_created_reward(&reward.id, &reward.title);
    Ok(Json(json!({ "data": reward })))
}

/// POST /api/twitch/custom-rewards/create (legacy alias)
pub async fn create_custom_reward_legacy(
    state: State<SharedState>,
    body: Json<Value>,
) -> ApiResult {
    create_custom_reward(state, body).await
}

/// PUT /api/twitch/custom-rewards/:id
pub async fn update_custom_reward(
    State(state): State<SharedState>,
    Path(id): Path<String>,
    Json(body): Json<Value>,
) -> ApiResult {
    let token = get_valid_token(&state).await?;
    let config = state.config().await;
    if config.twitch_user_id.is_empty() {
        return Err(err_json(400, "TWITCH_USER_ID is not configured"));
    }
    let client = TwitchApiClient::new(config.client_id.clone());
    let req = UpdateRewardRequest {
        title: body["title"].as_str().map(String::from),
        cost: body["cost"].as_u64(),
        prompt: body["prompt"].as_str().map(String::from),
        is_enabled: body["is_enabled"].as_bool(),
        is_paused: body["is_paused"].as_bool(),
        background_color: body["background_color"].as_str().map(String::from),
    };
    let reward = client
        .update_custom_reward(&token, &config.twitch_user_id, &id, &req)
        .await
        .map_err(map_twitch_error)?;
    Ok(Json(json!({ "data": reward })))
}

/// PATCH /api/twitch/custom-rewards/:id/toggle
pub async fn toggle_custom_reward(
    State(state): State<SharedState>,
    Path(id): Path<String>,
    body: Option<Json<Value>>,
) -> ApiResult {
    let token = get_valid_token(&state).await?;
    let config = state.config().await;
    if config.twitch_user_id.is_empty() {
        return Err(err_json(400, "TWITCH_USER_ID is not configured"));
    }
    let client = TwitchApiClient::new(config.client_id.clone());

    let target_enabled = body
        .as_ref()
        .and_then(|b| b.get("is_enabled"))
        .and_then(|v| v.as_bool());

    let is_enabled = if let Some(v) = target_enabled {
        v
    } else {
        let rewards = client
            .get_custom_rewards(&token, &config.twitch_user_id)
            .await
            .map_err(map_twitch_error)?;
        let current = rewards
            .iter()
            .find(|r| r.id == id)
            .ok_or_else(|| err_json(404, "Reward not found"))?;
        !current.is_enabled
    };

    let reward = client
        .update_reward_enabled(&token, &config.twitch_user_id, &id, is_enabled)
        .await
        .map_err(map_twitch_error)?;
    Ok(Json(json!({ "data": reward })))
}

/// DELETE /api/twitch/custom-rewards/:id
pub async fn delete_custom_reward(
    State(state): State<SharedState>,
    Path(id): Path<String>,
) -> ApiResult {
    let token = get_valid_token(&state).await?;
    let config = state.config().await;
    if config.twitch_user_id.is_empty() {
        return Err(err_json(400, "TWITCH_USER_ID is not configured"));
    }
    let client = TwitchApiClient::new(config.client_id.clone());
    client
        .delete_custom_reward(&token, &config.twitch_user_id, &id)
        .await
        .map_err(map_twitch_error)?;
    Ok(Json(json!({ "success": true })))
}

// ---------------------------------------------------------------------------
// Reward groups by reward
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct RewardGroupByRewardQuery {
    pub reward_id: Option<String>,
}

/// GET /api/twitch/reward-groups/by-reward
pub async fn reward_groups_by_reward(
    State(state): State<SharedState>,
    Query(q): Query<RewardGroupByRewardQuery>,
) -> ApiResult {
    let reward_id = q.reward_id.unwrap_or_default();
    if reward_id.is_empty() {
        return Ok(Json(json!({ "data": [] })));
    }
    let groups = state
        .db()
        .get_reward_groups_by_reward_id(&reward_id)
        .map_err(|e| err_json(500, &e.to_string()))?;
    Ok(Json(json!({ "data": groups })))
}
