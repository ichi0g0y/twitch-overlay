//! EventSub domain handlers (11 Twitch event types).

use serde_json::{Value, json};
use twitch_client::eventsub;

use crate::app::SharedState;
use crate::events;
use crate::eventsub_support::{
    already_processed_redemption, enqueue_notification, non_empty, send_ws, str_field,
    to_legacy_fragments, to_notification_fragments,
};
use crate::notification::types::NotificationType;

pub async fn handle_event(state: &SharedState, event_type: &str, payload: &Value) {
    match event_type {
        eventsub::EVENT_CHAT_MESSAGE => handle_chat_message(state, payload).await,
        eventsub::EVENT_STREAM_ONLINE => handle_stream_online(state, payload),
        eventsub::EVENT_STREAM_OFFLINE => handle_stream_offline(state, payload),
        eventsub::EVENT_REWARD_REDEMPTION => handle_reward_redemption(state, payload).await,
        eventsub::EVENT_CHANNEL_CHEER => handle_cheer(state, payload).await,
        eventsub::EVENT_CHANNEL_FOLLOW => handle_follow(state, payload).await,
        eventsub::EVENT_CHANNEL_RAID => handle_raid(state, payload).await,
        eventsub::EVENT_SHOUTOUT_RECEIVE => handle_shoutout(state, payload).await,
        eventsub::EVENT_CHANNEL_SUBSCRIBE => handle_subscribe(state, payload).await,
        eventsub::EVENT_SUBSCRIPTION_GIFT => handle_subscription_gift(state, payload).await,
        eventsub::EVENT_SUBSCRIPTION_MESSAGE => {
            handle_subscription_message(state, payload).await;
        }
        other => tracing::debug!(event_type = other, "Unhandled EventSub event type"),
    }
}

async fn handle_chat_message(state: &SharedState, payload: &Value) {
    let message_id = str_field(payload, &["message_id"]);
    let user_id = str_field(payload, &["chatter_user_id"]);
    let username = non_empty(
        str_field(payload, &["chatter_user_name"]),
        str_field(payload, &["chatter_user_login"]),
    );
    let message_text = str_field(payload, &["message", "text"]);
    let message_fragments = payload
        .get("message")
        .and_then(|m| m.get("fragments"))
        .cloned()
        .unwrap_or(Value::Array(vec![]));
    let fragments_json = message_fragments.to_string();

    let msg = overlay_db::chat::ChatMessage {
        id: 0,
        message_id: message_id.clone(),
        user_id: user_id.clone(),
        username: username.clone(),
        message: message_text.clone(),
        fragments_json,
        avatar_url: String::new(),
        translation_text: String::new(),
        translation_status: String::new(),
        translation_lang: String::new(),
        created_at: chrono::Utc::now().timestamp(),
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
        "username": username,
        "userId": user_id,
        "messageId": message_id,
        "message": message_text,
        "fragments": to_legacy_fragments(&message_fragments),
        "avatarUrl": "",
        "translation": "",
        "translationStatus": "",
        "translationLang": "",
        "timestamp": chrono::Utc::now().to_rfc3339(),
    });
    send_ws(state, "chat-message", ws_payload);

    enqueue_notification(
        state,
        str_field(payload, &["chatter_user_name"]),
        str_field(payload, &["message", "text"]),
        to_notification_fragments(&message_fragments),
        NotificationType::Chat,
    )
    .await;
}

fn handle_stream_online(state: &SharedState, payload: &Value) {
    let msg = json!({ "is_live": true, "payload": payload });
    send_ws(state, "stream_status_changed", msg.clone());
    send_ws(state, "stream_online", msg);
    state.emit_event(
        events::STREAM_STATUS_CHANGED,
        events::StreamStatusPayload { is_live: true },
    );
}

fn handle_stream_offline(state: &SharedState, payload: &Value) {
    let msg = json!({ "is_live": false, "payload": payload });
    send_ws(state, "stream_status_changed", msg.clone());
    send_ws(state, "stream_offline", msg);
    state.emit_event(
        events::STREAM_STATUS_CHANGED,
        events::StreamStatusPayload { is_live: false },
    );
}

async fn handle_reward_redemption(state: &SharedState, payload: &Value) {
    let redemption_id = str_field(payload, &["id"]);
    if !redemption_id.is_empty() && already_processed_redemption(&redemption_id).await {
        tracing::debug!(redemption_id, "Duplicate redemption ignored");
        return;
    }

    let reward_id = str_field(payload, &["reward", "id"]);
    let reward_title = str_field(payload, &["reward", "title"]);
    let user_name = non_empty(
        str_field(payload, &["user_name"]),
        str_field(payload, &["user_login"]),
    );

    if !reward_id.is_empty() {
        if let Err(e) = state.db().increment_reward_count(&reward_id, &user_name) {
            tracing::warn!("Failed to increment reward count: {e}");
        }
    }

    send_ws(
        state,
        "channel_points",
        json!({
            "reward_id": reward_id,
            "reward_title": reward_title,
            "user_name": user_name,
            "payload": payload,
        }),
    );
}

