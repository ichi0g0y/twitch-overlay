use serde::Serialize;

use super::*;

impl TwitchApiClient {
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
}
