use serde::{Deserialize, Serialize};

/// Wrapper for Twitch Helix paginated responses.
#[derive(Debug, Deserialize)]
pub struct HelixResponse<T> {
    pub data: Vec<T>,
}

#[derive(Debug, Deserialize)]
pub struct HelixPagination {
    #[serde(default)]
    pub cursor: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct HelixPaginatedResponse<T> {
    pub data: Vec<T>,
    #[serde(default)]
    pub pagination: Option<HelixPagination>,
}

#[derive(Debug, Deserialize)]
pub struct ChattersPaginatedResponse {
    pub data: Vec<Chatter>,
    #[serde(default)]
    pub pagination: Option<HelixPagination>,
    #[serde(default)]
    pub total: u64,
}

/// Stream information from GET /helix/streams.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamInfo {
    pub id: String,
    pub user_id: String,
    pub user_login: String,
    pub game_name: String,
    pub title: String,
    pub viewer_count: u64,
    #[serde(default)]
    pub started_at: Option<String>,
    #[serde(rename = "type")]
    pub stream_type: String,
}

/// Convenience wrapper returned by [`TwitchApiClient::get_stream_info`].
#[derive(Debug, Clone, Serialize)]
pub struct StreamStatus {
    pub is_live: bool,
    pub viewer_count: u64,
    pub info: Option<StreamInfo>,
}

/// User information from GET /helix/users.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TwitchUser {
    pub id: String,
    pub login: String,
    pub display_name: String,
    #[serde(default)]
    pub user_type: String,
    #[serde(default)]
    pub broadcaster_type: String,
    #[serde(default)]
    pub description: String,
    pub profile_image_url: String,
    #[serde(default)]
    pub offline_image_url: String,
    #[serde(default)]
    pub view_count: u64,
    #[serde(default)]
    pub created_at: String,
}

/// Followed channel entry from GET /helix/channels/followed.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FollowedChannel {
    pub broadcaster_id: String,
    pub broadcaster_login: String,
    pub broadcaster_name: String,
    #[serde(default)]
    pub followed_at: String,
}

/// Chatter entry from GET /helix/chat/chatters.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Chatter {
    pub user_id: String,
    pub user_login: String,
    pub user_name: String,
}

/// Raid information from POST /helix/raids.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RaidInfo {
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub is_mature: Option<bool>,
}

/// Nested setting for max redemptions per stream.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MaxPerStreamSetting {
    pub is_enabled: bool,
    pub max_per_stream: u64,
}

/// Nested setting for max redemptions per user per stream.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MaxPerUserPerStreamSetting {
    pub is_enabled: bool,
    pub max_per_user_per_stream: u64,
}

/// Nested setting for global cooldown.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GlobalCooldownSetting {
    pub is_enabled: bool,
    pub global_cooldown_seconds: u64,
}

/// Custom channel point reward.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomReward {
    pub id: String,
    pub title: String,
    pub cost: u64,
    pub is_enabled: bool,
    pub is_paused: bool,
    pub is_in_stock: bool,
    pub prompt: Option<String>,
    pub background_color: Option<String>,
    #[serde(default)]
    pub is_user_input_required: bool,
    #[serde(default)]
    pub max_per_stream_setting: Option<MaxPerStreamSetting>,
    #[serde(default)]
    pub max_per_user_per_stream_setting: Option<MaxPerUserPerStreamSetting>,
    #[serde(default)]
    pub global_cooldown_setting: Option<GlobalCooldownSetting>,
    #[serde(default)]
    pub redemptions_redeemed_current_stream: Option<u64>,
}

/// Request body for creating a custom reward.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateRewardRequest {
    pub title: String,
    pub cost: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prompt: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub background_color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_user_input_required: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub should_redemptions_skip_request_queue: Option<bool>,
}

/// Request body for updating a custom reward.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateRewardRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cost: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prompt: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_paused: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub background_color: Option<String>,
}

/// User subscription info from GET /helix/subscriptions.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserSubscription {
    pub broadcaster_id: String,
    pub broadcaster_login: String,
    pub is_gift: bool,
    pub tier: String,
    pub user_id: String,
    pub user_login: String,
    #[serde(default)]
    pub cumulative_months: Option<i32>,
}

/// User chat color from GET /helix/chat/color.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatColor {
    pub user_id: String,
    pub user_name: String,
    pub user_login: String,
    pub color: String,
}

/// Bits leaderboard entry from GET /helix/bits/leaderboard.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BitsLeaderboardEntry {
    pub user_id: String,
    pub user_login: String,
    pub user_name: String,
    pub rank: u32,
    pub score: u64,
}

/// Video information from GET /helix/videos.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoInfo {
    pub id: String,
    pub user_id: String,
    pub created_at: String,
    #[serde(rename = "type")]
    pub video_type: String,
}
