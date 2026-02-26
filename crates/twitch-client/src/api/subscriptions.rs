use super::*;

impl TwitchApiClient {
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
