use axum::Json;
use axum::extract::State;
use serde_json::json;

use crate::app::SharedState;

use super::broadcast::broadcast_participants_updated;
use super::{
    ApiResult, display_name_or_fallback, err_json, get_all_participants, is_numeric_user_id,
};

/// POST /api/present/refresh-subscribers
pub async fn refresh_present_subscribers(State(state): State<SharedState>) -> ApiResult {
    let participants = get_all_participants(&state)?;
    if participants.is_empty() {
        return Ok(Json(
            json!({ "success": true, "updated": 0, "failed_users": [] }),
        ));
    }

    let db_token = state
        .db()
        .get_latest_token()
        .map_err(|e| err_json(500, &e.to_string()))?
        .ok_or_else(|| err_json(401, "No Twitch token available"))?;

    let config = state.config().await;
    let broadcaster_id = config.twitch_user_id.clone();
    let client_id = config.client_id.clone();
    drop(config);

    if broadcaster_id.is_empty() || client_id.is_empty() {
        return Err(err_json(400, "Twitch credentials not configured"));
    }

    let token = twitch_client::Token {
        access_token: db_token.access_token,
        refresh_token: db_token.refresh_token,
        scope: db_token.scope,
        expires_at: db_token.expires_at,
    };
    let api = twitch_client::api::TwitchApiClient::new(client_id);

    let mut updated_count = 0u32;
    let mut failed_users: Vec<String> = Vec::new();

    for participant in &participants {
        if !is_numeric_user_id(&participant.user_id) {
            continue;
        }

        let mut updated = participant.clone();
        let old_is_subscriber = updated.is_subscriber;
        let old_tier = updated.subscriber_tier.clone();
        let old_months = updated.subscribed_months;

        match api
            .get_user_subscription(&token, &broadcaster_id, &updated.user_id)
            .await
        {
            Ok(Some(sub)) => {
                updated.is_subscriber = true;
                updated.subscriber_tier = sub.tier;
                updated.subscribed_months =
                    resolve_subscribed_months(sub.cumulative_months.unwrap_or(0), old_months);
            }
            Ok(None) => {
                updated.is_subscriber = false;
                updated.subscriber_tier.clear();
                updated.subscribed_months = 0;
            }
            Err(error) => {
                tracing::warn!(user_id = %updated.user_id, %error, "Failed to refresh subscriber status");
                failed_users.push(display_name_or_fallback(&updated));
                continue;
            }
        }

        if old_is_subscriber != updated.is_subscriber
            || old_tier != updated.subscriber_tier
            || old_months != updated.subscribed_months
        {
            state
                .db()
                .update_lottery_participant(&updated.user_id, &updated)
                .map_err(|e| err_json(500, &e.to_string()))?;
            updated_count += 1;
        }
    }

    let latest_participants = get_all_participants(&state)?;
    broadcast_participants_updated(&state, &latest_participants);

    Ok(Json(json!({
        "success": true,
        "message": format!("{updated_count} participant(s) updated"),
        "updated": updated_count,
        "failed_users": failed_users,
    })))
}

fn resolve_subscribed_months(api_months: i32, current_months: i32) -> i32 {
    if api_months > 0 {
        return api_months;
    }
    if current_months > 0 {
        return current_months;
    }
    1
}

#[cfg(test)]
mod tests {
    use super::resolve_subscribed_months;

    #[test]
    fn resolve_subscribed_months_prefers_api_value() {
        assert_eq!(resolve_subscribed_months(5, 2), 5);
    }

    #[test]
    fn resolve_subscribed_months_falls_back_to_current() {
        assert_eq!(resolve_subscribed_months(0, 7), 7);
    }

    #[test]
    fn resolve_subscribed_months_defaults_to_one() {
        assert_eq!(resolve_subscribed_months(0, 0), 1);
    }
}
