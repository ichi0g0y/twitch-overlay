//! EventSub domain handlers (11 Twitch event types).

mod chat;

use serde_json::{Value, json};
use twitch_client::eventsub;

use crate::app::SharedState;
use crate::events;
use crate::eventsub_support::{
    RewardEnqueueResult, enqueue_notification, enqueue_reward_redemption, non_empty, send_ws,
    str_field,
};
use crate::notification::types::NotificationType;
use chat::handle_chat_message;

pub async fn handle_event(state: &SharedState, event_type: &str, payload: &Value) {
    match event_type {
        eventsub::EVENT_CHAT_MESSAGE => handle_chat_message(state, payload).await,
        eventsub::EVENT_STREAM_ONLINE => handle_stream_online(state, payload).await,
        eventsub::EVENT_STREAM_OFFLINE => handle_stream_offline(state, payload).await,
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

async fn handle_stream_online(state: &SharedState, payload: &Value) {
    state.set_stream_live(true).await;
    let msg = json!({ "is_live": true, "payload": payload });
    send_ws(state, "stream_status_changed", msg.clone());
    send_ws(state, "stream_online", msg);
    state.emit_event(
        events::STREAM_STATUS_CHANGED,
        events::StreamStatusPayload { is_live: true },
    );
}

async fn handle_stream_offline(state: &SharedState, payload: &Value) {
    state.set_stream_live(false).await;
    let msg = json!({ "is_live": false, "payload": payload });
    send_ws(state, "stream_status_changed", msg.clone());
    send_ws(state, "stream_offline", msg);
    state.emit_event(
        events::STREAM_STATUS_CHANGED,
        events::StreamStatusPayload { is_live: false },
    );
}

async fn handle_reward_redemption(state: &SharedState, payload: &Value) {
    match enqueue_reward_redemption(state, payload).await {
        Ok(RewardEnqueueResult::Queued) => {}
        Ok(RewardEnqueueResult::Duplicate) => {
            let redemption_id = str_field(payload, &["id"]);
            tracing::debug!(redemption_id, "Duplicate redemption ignored");
        }
        Err(e) => {
            tracing::warn!("Failed to enqueue reward redemption: {e}");
        }
    }
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
