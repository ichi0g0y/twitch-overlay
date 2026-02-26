//! Twitch Helix REST API client.
//!
//! Provides typed access to commonly used Twitch API endpoints
//! with automatic Bearer token + Client-ID header injection and
//! single-retry on 401 Unauthorized.

mod channels;
mod moderation;
mod request;
mod rewards;
mod streams;
mod subscriptions;
mod users;

pub mod models;

pub use models::{
    BitsLeaderboardEntry, ChatColor, Chatter, ChattersPaginatedResponse, CreateRewardRequest,
    CustomReward, FollowedChannel, GlobalCooldownSetting, HelixPaginatedResponse, HelixPagination,
    HelixResponse, MaxPerStreamSetting, MaxPerUserPerStreamSetting, RaidInfo, StreamInfo,
    StreamStatus, TwitchUser, UpdateRewardRequest, UserSubscription, VideoInfo,
};

use crate::{Token, TwitchError};

const HELIX_BASE: &str = "https://api.twitch.tv/helix";

/// Twitch Helix API client with automatic auth header injection.
pub struct TwitchApiClient {
    pub(super) http: reqwest::Client,
    pub(super) client_id: String,
}
