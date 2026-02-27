//! Shared helpers for EventSub handlers.

use std::collections::{HashSet, VecDeque};
use std::sync::LazyLock;

use serde_json::{Value, json};
use tokio::sync::{RwLock, mpsc};

use crate::app::SharedState;
use crate::notification::queue;
use crate::notification::types::{ChatNotification, DisplayMode, FragmentInfo, NotificationType};
use crate::services::channel_points_fax;

const REWARD_QUEUE_CAPACITY: usize = 1000;
const REDEMPTION_CACHE_LIMIT: usize = 2000;

#[derive(Default)]
struct RedemptionDedup {
    seen: HashSet<String>,
    order: VecDeque<String>,
}

static REDEMPTION_DEDUP: LazyLock<RwLock<RedemptionDedup>> =
    LazyLock::new(|| RwLock::new(RedemptionDedup::default()));

static REWARD_TX: LazyLock<RwLock<Option<mpsc::Sender<Value>>>> =
    LazyLock::new(|| RwLock::new(None));

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RewardEnqueueResult {
    Queued,
    Duplicate,
}

pub async fn enqueue_reward_redemption(
    state: &SharedState,
    payload: &Value,
) -> Result<RewardEnqueueResult, String> {
    ensure_reward_worker(state).await;

    let tx = {
        let guard = REWARD_TX.read().await;
        guard
            .as_ref()
            .cloned()
            .ok_or_else(|| "reward queue is not initialized".to_string())?
    };

    let redemption_id = str_field(payload, &["id"]);
    if redemption_id.is_empty() {
        tx.try_send(payload.clone())
            .map_err(|e| format!("reward queue full or closed: {e}"))?;
        return Ok(RewardEnqueueResult::Queued);
    }

    let mut dedup = REDEMPTION_DEDUP.write().await;
    if dedup.seen.contains(&redemption_id) {
        return Ok(RewardEnqueueResult::Duplicate);
    }

    tx.try_send(payload.clone())
        .map_err(|e| format!("reward queue full or closed: {e}"))?;
    remember_redemption(&mut dedup, &redemption_id);
    Ok(RewardEnqueueResult::Queued)
}

async fn ensure_reward_worker(state: &SharedState) {
    let mut slot = REWARD_TX.write().await;
    if slot.is_some() {
        return;
    }

    let (tx, rx) = mpsc::channel::<Value>(REWARD_QUEUE_CAPACITY);
    *slot = Some(tx);

    let worker_state = state.clone();
    tokio::spawn(async move { reward_worker_loop(worker_state, rx).await });
    tracing::info!("Reward redemption queue worker started (capacity={REWARD_QUEUE_CAPACITY})");
}

async fn reward_worker_loop(state: SharedState, mut rx: mpsc::Receiver<Value>) {
    while let Some(payload) = rx.recv().await {
        process_reward_redemption(&state, &payload).await;
    }
    tracing::warn!("Reward redemption queue worker stopped");
}

async fn process_reward_redemption(state: &SharedState, payload: &Value) {
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

    if let Err(e) = channel_points_fax::process_redemption_event(state, payload).await {
        tracing::warn!("Failed to process channel points fax print: {e}");
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

fn remember_redemption(dedup: &mut RedemptionDedup, redemption_id: &str) {
    dedup.seen.insert(redemption_id.to_string());
    dedup.order.push_back(redemption_id.to_string());
    while dedup.order.len() > REDEMPTION_CACHE_LIMIT {
        if let Some(oldest) = dedup.order.pop_front() {
            dedup.seen.remove(&oldest);
        }
    }
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
            let emote_owner_id = item
                .get("emote")
                .and_then(|e| e.get("owner_id"))
                .and_then(|v| match v {
                    Value::String(value) => Some(value.clone()),
                    Value::Number(value) => Some(value.to_string()),
                    _ => None,
                })
                .unwrap_or_default();
            let emote_set_id = item
                .get("emote")
                .and_then(|e| e.get("emote_set_id"))
                .and_then(|v| match v {
                    Value::String(value) => Some(value.clone()),
                    Value::Number(value) => Some(value.to_string()),
                    _ => None,
                })
                .unwrap_or_default();
            let url = format!("https://static-cdn.jtvnw.net/emoticons/v2/{id}/static/light/2.0");
            out.push(json!({
                "type": "emote",
                "text": text,
                "emoteId": id,
                "emoteUrl": url,
                "emoteOwnerId": emote_owner_id,
                "emoteSetId": emote_set_id,
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
