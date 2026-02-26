
use std::collections::{HashMap, HashSet};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use axum::Json;
use axum::extract::{Query, State};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use twitch_client::Token;
use twitch_client::api::TwitchApiClient;
use twitch_client::auth::TwitchAuth;
use twitch_client::emotes::{Emote, EmoteCache};

use crate::app::SharedState;

type ApiResult = Result<Json<Value>, (axum::http::StatusCode, Json<Value>)>;

#[derive(Debug, Deserialize)]
pub struct EmotesQuery {
    pub channels: Option<String>,
    pub priority_channel: Option<String>,
    pub refresh: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct EmoteFavoritesPayload {
    pub keys: Vec<String>,
}

#[derive(Clone)]
struct TwitchRuntime {
    client_id: String,
    broadcaster_id: String,
    token: Token,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "snake_case")]
enum EmoteSource {
    Channel,
    Special,
    Unlocked,
    Global,
}

#[derive(Debug, Clone, Serialize)]
struct EmoteItem {
    id: String,
    name: String,
    url: String,
    source: EmoteSource,
    channel_login: Option<String>,
    usable: bool,
    emote_type: Option<String>,
    tier: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
struct EmoteGroup {
    id: String,
    label: String,
    source: EmoteSource,
    channel_login: Option<String>,
    channel_avatar_url: Option<String>,
    priority: bool,
    emotes: Vec<EmoteItem>,
}

#[derive(Debug, Clone)]
struct UserEmoteCacheEntry {
    cached_at: Instant,
    emotes: Vec<Emote>,
    owner_login_by_id: HashMap<String, String>,
    owner_display_name_by_login: HashMap<String, String>,
    owner_avatar_url_by_login: HashMap<String, String>,
}

#[derive(Debug, Clone)]
struct ChannelEmoteCacheEntry {
    cached_at: Instant,
    emotes: Vec<Emote>,
}

const USER_EMOTE_CACHE_TTL: Duration = Duration::from_secs(300);
const CHANNEL_EMOTE_CACHE_TTL: Duration = Duration::from_secs(300);
const EMOTE_FAVORITES_SETTING_KEY: &str = "chat.emote_picker.favorites.v1";
const EMOTE_FAVORITES_MAX_ENTRIES: usize = 200;

static USER_EMOTE_CACHE: OnceLock<Mutex<HashMap<String, UserEmoteCacheEntry>>> = OnceLock::new();
static CHANNEL_EMOTE_CACHE: OnceLock<Mutex<HashMap<String, ChannelEmoteCacheEntry>>> =
    OnceLock::new();

fn user_emote_cache_map() -> &'static Mutex<HashMap<String, UserEmoteCacheEntry>> {
    USER_EMOTE_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn channel_emote_cache_map() -> &'static Mutex<HashMap<String, ChannelEmoteCacheEntry>> {
    CHANNEL_EMOTE_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn sanitize_favorite_keys(keys: Vec<String>) -> Vec<String> {
    let mut next = Vec::new();
    let mut seen = HashSet::new();
    for raw in keys {
        let key = raw.trim();
        if key.is_empty() || !seen.insert(key.to_string()) {
            continue;
        }
        next.push(key.to_string());
        if next.len() >= EMOTE_FAVORITES_MAX_ENTRIES {
            break;
        }
    }
    next
}

fn load_favorite_keys_from_db(state: &SharedState) -> Result<Vec<String>, String> {
    let raw = state
        .db()
        .get_setting(EMOTE_FAVORITES_SETTING_KEY)
        .map_err(|e| format!("Failed to read emote favorites: {e}"))?;
    let Some(raw) = raw else {
        return Ok(Vec::new());
    };

    let parsed = serde_json::from_str::<Vec<String>>(&raw).unwrap_or_default();
    Ok(sanitize_favorite_keys(parsed))
}

/// GET /api/emotes/favorites
pub async fn get_emote_favorites(State(state): State<SharedState>) -> ApiResult {
    let keys = load_favorite_keys_from_db(&state).map_err(|message| {
        (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({
                "status": "error",
                "error": message,
            })),
        )
    })?;

    Ok(Json(json!({
        "status": "ok",
        "data": {
            "keys": keys,
        }
    })))
}

/// PUT /api/emotes/favorites
pub async fn put_emote_favorites(
    State(state): State<SharedState>,
    Json(body): Json<EmoteFavoritesPayload>,
) -> ApiResult {
    let keys = sanitize_favorite_keys(body.keys);
    let serialized = serde_json::to_string(&keys).map_err(|e| {
        (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({
                "status": "error",
                "error": format!("Failed to serialize emote favorites: {e}"),
            })),
        )
    })?;

    state
        .db()
        .set_setting(EMOTE_FAVORITES_SETTING_KEY, &serialized, "normal")
        .map_err(|e| {
            (
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({
                    "status": "error",
                    "error": format!("Failed to save emote favorites: {e}"),
                })),
            )
        })?;

    Ok(Json(json!({
        "status": "ok",
        "data": {
            "keys": keys,
        }
    })))
}

fn token_has_scope(scope_csv: &str, required_scope: &str) -> bool {
    scope_csv
        .split([' ', ','])
        .map(|scope| scope.trim())
        .any(|scope| !scope.is_empty() && scope == required_scope)
}

fn normalize_channel_login(raw: &str) -> Option<String> {
    let normalized = raw.trim().trim_start_matches('#').to_ascii_lowercase();
    if normalized.len() < 3 || normalized.len() > 25 {
        return None;
    }
    if normalized
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
    {
        Some(normalized)
    } else {
        None
    }
}

fn parse_channel_logins_csv(raw: Option<&str>) -> Vec<String> {
    let Some(csv) = raw else {
        return Vec::new();
    };

    let mut out = Vec::new();
    let mut seen = HashSet::new();
    for token in csv.split(',') {
        let Some(login) = normalize_channel_login(token) else {
            continue;
        };
        if seen.insert(login.clone()) {
            out.push(login);
        }
    }
    out
}

