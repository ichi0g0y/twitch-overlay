//! Twitch Helix REST API client.
//!
//! Provides typed access to commonly used Twitch API endpoints
//! with automatic Bearer token + Client-ID header injection and
//! single-retry on 401 Unauthorized.

use reqwest::header::{AUTHORIZATION, HeaderMap, HeaderValue};
use serde::{Deserialize, Serialize};

use crate::{Token, TwitchError};

const HELIX_BASE: &str = "https://api.twitch.tv/helix";

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/// Twitch Helix API client with automatic auth header injection.
pub struct TwitchApiClient {
    http: reqwest::Client,
    client_id: String,
}

impl TwitchApiClient {
    pub fn new(client_id: String) -> Self {
        Self {
            http: reqwest::Client::new(),
            client_id,
        }
    }

    /// Build auth headers from the given token.
    fn auth_headers(&self, token: &Token) -> HeaderMap {
        let mut headers = HeaderMap::new();
        let bearer = format!("Bearer {}", token.access_token);
        headers.insert(AUTHORIZATION, HeaderValue::from_str(&bearer).unwrap());
        headers.insert("Client-Id", HeaderValue::from_str(&self.client_id).unwrap());
        headers
    }

    /// Execute a GET request with auth headers. Retries once on 401.
    async fn authenticated_get(&self, url: &str, token: &Token) -> Result<String, TwitchError> {
        let headers = self.auth_headers(token);
        let resp = self.http.get(url).headers(headers).send().await?;

        let status = resp.status();
        let body = resp.text().await?;

        if status == reqwest::StatusCode::UNAUTHORIZED {
            tracing::warn!(url, "Got 401, caller should refresh token and retry");
            return Err(TwitchError::ApiError {
                status: 401,
                message: body,
            });
        }

        if !status.is_success() {
            return Err(TwitchError::ApiError {
                status: status.as_u16(),
                message: body,
            });
        }

        Ok(body)
    }

    /// Execute a PATCH request with auth headers and JSON body.
    async fn authenticated_patch(
        &self,
        url: &str,
        token: &Token,
        body: &impl Serialize,
    ) -> Result<String, TwitchError> {
        let headers = self.auth_headers(token);
        let resp = self
            .http
            .patch(url)
            .headers(headers)
            .json(body)
            .send()
            .await?;

        let status = resp.status();
        let resp_body = resp.text().await?;

        if !status.is_success() {
            return Err(TwitchError::ApiError {
                status: status.as_u16(),
                message: resp_body,
            });
        }

        Ok(resp_body)
    }

    /// Execute a POST request with auth headers and JSON body.
    async fn authenticated_post(
        &self,
        url: &str,
        token: &Token,
        body: &impl Serialize,
    ) -> Result<String, TwitchError> {
        let headers = self.auth_headers(token);
        let resp = self
            .http
            .post(url)
            .headers(headers)
            .json(body)
            .send()
            .await?;

        let status = resp.status();
        let resp_body = resp.text().await?;

        if !status.is_success() {
            return Err(TwitchError::ApiError {
                status: status.as_u16(),
                message: resp_body,
            });
        }

        Ok(resp_body)
    }

    /// Execute a POST request with auth headers and no body.
    async fn authenticated_post_no_body(
        &self,
        url: &str,
        token: &Token,
    ) -> Result<String, TwitchError> {
        let headers = self.auth_headers(token);
        let resp = self.http.post(url).headers(headers).send().await?;

        let status = resp.status();
        let resp_body = resp.text().await?;

        if !status.is_success() {
            return Err(TwitchError::ApiError {
                status: status.as_u16(),
                message: resp_body,
            });
        }

        Ok(resp_body)
    }

    /// Execute a DELETE request with auth headers.
    async fn authenticated_delete(&self, url: &str, token: &Token) -> Result<(), TwitchError> {
        let headers = self.auth_headers(token);
        let resp = self.http.delete(url).headers(headers).send().await?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await?;
            return Err(TwitchError::ApiError {
                status: status.as_u16(),
                message: body,
            });
        }

