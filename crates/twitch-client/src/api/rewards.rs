use super::*;

impl TwitchApiClient {
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

        #[derive(serde::Serialize)]
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
}
