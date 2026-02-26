use std::collections::HashMap;

use super::*;

impl EmoteCache {
    /// Refresh the cache by loading both global and channel emotes.
    ///
    /// Existing entries are replaced.
    pub async fn refresh_cache(
        &mut self,
        token: &Token,
        broadcaster_id: &str,
    ) -> Result<(), TwitchError> {
        let mut new_emotes = HashMap::new();

        match self.get_global_emotes(token).await {
            Ok(emotes) => {
                for emote in emotes {
                    new_emotes.insert(emote.id.clone(), emote);
                }
            }
            Err(e) => {
                tracing::warn!(error = %e, "Failed to fetch global emotes");
            }
        }

        match self.get_channel_emotes(token, broadcaster_id).await {
            Ok(emotes) => {
                for emote in emotes {
                    new_emotes.insert(emote.id.clone(), emote);
                }
            }
            Err(e) => {
                tracing::warn!(error = %e, "Failed to fetch channel emotes");
            }
        }

        let count = new_emotes.len();
        self.emotes = new_emotes;
        tracing::info!(count, "Emote cache refreshed");
        Ok(())
    }
}
