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

/// Stream information from GET /helix/streams.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamInfo {
    pub id: String,
    pub user_id: String,
    pub user_login: String,
    pub game_name: String,
    pub title: String,
    pub viewer_count: u64,
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
    pub profile_image_url: String,
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
