use std::collections::HashSet;

use crate::app::SharedState;

use overlay_db::lottery::LotteryParticipant;

use super::is_numeric_user_id;

const COLOR_PALETTE: [&str; 10] = [
    "#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316",
    "#06b6d4", "#a855f7",
];

pub(super) async fn assign_color_to_participant(
    state: &SharedState,
    participant: &LotteryParticipant,
    existing_participants: &[LotteryParticipant],
) -> String {
    if !participant.assigned_color.trim().is_empty() {
        return participant.assigned_color.clone();
    }

    if let Some(twitch_color) = fetch_twitch_chat_color(state, &participant.user_id).await {
        if !twitch_color.trim().is_empty() {
            return twitch_color;
        }
    }

    if let Some(color) = first_unused_palette_color(existing_participants) {
        return color.to_string();
    }

    palette_color_for_user_id(&participant.user_id).to_string()
}

fn first_unused_palette_color(participants: &[LotteryParticipant]) -> Option<&'static str> {
    let mut used = HashSet::new();
    for participant in participants {
        if !participant.assigned_color.trim().is_empty() {
            used.insert(participant.assigned_color.to_lowercase());
        }
    }

    COLOR_PALETTE
        .iter()
        .find(|color| !used.contains(&color.to_lowercase()))
        .copied()
}

fn palette_color_for_user_id(user_id: &str) -> &'static str {
    if COLOR_PALETTE.is_empty() {
        return "";
    }

    let mut hash: u64 = 0;
    for c in user_id.chars() {
        hash = hash.wrapping_mul(31).wrapping_add(c as u64);
    }

    let idx = (hash % COLOR_PALETTE.len() as u64) as usize;
    COLOR_PALETTE[idx]
}

async fn fetch_twitch_chat_color(state: &SharedState, user_id: &str) -> Option<String> {
    if !is_numeric_user_id(user_id) {
        return None;
    }

    let db_token = state.db().get_latest_token().ok().flatten()?;
    let config = state.config().await;
    if config.client_id.is_empty() {
        return None;
    }

    let token = twitch_client::Token {
        access_token: db_token.access_token,
        refresh_token: db_token.refresh_token,
        scope: db_token.scope,
        expires_at: db_token.expires_at,
    };
    let api = twitch_client::api::TwitchApiClient::new(config.client_id.clone());
    drop(config);

    match api
        .get_user_chat_colors(&token, &[user_id.to_string()])
        .await
    {
        Ok(colors) => colors
            .into_iter()
            .find(|color| !color.color.trim().is_empty())
            .map(|color| color.color),
        Err(error) => {
            tracing::warn!(user_id, %error, "Failed to fetch Twitch chat color");
            None
        }
    }
}
