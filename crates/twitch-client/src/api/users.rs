use super::*;

impl TwitchApiClient {
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
}