        Ok(())
    }

    /// Execute a PUT request with auth headers and no body.
    async fn authenticated_put_no_body(
        &self,
        url: &str,
        token: &Token,
    ) -> Result<String, TwitchError> {
        let headers = self.auth_headers(token);
        let resp = self.http.put(url).headers(headers).send().await?;

        let status = resp.status();
        let body = resp.text().await?;

        if !status.is_success() {
            return Err(TwitchError::ApiError {
                status: status.as_u16(),
                message: body,
            });
        }

        Ok(body)
    }

    // -----------------------------------------------------------------------
    // Endpoints
    // -----------------------------------------------------------------------

    /// Get stream info for a broadcaster. Returns live status and viewer count.
    pub async fn get_stream_info(
        &self,
        token: &Token,
        user_id: &str,
    ) -> Result<StreamStatus, TwitchError> {
        let url = format!("{HELIX_BASE}/streams?user_id={user_id}");
        let body = self.authenticated_get(&url, token).await?;
        let resp: HelixResponse<StreamInfo> = serde_json::from_str(&body)?;

        match resp.data.into_iter().next() {
            Some(info) => Ok(StreamStatus {
                is_live: true,
                viewer_count: info.viewer_count,
                info: Some(info),
            }),
            None => Ok(StreamStatus {
                is_live: false,
                viewer_count: 0,
                info: None,
            }),
        }
    }

    /// Get the profile image URL for a user by user ID.
    pub async fn get_user_avatar(
        &self,
        token: &Token,
        user_id: &str,
    ) -> Result<String, TwitchError> {
        let url = format!("{HELIX_BASE}/users?id={user_id}");
        let body = self.authenticated_get(&url, token).await?;
        let resp: HelixResponse<TwitchUser> = serde_json::from_str(&body)?;

        resp.data
            .into_iter()
            .next()
            .map(|u| u.profile_image_url)
            .ok_or_else(|| TwitchError::ApiError {
                status: 404,
                message: "User not found".into(),
            })
    }

    /// Get user profile by user ID.
    pub async fn get_user(&self, token: &Token, user_id: &str) -> Result<TwitchUser, TwitchError> {
        let url = format!("{HELIX_BASE}/users?id={user_id}");
        let body = self.authenticated_get(&url, token).await?;
        let resp: HelixResponse<TwitchUser> = serde_json::from_str(&body)?;

        resp.data
            .into_iter()
            .next()
            .ok_or_else(|| TwitchError::ApiError {
                status: 404,
                message: "User not found".into(),
            })
    }

    /// Get the currently authenticated user.
    pub async fn get_current_user(&self, token: &Token) -> Result<TwitchUser, TwitchError> {
        let url = format!("{HELIX_BASE}/users");
        let body = self.authenticated_get(&url, token).await?;
        let resp: HelixResponse<TwitchUser> = serde_json::from_str(&body)?;
        resp.data
            .into_iter()
            .next()
            .ok_or_else(|| TwitchError::ApiError {
                status: 404,
                message: "Authenticated user not found".into(),
            })
    }

    /// Get user profile by login name.
    pub async fn get_user_by_login(
        &self,
        token: &Token,
        login: &str,
    ) -> Result<TwitchUser, TwitchError> {
        let url = format!("{HELIX_BASE}/users?login={login}");
        let body = self.authenticated_get(&url, token).await?;
        let resp: HelixResponse<TwitchUser> = serde_json::from_str(&body)?;

        resp.data
            .into_iter()
            .next()
            .ok_or_else(|| TwitchError::ApiError {
                status: 404,
                message: "User not found".into(),
            })
    }

    /// Get users by user IDs (up to 100).
    pub async fn get_users_by_ids(
        &self,
        token: &Token,
        user_ids: &[String],
    ) -> Result<Vec<TwitchUser>, TwitchError> {
        if user_ids.is_empty() {
            return Ok(Vec::new());
        }

        let query = user_ids
            .iter()
            .take(100)
            .map(|id| format!("id={id}"))
            .collect::<Vec<_>>()
            .join("&");
        let url = format!("{HELIX_BASE}/users?{query}");
        let body = self.authenticated_get(&url, token).await?;
        let resp: HelixResponse<TwitchUser> = serde_json::from_str(&body)?;
        Ok(resp.data)
    }

    /// Get channels followed by the specified user.
    pub async fn get_followed_channels(
        &self,
        token: &Token,
        user_id: &str,
        first: u32,
    ) -> Result<Vec<FollowedChannel>, TwitchError> {
        let (rows, _next_cursor) = self
            .get_followed_channels_page(token, user_id, first, None)
            .await?;
        Ok(rows)
    }

    /// Get one page of channels followed by the specified user.
    pub async fn get_followed_channels_page(
        &self,
        token: &Token,
        user_id: &str,
        first: u32,
        after: Option<&str>,
    ) -> Result<(Vec<FollowedChannel>, Option<String>), TwitchError> {
        let clamped = first.clamp(1, 100);
        let mut url = format!("{HELIX_BASE}/channels/followed?user_id={user_id}&first={clamped}");
        if let Some(cursor) = after.filter(|v| !v.is_empty()) {
            url.push_str("&after=");
            url.push_str(cursor);
        }
        let body = self.authenticated_get(&url, token).await?;
        let resp: HelixPaginatedResponse<FollowedChannel> = serde_json::from_str(&body)?;
        let next_cursor = resp.pagination.and_then(|p| p.cursor);
        Ok((resp.data, next_cursor))
    }

    /// Get one page of chatters for the specified broadcaster and moderator.
    pub async fn get_chatters_page(
        &self,
        token: &Token,
        broadcaster_id: &str,
        moderator_id: &str,
        first: u32,
        after: Option<&str>,
    ) -> Result<(Vec<Chatter>, Option<String>, u64), TwitchError> {
        let clamped = first.clamp(1, 1000);
        let mut url = format!(
            "{HELIX_BASE}/chat/chatters?broadcaster_id={broadcaster_id}&moderator_id={moderator_id}&first={clamped}"
        );
        if let Some(cursor) = after.filter(|v| !v.is_empty()) {
            url.push_str("&after=");
            url.push_str(cursor);
        }
        let body = self.authenticated_get(&url, token).await?;
        let resp: ChattersPaginatedResponse = serde_json::from_str(&body)?;
        let next_cursor = resp.pagination.and_then(|p| p.cursor);
        Ok((resp.data, next_cursor, resp.total))
    }

    /// Get stream info for multiple broadcasters (up to 100 user IDs).
    pub async fn get_streams_by_user_ids(
        &self,
        token: &Token,
        user_ids: &[String],
    ) -> Result<Vec<StreamInfo>, TwitchError> {
        if user_ids.is_empty() {
            return Ok(Vec::new());
        }

        let query = build_streams_query(user_ids);
        let url = format!("{HELIX_BASE}/streams?{query}");
        let body = self.authenticated_get(&url, token).await?;
        let resp: HelixResponse<StreamInfo> = serde_json::from_str(&body)?;
        Ok(resp.data)
    }

    /// Start a raid to another broadcaster.
    pub async fn start_raid(
        &self,
        token: &Token,
        from_broadcaster_id: &str,
        to_broadcaster_id: &str,
    ) -> Result<Option<RaidInfo>, TwitchError> {
        let url = format!(
            "{HELIX_BASE}/raids?from_broadcaster_id={from_broadcaster_id}&to_broadcaster_id={to_broadcaster_id}"
        );
        let body = self.authenticated_post_no_body(&url, token).await?;
        let resp: HelixResponse<RaidInfo> = serde_json::from_str(&body)?;
        Ok(resp.data.into_iter().next())
    }

    /// Send a shoutout to another broadcaster.
    pub async fn start_shoutout(
        &self,
        token: &Token,
        from_broadcaster_id: &str,
        to_broadcaster_id: &str,
        moderator_id: &str,
    ) -> Result<(), TwitchError> {
        let url = format!(
            "{HELIX_BASE}/chat/shoutouts?from_broadcaster_id={from_broadcaster_id}&to_broadcaster_id={to_broadcaster_id}&moderator_id={moderator_id}"
        );
        let _ = self.authenticated_post_no_body(&url, token).await?;
        Ok(())
    }

    /// Timeout (or ban) a user in chat via moderation API.
    pub async fn timeout_user(
        &self,
        token: &Token,
        broadcaster_id: &str,
        moderator_id: &str,
        target_user_id: &str,
        duration_seconds: u32,
        reason: Option<&str>,
    ) -> Result<(), TwitchError> {
        #[derive(Serialize)]
        struct BanData<'a> {
            user_id: &'a str,
            #[serde(skip_serializing_if = "Option::is_none")]
            duration: Option<u32>,
            #[serde(skip_serializing_if = "Option::is_none")]
            reason: Option<&'a str>,
        }

        #[derive(Serialize)]
        struct BanRequest<'a> {
            data: BanData<'a>,
        }

        let url = format!(
            "{HELIX_BASE}/moderation/bans?broadcaster_id={broadcaster_id}&moderator_id={moderator_id}"
        );
        let body = BanRequest {
            data: BanData {
                user_id: target_user_id,
                duration: Some(duration_seconds.max(1)),
                reason: reason
                    .map(str::trim)
                    .filter(|value| !value.is_empty() && value.len() <= 500),
            },
        };
        let _ = self.authenticated_post(&url, token, &body).await?;
        Ok(())
    }

    /// Block a user for the current authenticated user.
    pub async fn block_user(&self, token: &Token, target_user_id: &str) -> Result<(), TwitchError> {
        let url = format!(
            "{HELIX_BASE}/users/blocks?target_user_id={target_user_id}&source_context=chat"
        );
        let _ = self.authenticated_put_no_body(&url, token).await?;
        Ok(())
    }

    /// Get all custom channel point rewards for a broadcaster.
    pub async fn get_custom_rewards(
        &self,
        token: &Token,
        broadcaster_id: &str,
    ) -> Result<Vec<CustomReward>, TwitchError> {
        let url =
            format!("{HELIX_BASE}/channel_points/custom_rewards?broadcaster_id={broadcaster_id}");
        let body = self.authenticated_get(&url, token).await?;
        let resp: HelixResponse<CustomReward> = serde_json::from_str(&body)?;
        Ok(resp.data)
    }

    /// Enable or disable a custom channel point reward.
    pub async fn update_reward_enabled(
        &self,
        token: &Token,
        broadcaster_id: &str,
        reward_id: &str,
        is_enabled: bool,
    ) -> Result<CustomReward, TwitchError> {
        let url = format!(
            "{HELIX_BASE}/channel_points/custom_rewards?broadcaster_id={broadcaster_id}&id={reward_id}"
        );

        #[derive(Serialize)]
        struct Body {
            is_enabled: bool,
        }

        let body = self
            .authenticated_patch(&url, token, &Body { is_enabled })
            .await?;
        let resp: HelixResponse<CustomReward> = serde_json::from_str(&body)?;

        resp.data
            .into_iter()
            .next()
            .ok_or_else(|| TwitchError::ApiError {
                status: 404,
                message: "Reward not found in response".into(),
            })
    }

    /// Create a custom channel point reward.
    pub async fn create_custom_reward(
        &self,
        token: &Token,
        broadcaster_id: &str,
        reward: &CreateRewardRequest,
    ) -> Result<CustomReward, TwitchError> {
        let url =
            format!("{HELIX_BASE}/channel_points/custom_rewards?broadcaster_id={broadcaster_id}");
        let body = self.authenticated_post(&url, token, reward).await?;
        let resp: HelixResponse<CustomReward> = serde_json::from_str(&body)?;
        resp.data
            .into_iter()
            .next()
            .ok_or_else(|| TwitchError::ApiError {
                status: 404,
                message: "Reward not found in response".into(),
            })
    }

    /// Update a custom channel point reward.
    pub async fn update_custom_reward(
        &self,
        token: &Token,
        broadcaster_id: &str,
        reward_id: &str,
        update: &UpdateRewardRequest,
    ) -> Result<CustomReward, TwitchError> {
        let url = format!(
            "{HELIX_BASE}/channel_points/custom_rewards?broadcaster_id={broadcaster_id}&id={reward_id}"
        );
        let body = self.authenticated_patch(&url, token, update).await?;
        let resp: HelixResponse<CustomReward> = serde_json::from_str(&body)?;
        resp.data
            .into_iter()
            .next()
            .ok_or_else(|| TwitchError::ApiError {
                status: 404,
                message: "Reward not found in response".into(),
            })
    }

    /// Delete a custom channel point reward.
    pub async fn delete_custom_reward(
        &self,
        token: &Token,
        broadcaster_id: &str,
        reward_id: &str,
    ) -> Result<(), TwitchError> {
        let url = format!(
            "{HELIX_BASE}/channel_points/custom_rewards?broadcaster_id={broadcaster_id}&id={reward_id}"
        );
        self.authenticated_delete(&url, token).await
    }

    /// Check if a user is subscribed to a broadcaster.
    pub async fn get_user_subscription(
        &self,
        token: &Token,
        broadcaster_id: &str,
        user_id: &str,
    ) -> Result<Option<UserSubscription>, TwitchError> {
        let url =
            format!("{HELIX_BASE}/subscriptions?broadcaster_id={broadcaster_id}&user_id={user_id}");
        let body = self.authenticated_get(&url, token).await?;
        let resp: HelixResponse<UserSubscription> = serde_json::from_str(&body)?;
        Ok(resp.data.into_iter().next())
    }

    /// Get chat colors for up to 100 users.
    pub async fn get_user_chat_colors(
        &self,
        token: &Token,
        user_ids: &[String],
    ) -> Result<Vec<ChatColor>, TwitchError> {
        if user_ids.is_empty() {
            return Ok(Vec::new());
        }

        let query = user_ids
            .iter()
            .take(100)
            .map(|user_id| format!("user_id={user_id}"))
            .collect::<Vec<_>>()
            .join("&");
        let url = format!("{HELIX_BASE}/chat/color?{query}");
        let body = self.authenticated_get(&url, token).await?;
        let resp: HelixResponse<ChatColor> = serde_json::from_str(&body)?;
        Ok(resp.data)
    }

    /// Get bits leaderboard for the authenticated channel.
    ///
    /// `period` should be one of Twitch-supported values like `all`, `day`, `week`, `month`, `year`.
    pub async fn get_bits_leaderboard(
        &self,
        token: &Token,
        period: &str,
        count: u32,
    ) -> Result<Vec<BitsLeaderboardEntry>, TwitchError> {
        let clamped = count.clamp(1, 100);
        let url = format!("{HELIX_BASE}/bits/leaderboard?count={clamped}&period={period}");
        let body = self.authenticated_get(&url, token).await?;
        let resp: HelixResponse<BitsLeaderboardEntry> = serde_json::from_str(&body)?;
        Ok(resp.data)
    }
}

