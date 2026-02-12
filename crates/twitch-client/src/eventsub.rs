//! EventSub WebSocket client for real-time Twitch events.
//!
//! Connects to wss://eventsub.wss.twitch.tv/ws, handles welcome/keepalive/
//! notification messages, and manages automatic reconnection with
//! exponential backoff.

use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tokio::sync::mpsc;
use tokio_tungstenite::connect_async;

use crate::TwitchError;

const EVENTSUB_URL: &str = "wss://eventsub.wss.twitch.tv/ws";
const KEEPALIVE_TIMEOUT: Duration = Duration::from_secs(30);
const BASE_BACKOFF: Duration = Duration::from_secs(2);
const MAX_BACKOFF: Duration = Duration::from_secs(60);

/// Event types supported for subscription.
pub const EVENT_CHANNEL_FOLLOW: &str = "channel.follow";
pub const EVENT_CHANNEL_SUBSCRIBE: &str = "channel.subscribe";
pub const EVENT_CHANNEL_CHEER: &str = "channel.cheer";
pub const EVENT_CHANNEL_RAID: &str = "channel.raid";
pub const EVENT_STREAM_ONLINE: &str = "stream.online";
pub const EVENT_STREAM_OFFLINE: &str = "stream.offline";
pub const EVENT_REWARD_REDEMPTION: &str =
    "channel.channel_points_custom_reward_redemption.add";
pub const EVENT_CHAT_MESSAGE: &str = "channel.chat.message";

#[derive(Debug, Deserialize)]
struct WsMessage {
    metadata: WsMetadata,
    payload: serde_json::Value,
}

#[derive(Debug, Deserialize)]
struct WsMetadata {
    message_type: String,
    #[allow(dead_code)]
    message_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct WelcomePayload {
    session: SessionInfo,
}

#[derive(Debug, Deserialize)]
struct SessionInfo {
    id: String,
    #[allow(dead_code)]
    keepalive_timeout_seconds: Option<u64>,
}

#[derive(Debug, Serialize)]
struct SubscribeRequest {
    #[serde(rename = "type")]
    event_type: String,
    version: String,
    condition: serde_json::Value,
    transport: SubscribeTransport,
}

#[derive(Debug, Serialize)]
struct SubscribeTransport {
    method: String,
    session_id: String,
}

/// An event received from EventSub.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventSubEvent {
    pub event_type: String,
    pub payload: serde_json::Value,
}

/// EventSub WebSocket client configuration.
pub struct EventSubConfig {
    pub client_id: String,
    pub access_token: String,
    pub broadcaster_user_id: String,
    pub subscriptions: Vec<String>,
}

/// EventSub WebSocket client with auto-reconnect.
///
/// Events are delivered via `mpsc::Receiver<EventSubEvent>`.
pub struct EventSubClient;

impl EventSubClient {
    /// Start the EventSub loop. Returns an event receiver and shutdown sender.
    pub async fn connect(
        config: EventSubConfig,
    ) -> Result<(mpsc::Receiver<EventSubEvent>, mpsc::Sender<()>), TwitchError> {
        let (event_tx, event_rx) = mpsc::channel::<EventSubEvent>(256);
        let (shutdown_tx, shutdown_rx) = mpsc::channel::<()>(1);
        tokio::spawn(Self::run_loop(config, event_tx, shutdown_rx));
        Ok((event_rx, shutdown_tx))
    }

    async fn run_loop(
        config: EventSubConfig,
        event_tx: mpsc::Sender<EventSubEvent>,
        mut shutdown_rx: mpsc::Receiver<()>,
    ) {
        let mut failures: u32 = 0;
        loop {
            if shutdown_rx.try_recv().is_ok() {
                tracing::info!("EventSub shutdown requested");
                return;
            }
            match Self::connect_once(&config, &event_tx, &mut shutdown_rx).await {
                Ok(()) => {
                    tracing::info!("EventSub connection closed cleanly");
                    return;
                }
                Err(e) => {
                    failures += 1;
                    let backoff = Self::backoff_duration(failures);
                    tracing::warn!(
                        error = %e, attempt = failures,
                        backoff_secs = backoff.as_secs(),
                        "EventSub connection failed, will reconnect"
                    );
                    tokio::time::sleep(backoff).await;
                }
            }
        }
    }

    async fn connect_once(
        config: &EventSubConfig,
        event_tx: &mpsc::Sender<EventSubEvent>,
        shutdown_rx: &mut mpsc::Receiver<()>,
    ) -> Result<(), TwitchError> {
        use tokio_tungstenite::tungstenite::Message as Msg;

        tracing::info!("Connecting to EventSub WebSocket");
        let (mut ws, _) = connect_async(EVENTSUB_URL).await?;
        let session_id = Self::wait_for_welcome(&mut ws).await?;
        Self::subscribe_events(config, &session_id).await?;

        let timeout = KEEPALIVE_TIMEOUT * 2;
        loop {
            tokio::select! {
                _ = shutdown_rx.recv() => {
                    tracing::info!("EventSub shutdown during listen");
                    let _ = ws.close(None).await;
                    return Ok(());
                }
                result = tokio::time::timeout(timeout, ws.next()) => {
                    match result {
                        Ok(Some(Ok(Msg::Text(text)))) => {
                            Self::handle_message(&text, event_tx).await?;
                        }
                        Ok(Some(Ok(Msg::Ping(data)))) => {
                            let _ = ws.send(Msg::Pong(data)).await;
                        }
                        Ok(Some(Ok(Msg::Close(_)))) | Ok(None) => {
                            tracing::warn!("EventSub WebSocket closed by server");
                            return Err(TwitchError::EventSub("Server closed".into()));
                        }
                        Ok(Some(Err(e))) => return Err(TwitchError::WebSocket(e)),
                        Ok(Some(Ok(_))) => {}
                        Err(_) => {
                            tracing::warn!("EventSub keepalive timeout");
                            return Err(TwitchError::Timeout);
                        }
                    }
                }
            }
        }
    }

