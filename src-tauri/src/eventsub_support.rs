//! Shared helpers for EventSub handlers.

use std::collections::{HashSet, VecDeque};
use std::sync::LazyLock;

use serde_json::{Value, json};
use tokio::sync::RwLock;

use crate::app::SharedState;
use crate::notification::queue;
use crate::notification::types::{ChatNotification, DisplayMode, FragmentInfo, NotificationType};

const REDEMPTION_CACHE_LIMIT: usize = 2000;

#[derive(Default)]
struct RedemptionDedup {
    seen: HashSet<String>,
    order: VecDeque<String>,
}

static REDEMPTION_DEDUP: LazyLock<RwLock<RedemptionDedup>> =
    LazyLock::new(|| RwLock::new(RedemptionDedup::default()));

pub async fn already_processed_redemption(redemption_id: &str) -> bool {
    let mut guard = REDEMPTION_DEDUP.write().await;
    if guard.seen.contains(redemption_id) {
        return true;
    }
    guard.seen.insert(redemption_id.to_string());
    guard.order.push_back(redemption_id.to_string());
    while guard.order.len() > REDEMPTION_CACHE_LIMIT {
        if let Some(oldest) = guard.order.pop_front() {
            guard.seen.remove(&oldest);
        }
    }
    false
}

pub async fn enqueue_notification(
    _state: &SharedState,
    username: String,
    message: String,
    fragments: Vec<FragmentInfo>,
    notification_type: NotificationType,
) {
    let notif = ChatNotification {
        username,
        message,
        fragments,
        avatar_url: None,
        color: None,
        display_mode: DisplayMode::Queue,
        notification_type,
    };
    if let Err(e) = queue::enqueue(notif).await {
        tracing::debug!("Notification queue is unavailable: {e}");
    }
}

pub fn send_ws(state: &SharedState, event_type: &str, data: impl serde::Serialize) {
    let msg = json!({ "type": event_type, "data": data });
    let _ = state.ws_sender().send(msg.to_string());
}

pub fn str_field(value: &Value, path: &[&str]) -> String {
    let mut cur = value;
    for key in path {
        cur = match cur.get(*key) {
            Some(v) => v,
            None => return String::new(),
        };
    }
    cur.as_str().unwrap_or_default().to_string()
}

pub fn non_empty(primary: String, fallback: String) -> String {
    if primary.is_empty() {
        fallback
    } else {
        primary
    }
}

pub fn to_notification_fragments(fragments: &Value) -> Vec<FragmentInfo> {
    let mut out = Vec::new();
    let Some(items) = fragments.as_array() else {
        return out;
    };
    for item in items {
        let kind = item.get("type").and_then(|v| v.as_str()).unwrap_or("text");
        let text = item
            .get("text")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string();
        if kind == "emote" {
            let id = item
                .get("emote")
                .and_then(|e| e.get("id"))
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string();
            let url = format!("https://static-cdn.jtvnw.net/emoticons/v2/{id}/static/light/2.0");
            out.push(FragmentInfo::Emote { id, url });
        } else {
            out.push(FragmentInfo::Text(text));
        }
    }
    out
}

pub fn to_legacy_fragments(fragments: &Value) -> Vec<Value> {
    let mut out = Vec::new();
    let Some(items) = fragments.as_array() else {
        return out;
    };
    for item in items {
        let kind = item.get("type").and_then(|v| v.as_str()).unwrap_or("text");
        let text = item
            .get("text")
            .and_then(|v| v.as_str())
            .unwrap_or_default();
        if kind == "emote" {
            let id = item
                .get("emote")
                .and_then(|e| e.get("id"))
                .and_then(|v| v.as_str())
                .unwrap_or_default();
            let url = format!("https://static-cdn.jtvnw.net/emoticons/v2/{id}/static/light/2.0");
            out.push(json!({
                "type": "emote",
                "text": text,
                "emoteId": id,
                "emoteUrl": url,
            }));
        } else {
            out.push(json!({
                "type": "text",
                "text": text,
            }));
        }
    }
    out
}