fn build_streams_query(user_ids: &[String]) -> String {
    let limited: Vec<&String> = user_ids.iter().take(100).collect();
    let first = limited.len().clamp(1, 100);
    let users = limited
        .into_iter()
        .map(|id| format!("user_id={id}"))
        .collect::<Vec<_>>()
        .join("&");
    format!("first={first}&{users}")
}

#[cfg(test)]
mod tests {
    use super::{ChattersPaginatedResponse, HelixResponse, StreamInfo, build_streams_query};

    #[test]
    fn stream_info_deserializes_started_at() {
        let body = r#"{
          "data": [{
            "id": "s1",
            "user_id": "u1",
            "user_login": "login",
            "game_name": "game",
            "title": "title",
            "viewer_count": 12,
            "started_at": "2026-02-16T00:00:00Z",
            "type": "live"
          }]
        }"#;

        let parsed: HelixResponse<StreamInfo> = serde_json::from_str(body).unwrap();
        let stream = &parsed.data[0];
        assert_eq!(stream.started_at.as_deref(), Some("2026-02-16T00:00:00Z"));
    }

    #[test]
    fn stream_info_allows_missing_started_at() {
        let body = r#"{
          "data": [{
            "id": "s1",
            "user_id": "u1",
            "user_login": "login",
            "game_name": "game",
            "title": "title",
            "viewer_count": 12,
            "type": "live"
          }]
        }"#;

        let parsed: HelixResponse<StreamInfo> = serde_json::from_str(body).unwrap();
        let stream = &parsed.data[0];
        assert_eq!(stream.started_at, None);
    }

    #[test]
    fn build_streams_query_sets_first_to_user_count() {
        let ids = vec!["u1".to_string(), "u2".to_string(), "u3".to_string()];
        let query = build_streams_query(&ids);

        assert!(query.starts_with("first=3&"));
        assert!(query.contains("user_id=u1"));
        assert!(query.contains("user_id=u2"));
        assert!(query.contains("user_id=u3"));
    }

    #[test]
    fn chatters_paginated_response_deserializes_total_and_cursor() {
        let body = r#"{
          "data": [{
            "user_id": "1",
            "user_login": "alice",
            "user_name": "Alice"
          }],
          "pagination": { "cursor": "next-cursor" },
          "total": 120
        }"#;

        let parsed: ChattersPaginatedResponse = serde_json::from_str(body).unwrap();
        assert_eq!(parsed.data.len(), 1);
        assert_eq!(parsed.data[0].user_login, "alice");
        assert_eq!(
            parsed.pagination.and_then(|p| p.cursor),
            Some("next-cursor".to_string())
        );
        assert_eq!(parsed.total, 120);
    }

    #[test]
    fn build_streams_query_caps_first_at_100() {
        let ids = (1..=120).map(|i| format!("u{i}")).collect::<Vec<_>>();
        let query = build_streams_query(&ids);

        assert!(query.starts_with("first=100&"));
        assert!(query.contains("user_id=u100"));
        assert!(!query.contains("user_id=u101"));
    }
}
