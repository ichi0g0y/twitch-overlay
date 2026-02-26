
use axum::Json;
use axum::extract::{Query, State};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::HashSet;
use tokio::time::{Duration, Instant, timeout};
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message as WsMessage;
use twitch_client::TwitchError;
use twitch_client::api::{TwitchApiClient, TwitchUser};

use crate::app::SharedState;
use crate::notification::{queue, types};
use crate::services::channel_points_assets;

use super::err_json;

type ApiResult = Result<Json<Value>, (axum::http::StatusCode, Json<Value>)>;
const IRC_RETENTION_MAX_MESSAGES_PER_CHANNEL: i64 = 20_000;
const TWITCH_IRC_WS_ENDPOINT: &str = "wss://irc-ws.chat.twitch.tv:443";
const TWITCH_IRC_SEND_TIMEOUT_SECS: u64 = 8;
const IVR_TWITCH_USER_API_BASE: &str = "https://api.ivr.fi/v2/twitch/user";
const DECAPI_TWITCH_FOLLOWCOUNT_BASE: &str = "https://decapi.me/twitch/followcount";
const USER_PROFILE_DETAIL_CACHE_KEY_PREFIX: &str = "chat_user_profile_detail:";
const USER_PROFILE_DETAIL_CACHE_TTL_SECONDS: i64 = 24 * 60 * 60;

struct TwitchIrcIdentity {
    token: twitch_client::Token,
    sender_user: TwitchUser,
    nick: String,
}

#[derive(Debug, Deserialize)]
struct IvrTwitchUser {
    #[serde(default)]
    banner: String,
    #[serde(default)]
    followers: Option<u64>,
}

#[derive(Debug)]
struct IvrProfileSnapshot {
    banner: String,
    followers: Option<u64>,
}

#[derive(Debug, Deserialize)]
pub struct ChatQuery {
    pub since: Option<i64>,
    pub limit: Option<i64>,
    pub days: Option<i64>,
    pub channel: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct PostChatBody {
    pub message: String,
    pub username: Option<String>,
    pub user_id: Option<String>,
    pub avatar_url: Option<String>,
    pub channel: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ChatUserProfileBody {
    pub user_id: String,
    pub username: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ChatUserProfileDetailBody {
    pub user_id: Option<String>,
    pub username: Option<String>,
    pub login: Option<String>,
    pub force_refresh: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct IrcChatMessageBody {
    pub channel: String,
    pub message_id: Option<String>,
    pub user_id: Option<String>,
    pub username: Option<String>,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub message: String,
    pub badge_keys: Option<Vec<String>>,
    pub fragments: Option<Value>,
    pub timestamp: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct IrcChannelProfilesQuery {
    pub channels: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct IrcChannelProfileBody {
    pub channel: String,
    pub display_name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ChatModerationAction {
    Timeout,
    Block,
}

#[derive(Debug, Deserialize)]
pub struct ChatModerationActionBody {
    pub action: ChatModerationAction,
    pub user_id: String,
    pub duration_seconds: Option<u32>,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CachedUserProfileDetail {
    user_id: String,
    username: String,
    avatar_url: String,
    display_name: String,
    login: String,
    description: String,
    user_type: String,
    broadcaster_type: String,
    profile_image_url: String,
    cover_image_url: String,
    follower_count: Option<u64>,
    view_count: u64,
    created_at: String,
    cached_at: i64,
}

#[derive(Debug, Clone, Copy)]
struct ModerationCapabilities {
    can_timeout: bool,
    can_block: bool,
}

fn user_profile_detail_cache_key(user_id: &str) -> Option<String> {
    let normalized = user_id.trim();
    if normalized.is_empty() {
        return None;
    }
    Some(format!(
        "{USER_PROFILE_DETAIL_CACHE_KEY_PREFIX}{normalized}"
    ))
}

fn cached_user_profile_to_json(
    cached: &CachedUserProfileDetail,
    capabilities: ModerationCapabilities,
) -> Value {
    json!({
        "user_id": cached.user_id,
        "username": cached.username,
        "avatar_url": cached.avatar_url,
        "display_name": cached.display_name,
        "login": cached.login,
        "description": cached.description,
        "user_type": cached.user_type,
        "broadcaster_type": cached.broadcaster_type,
        "profile_image_url": cached.profile_image_url,
        "cover_image_url": cached.cover_image_url,
        "follower_count": cached.follower_count,
        "view_count": cached.view_count,
        "created_at": cached.created_at,
        "can_timeout": capabilities.can_timeout,
        "can_block": capabilities.can_block,
    })
}

fn load_cached_user_profile_detail(
    state: &SharedState,
    user_id: &str,
) -> Result<Option<CachedUserProfileDetail>, (axum::http::StatusCode, Json<Value>)> {
    let Some(cache_key) = user_profile_detail_cache_key(user_id) else {
        return Ok(None);
    };
    let Some(raw) = state
        .db()
        .get_setting(&cache_key)
        .map_err(|e| err_json(500, &e.to_string()))?
    else {
        return Ok(None);
    };

    match serde_json::from_str::<CachedUserProfileDetail>(&raw) {
        Ok(parsed) => Ok(Some(parsed)),
        Err(_) => Ok(None),
    }
}

fn save_cached_user_profile_detail(state: &SharedState, profile: &CachedUserProfileDetail) {
    let Some(cache_key) = user_profile_detail_cache_key(&profile.user_id) else {
        return;
    };
    let Ok(raw) = serde_json::to_string(profile) else {
        return;
    };
    if let Err(err) = state
        .db()
        .set_setting(&cache_key, &raw, "chat_profile_cache")
    {
        tracing::warn!("Failed to persist user profile detail cache: {err}");
    }
}

fn normalize_channel_login(raw: &str) -> Option<String> {
    let normalized = raw.trim().trim_start_matches('#').to_lowercase();
    if normalized.len() < 3 || normalized.len() > 25 {
        return None;
    }
    if !normalized
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
    {
        return None;
    }
    Some(normalized)
}

fn parse_channel_logins_csv(raw: Option<&str>) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut channels = Vec::new();
    let Some(csv) = raw else {
        return channels;
    };

    for token in csv.split(',') {
        let Some(channel) = normalize_channel_login(token) else {
            continue;
        };
        if seen.insert(channel.clone()) {
            channels.push(channel);
        }
    }
    channels
}

fn token_has_scope(scope_csv: &str, required_scope: &str) -> bool {
    scope_csv
        .split(|ch: char| ch.is_whitespace() || ch == ',')
        .map(str::trim)
        .any(|scope| !scope.is_empty() && scope == required_scope)
}

