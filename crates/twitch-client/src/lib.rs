//! Twitch integration client library.
//!
//! Provides OAuth authentication, EventSub WebSocket client,
//! REST API client, and emote handling.

pub mod api;
pub mod auth;
pub mod emotes;
pub mod eventsub;

use serde::{Deserialize, Serialize};

/// Token data for OAuth authentication.
///
/// The caller is responsible for persisting this (e.g. via overlay-db).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Token {
    pub access_token: String,
    pub refresh_token: String,
    pub scope: String,
    pub expires_at: i64,
}

/// Unified error type for the twitch-client crate.
#[derive(Debug, thiserror::Error)]
pub enum TwitchError {
    #[error("HTTP request failed: {0}")]
    Http(#[from] reqwest::Error),

    #[error("WebSocket error: {0}")]
    WebSocket(#[from] tokio_tungstenite::tungstenite::Error),

    #[error("JSON parse error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("Authentication required: no valid token")]
    AuthRequired,

    #[error("Token refresh failed: {0}")]
    TokenRefreshFailed(String),

    #[error("Twitch API error (status {status}): {message}")]
    ApiError { status: u16, message: String },

    #[error("EventSub error: {0}")]
    EventSub(String),

    #[error("Connection timeout")]
    Timeout,

    #[error("URL parse error: {0}")]
    UrlParse(#[from] url::ParseError),
}

/// OAuth scopes required by this application.
pub const SCOPES: &[&str] = &[
    "user:read:chat",
    "channel:read:subscriptions",
    "bits:read",
    "chat:read",
    "chat:edit",
    "moderator:read:followers",
    "channel:manage:redemptions",
    "moderator:manage:shoutouts",
];
