use serde_json::{Value, json};

use crate::app::SharedState;
use crate::chat_filter::{extract_badge_keys, is_bot_chat_message};
use crate::eventsub_support::{
    enqueue_notification, non_empty, send_ws, str_field, to_legacy_fragments,
    to_notification_fragments,
};
use crate::notification::types::NotificationType;
use crate::services::{channel_points_assets, channel_points_emote_cache};

pub(super) async fn handle_chat_message(state: &SharedState, payload: &Value) {
    let message_id = str_field(payload, &["message_id"]);
    let user_id = str_field(payload, &["chatter_user_id"]);
    let user_login = str_field(payload, &["chatter_user_login"]);
    let display_name = str_field(payload, &["chatter_user_name"]);
    let username = if user_login.is_empty() {
        display_name.clone()
    } else {
        user_login
    };
    let message_text = str_field(payload, &["message", "text"]);
    let message_fragments = payload
        .get("message")
        .and_then(|m| m.get("fragments"))
        .cloned()
        .unwrap_or(Value::Array(vec![]));
    let badge_keys = extract_badge_keys(payload);
    let learned = channel_points_emote_cache::learn_from_chat_fragments(&message_fragments).await;
    if learned > 0 {
        tracing::debug!(learned, "Learned chat emotes for channel points parsing");
    }
    let fragments_json = message_fragments.to_string();
    let avatar_url = resolve_chat_avatar_url(state, &user_id).await;
    let now = chrono::Utc::now().timestamp();
    if let Err(e) =
        state
            .db()
            .upsert_chat_user_profile(&user_id, &username, &display_name, &avatar_url, now)
    {
        tracing::warn!(user_id, "Failed to upsert chat user profile: {e}");
    }

    let msg = overlay_db::chat::ChatMessage {
        id: 0,
        message_id: message_id.clone(),
        user_id: user_id.clone(),
        username: username.clone(),
        display_name: display_name.clone(),
        message: message_text.clone(),
        badge_keys: badge_keys.clone(),
        fragments_json,
        avatar_url: String::new(),
        translation_text: String::new(),
        translation_status: String::new(),
        translation_lang: String::new(),
        created_at: now,
    };

    match state.db().add_chat_message(&msg) {
        Ok(false) => {
            tracing::debug!(message_id, "Duplicate chat message ignored");
            return;
        }
        Ok(true) => {}
        Err(e) => {
            tracing::warn!("Failed to save chat message: {e}");
        }
    }

    let ws_payload = json!({
        "username": username.clone(),
        "displayName": display_name.clone(),
        "userId": user_id,
        "messageId": message_id,
        "message": message_text,
        "badge_keys": badge_keys,
        "fragments": to_legacy_fragments(&message_fragments),
        "avatarUrl": avatar_url,
        "translation": "",
        "translationStatus": "",
        "translationLang": "",
        "timestamp": chrono::Utc::now().to_rfc3339(),
    });
    send_ws(state, "chat-message", ws_payload);

    if is_bot_chat_message(payload, &user_id, &username, &badge_keys) {
        tracing::debug!(
            message_id,
            user_id,
            username,
            "Skip chat notification for bot message"
        );
        return;
    }

    enqueue_notification(
        state,
        non_empty(display_name, username),
        str_field(payload, &["message", "text"]),
        to_notification_fragments(&message_fragments),
        NotificationType::Chat,
    )
    .await;
}

async fn resolve_chat_avatar_url(state: &SharedState, user_id: &str) -> String {
    if user_id.trim().is_empty() {
        return String::new();
    }

    match state.db().get_latest_chat_avatar(user_id) {
        Ok(Some(url)) if !url.trim().is_empty() => return url,
        Ok(_) => {}
        Err(e) => tracing::warn!(user_id, "Failed to load cached chat avatar: {e}"),
    }

    channel_points_assets::fetch_reward_avatar_url(state, user_id).await
}
