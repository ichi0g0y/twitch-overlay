//! Chat history API.

use axum::Json;
use axum::extract::{Query, State};
use serde::Deserialize;
use serde_json::{Value, json};
use twitch_client::api::{TwitchApiClient, TwitchUser};

use crate::app::SharedState;
use crate::notification::{queue, types};
use crate::services::channel_points_assets;

use super::err_json;

type ApiResult = Result<Json<Value>, (axum::http::StatusCode, Json<Value>)>;

#[derive(Debug, Deserialize)]
pub struct ChatQuery {
    pub since: Option<i64>,
    pub limit: Option<i64>,
    pub days: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct PostChatBody {
    pub message: String,
    pub username: Option<String>,
    pub user_id: Option<String>,
    pub avatar_url: Option<String>,
}

async fn resolve_default_user_id(state: &SharedState, body: &PostChatBody) -> String {
    if let Some(user_id) = body
        .user_id
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
    {
        return user_id;
    }

    let configured = {
        let config = state.config().await;
        config.twitch_user_id.clone()
    };
    if !configured.trim().is_empty() {
        return configured;
    }

    "webui-local".to_string()
}

async fn resolve_default_username(state: &SharedState, user_id: &str) -> String {
    match state.db().get_chat_user_profile(user_id) {
        Ok(Some(profile)) if !profile.username.trim().is_empty() => profile.username,
        _ => {
            if !user_id.trim().is_empty() {
                return user_id.to_string();
            }
            "WebUI".to_string()
        }
    }
}

async fn resolve_avatar_url(state: &SharedState, body: &PostChatBody, user_id: &str) -> String {
    if let Some(avatar_url) = body
        .avatar_url
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
    {
        return avatar_url;
    }

    if let Ok(Some(profile)) = state.db().get_chat_user_profile(user_id) {
        if !profile.avatar_url.trim().is_empty() {
            return profile.avatar_url;
        }
    }

    if let Ok(Some(cached)) = state.db().get_latest_chat_avatar(user_id) {
        if !cached.trim().is_empty() {
            return cached;
        }
    }

    channel_points_assets::fetch_reward_avatar_url(state, user_id).await
}

async fn fetch_twitch_user_profile(state: &SharedState, user_id: &str) -> Option<TwitchUser> {
    if user_id.trim().is_empty() {
        return None;
    }

    let (client_id, access_token, refresh_token, scope, expires_at) = {
        let config = state.config().await;
        let token = state.db().get_latest_token().ok().flatten()?;
        (
            config.client_id.clone(),
            token.access_token,
            token.refresh_token,
            token.scope,
            token.expires_at,
        )
    };

    if client_id.is_empty() || access_token.is_empty() {
        return None;
    }

    let token = twitch_client::Token {
        access_token,
        refresh_token,
        scope,
        expires_at,
    };
    let client = TwitchApiClient::new(client_id);
    client.get_user(&token, user_id).await.ok()
}

/// GET /api/chat/messages
pub async fn get_messages(
    State(state): State<SharedState>,
    Query(q): Query<ChatQuery>,
) -> ApiResult {
    let since = q
        .since
        .or_else(|| {
            q.days
                .map(|days| chrono::Utc::now().timestamp() - (days * 24 * 3600))
        })
        .unwrap_or(0);
    let messages = state
        .db()
        .get_chat_messages_since(since, q.limit)
        .map_err(|e| err_json(500, &e.to_string()))?;
    Ok(Json(
        json!({ "messages": messages, "count": messages.len() }),
    ))
}

/// GET /api/chat/history (legacy compatibility endpoint)
pub async fn get_history(
    State(state): State<SharedState>,
    Query(q): Query<ChatQuery>,
) -> ApiResult {
    let since = q
        .since
        .or_else(|| {
            q.days
                .map(|days| chrono::Utc::now().timestamp() - (days * 24 * 3600))
        })
        .unwrap_or(0);
    let messages = state
        .db()
        .get_chat_messages_since(since, q.limit)
        .map_err(|e| err_json(500, &e.to_string()))?;
    Ok(Json(json!({ "messages": messages })))
}

/// POST /api/chat/post
pub async fn post_chat_message(
    State(state): State<SharedState>,
    Json(body): Json<PostChatBody>,
) -> ApiResult {
    let message = body.message.trim().to_string();
    if message.is_empty() {
        return Err(err_json(400, "message is required"));
    }

    let user_id = resolve_default_user_id(&state, &body).await;
    let username = body
        .username
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "".to_string());
    let mut username = if username.is_empty() {
        resolve_default_username(&state, &user_id).await
    } else {
        username
    };