    async fn wait_for_welcome(
        ws: &mut tokio_tungstenite::WebSocketStream<
            tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
        >,
    ) -> Result<String, TwitchError> {
        use tokio_tungstenite::tungstenite::Message as Msg;
        loop {
            match tokio::time::timeout(KEEPALIVE_TIMEOUT, ws.next()).await {
                Ok(Some(Ok(Msg::Text(text)))) => {
                    let ws_msg: WsMessage = serde_json::from_str(&text)?;
                    if ws_msg.metadata.message_type == "session_welcome" {
                        let p: WelcomePayload = serde_json::from_value(ws_msg.payload)?;
                        tracing::info!(session_id = %p.session.id, "EventSub welcome");
                        return Ok(p.session.id);
                    }
                }
                Ok(Some(Ok(_))) => continue,
                Ok(Some(Err(e))) => return Err(TwitchError::WebSocket(e)),
                Ok(None) => return Err(TwitchError::EventSub("Connection closed".into())),
                Err(_) => return Err(TwitchError::Timeout),
            }
        }
    }

    async fn handle_message(
        text: &str,
        event_tx: &mpsc::Sender<EventSubEvent>,
    ) -> Result<(), TwitchError> {
        let ws_msg: WsMessage = serde_json::from_str(text)?;
        match ws_msg.metadata.message_type.as_str() {
            "session_keepalive" => {
                tracing::trace!("EventSub keepalive received");
            }
            "notification" => {
                if let Some(sub_type) = ws_msg.payload.get("subscription")
                    .and_then(|s| s.get("type"))
                    .and_then(|t| t.as_str())
                {
                    let payload = ws_msg.payload.get("event")
                        .cloned()
                        .unwrap_or(serde_json::Value::Null);
                    let event = EventSubEvent {
                        event_type: sub_type.to_string(),
                        payload,
                    };
                    tracing::debug!(event_type = %event.event_type, "EventSub notification");
                    let _ = event_tx.send(event).await;
                }
            }
            "revocation" => {
                let sub_type = ws_msg.payload.get("subscription")
                    .and_then(|s| s.get("type"))
                    .and_then(|t| t.as_str())
                    .unwrap_or("unknown");
                tracing::warn!(sub_type, "EventSub subscription revoked");
            }
            other => tracing::debug!(msg_type = other, "Unhandled EventSub message"),
        }
        Ok(())
    }

    async fn subscribe_events(
        config: &EventSubConfig,
        session_id: &str,
    ) -> Result<(), TwitchError> {
        let http = reqwest::Client::new();
        for event_type in &config.subscriptions {
            let req = SubscribeRequest {
                event_type: event_type.clone(),
                version: Self::event_version(event_type).into(),
                condition: Self::build_condition(event_type, &config.broadcaster_user_id),
                transport: SubscribeTransport {
                    method: "websocket".into(),
                    session_id: session_id.into(),
                },
            };
            let resp = http
                .post("https://api.twitch.tv/helix/eventsub/subscriptions")
                .header("Authorization", format!("Bearer {}", config.access_token))
                .header("Client-Id", &config.client_id)
                .json(&req)
                .send()
                .await?;
            if resp.status().is_success() {
                tracing::info!(event_type, "Subscribed to EventSub event");
            } else {
                let status = resp.status().as_u16();
                let body = resp.text().await.unwrap_or_default();
                tracing::error!(event_type, status, body, "Failed to subscribe");
            }
        }
        Ok(())
    }

    fn event_version(event_type: &str) -> &'static str {
        match event_type {
            EVENT_CHANNEL_FOLLOW => "2",
            _ => "1",
        }
    }

    fn build_condition(event_type: &str, broadcaster_id: &str) -> serde_json::Value {
        match event_type {
            EVENT_CHANNEL_FOLLOW => serde_json::json!({
                "broadcaster_user_id": broadcaster_id,
                "moderator_user_id": broadcaster_id,
            }),
            EVENT_CHAT_MESSAGE => serde_json::json!({
                "broadcaster_user_id": broadcaster_id,
                "user_id": broadcaster_id,
            }),
            EVENT_CHANNEL_RAID => serde_json::json!({
                "to_broadcaster_user_id": broadcaster_id,
            }),
            _ => serde_json::json!({
                "broadcaster_user_id": broadcaster_id,
            }),
        }
    }
    fn backoff_duration(failures: u32) -> Duration {
        let d = BASE_BACKOFF * 2u32.saturating_pow(failures.saturating_sub(1));
        d.min(MAX_BACKOFF)
    }
}