async fn handle_cheer(state: &SharedState, payload: &Value) {
    let username = non_empty(
        str_field(payload, &["user_name"]),
        str_field(payload, &["user_login"]),
    );
    let bits = payload.get("bits").and_then(|v| v.as_u64()).unwrap_or(0);
    let message = if bits > 0 {
        format!("ビッツありがとう: {bits} bits")
    } else {
        "ビッツありがとう".to_string()
    };
    send_ws(state, "cheer", payload.clone());
    enqueue_notification(state, username, message, vec![], NotificationType::Cheer).await;
}

async fn handle_follow(state: &SharedState, payload: &Value) {
    let username = non_empty(
        str_field(payload, &["user_name"]),
        str_field(payload, &["user_login"]),
    );
    send_ws(state, "follow", payload.clone());
    enqueue_notification(
        state,
        username,
        "フォローありがとう".to_string(),
        vec![],
        NotificationType::Follow,
    )
    .await;
}

async fn handle_raid(state: &SharedState, payload: &Value) {
    let username = non_empty(
        str_field(payload, &["from_broadcaster_user_name"]),
        str_field(payload, &["from_broadcaster_user_login"]),
    );
    let viewers = payload.get("viewers").and_then(|v| v.as_u64()).unwrap_or(0);
    let message = if viewers > 0 {
        format!("レイドありがとう: {viewers} viewers")
    } else {
        "レイドありがとう".to_string()
    };
    send_ws(state, "raid", payload.clone());
    enqueue_notification(state, username, message, vec![], NotificationType::Raid).await;
}

async fn handle_shoutout(state: &SharedState, payload: &Value) {
    let username = non_empty(
        str_field(payload, &["from_broadcaster_user_name"]),
        str_field(payload, &["from_broadcaster_user_login"]),
    );
    send_ws(state, "shoutout", payload.clone());
    enqueue_notification(
        state,
        username,
        "シャウトアウトありがとう".to_string(),
        vec![],
        NotificationType::Shoutout,
    )
    .await;
}

async fn handle_subscribe(state: &SharedState, payload: &Value) {
    let username = non_empty(
        str_field(payload, &["user_name"]),
        str_field(payload, &["user_login"]),
    );
    let tier = str_field(payload, &["tier"]);
    let message = if tier.is_empty() {
        "サブスクありがとう".to_string()
    } else {
        format!("サブスクありがとう: Tier {tier}")
    };
    send_ws(state, "subscribe", payload.clone());
    enqueue_notification(
        state,
        username,
        message,
        vec![],
        NotificationType::Subscribe,
    )
    .await;
}

async fn handle_subscription_gift(state: &SharedState, payload: &Value) {
    let is_anonymous = payload
        .get("is_anonymous")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let username = if is_anonymous {
        "匿名さん".to_string()
    } else {
        non_empty(
            str_field(payload, &["user_name"]),
            str_field(payload, &["user_login"]),
        )
    };
    let total = payload.get("total").and_then(|v| v.as_u64()).unwrap_or(0);
    let tier = str_field(payload, &["tier"]);
    let message = if total > 0 {
        format!("サブギフありがとう: Tier {tier} x {total}")
    } else {
        format!("サブギフありがとう: Tier {tier}")
    };
    send_ws(state, "gift_sub", payload.clone());
    enqueue_notification(state, username, message, vec![], NotificationType::GiftSub).await;
}

async fn handle_subscription_message(state: &SharedState, payload: &Value) {
    let username = non_empty(
        str_field(payload, &["user_name"]),
        str_field(payload, &["user_login"]),
    );
    let months = payload
        .get("cumulative_months")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    let body = str_field(payload, &["message", "text"]);
    let message = if months > 1 && !body.is_empty() {
        format!("再サブスクありがとう: {months}ヶ月目 - {body}")
    } else if months > 1 {
        format!("再サブスクありがとう: {months}ヶ月目")
    } else if !body.is_empty() {
        format!("サブスクありがとう: {body}")
    } else {
        "サブスクありがとう".to_string()
    };
    send_ws(state, "resub", payload.clone());
    enqueue_notification(state, username, message, vec![], NotificationType::Resub).await;
}