    let now = chrono::Utc::now();
    let created_at = now.timestamp();
    let message_id = format!("local-{}", now.timestamp_micros());

    let mut avatar_url = resolve_avatar_url(&state, &body, &user_id).await;
    if (username == user_id || username.eq_ignore_ascii_case("webui")) || avatar_url.is_empty() {
        if let Some(user) = fetch_twitch_user_profile(&state, &user_id).await {
            if username == user_id || username.eq_ignore_ascii_case("webui") {
                username = if !user.display_name.trim().is_empty() {
                    user.display_name
                } else {
                    user.login
                };
            }
            if avatar_url.is_empty() {
                avatar_url = user.profile_image_url;
            }
        }
    }

    let fragments = json!([{ "type": "text", "text": message }]);
    let msg = overlay_db::chat::ChatMessage {
        id: 0,
        message_id: message_id.clone(),
        user_id: user_id.clone(),
        username: username.clone(),
        message: message.clone(),
        fragments_json: fragments.to_string(),
        avatar_url: String::new(),
        translation_text: String::new(),
        translation_status: String::new(),
        translation_lang: String::new(),
        created_at,
    };

    state
        .db()
        .upsert_chat_user_profile(&user_id, &username, &avatar_url, created_at)
        .map_err(|e| err_json(500, &e.to_string()))?;

    state
        .db()
        .add_chat_message(&msg)
        .map_err(|e| err_json(500, &e.to_string()))?;

    let ws_payload = json!({
        "username": username,
        "userId": user_id,
        "messageId": message_id,
        "message": message,
        "fragments": [{
            "type": "text",
            "text": msg.message,
        }],
        "avatarUrl": avatar_url,
        "translation": "",
        "translationStatus": "",
        "translationLang": "",
        "timestamp": now.to_rfc3339(),
    });
    let broadcast = json!({ "type": "chat-message", "data": ws_payload.clone() });
    let _ = state.ws_sender().send(broadcast.to_string());

    let notif = types::ChatNotification {
        username: username.clone(),
        message: message.clone(),
        fragments: vec![types::FragmentInfo::Text(message.clone())],
        avatar_url: if avatar_url.is_empty() {
            None
        } else {
            Some(avatar_url.clone())
        },
        color: None,
        display_mode: types::DisplayMode::Queue,
        notification_type: types::NotificationType::Chat,
    };
    let _ = queue::enqueue(notif).await;

    Ok(Json(json!({ "status": "ok", "message": ws_payload })))
}

/// POST /api/chat/cleanup
pub async fn cleanup_messages(
    State(state): State<SharedState>,
    Json(body): Json<Value>,
) -> ApiResult {
    let hours = body["hours"].as_i64().unwrap_or(24);
    let cutoff = chrono::Utc::now().timestamp() - (hours * 3600);
    state
        .db()
        .cleanup_chat_messages_before(cutoff)
        .map_err(|e| err_json(500, &e.to_string()))?;
    Ok(Json(
        json!({ "status": "ok", "message": format!("Cleaned up messages older than {hours}h") }),
    ))
}

/// GET /api/chat/avatar/:user_id
pub async fn get_avatar(
    State(state): State<SharedState>,
    axum::extract::Path(user_id): axum::extract::Path<String>,
) -> ApiResult {
    let url = state
        .db()
        .get_latest_chat_avatar(&user_id)
        .map_err(|e| err_json(500, &e.to_string()))?;
    Ok(Json(json!({ "avatar_url": url })))
}
