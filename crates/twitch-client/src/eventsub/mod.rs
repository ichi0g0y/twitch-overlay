//! EventSub WebSocket client for real-time Twitch events.
//!
//! Connects to wss://eventsub.wss.twitch.tv/ws, handles welcome/keepalive/
//! notification messages, and manages automatic reconnection with
//! exponential backoff.

mod connection;
#[cfg(test)]
mod tests;

use std::time::{Duration, Instant};

use tokio::sync::mpsc;

use crate::TwitchError;

const EVENTSUB_URL: &str = "wss://eventsub.wss.twitch.tv/ws";
const KEEPALIVE_TIMEOUT: Duration = Duration::from_secs(30);
const BASE_BACKOFF: Duration = Duration::from_secs(2);
const MAX_BACKOFF: Duration = Duration::from_secs(60);
const FAILURE_RESET_WINDOW: Duration = Duration::from_secs(5 * 60);
const MAX_CONSECUTIVE_FAILURES_BEFORE_RESTART: u32 = 8;

/// Event types supported for subscription.
pub const EVENT_CHANNEL_FOLLOW: &str = "channel.follow";
pub const EVENT_CHANNEL_SUBSCRIBE: &str = "channel.subscribe";
pub const EVENT_CHANNEL_CHEER: &str = "channel.cheer";
pub const EVENT_CHANNEL_RAID: &str = "channel.raid";
pub const EVENT_STREAM_ONLINE: &str = "stream.online";
pub const EVENT_STREAM_OFFLINE: &str = "stream.offline";
pub const EVENT_REWARD_REDEMPTION: &str = "channel.channel_points_custom_reward_redemption.add";
pub const EVENT_CHAT_MESSAGE: &str = "channel.chat.message";
pub const EVENT_SUBSCRIPTION_GIFT: &str = "channel.subscription.gift";
pub const EVENT_SUBSCRIPTION_MESSAGE: &str = "channel.subscription.message";
pub const EVENT_SHOUTOUT_RECEIVE: &str = "channel.shoutout.receive";

/// An event received from EventSub.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
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

impl EventSubConfig {
    /// Create a config with all 11 default event subscriptions.
    pub fn with_all_events(
        client_id: String,
        access_token: String,
        broadcaster_user_id: String,
    ) -> Self {
        Self {
            client_id,
            access_token,
            broadcaster_user_id,
            subscriptions: vec![
                EVENT_CHANNEL_FOLLOW.into(),
                EVENT_CHANNEL_SUBSCRIBE.into(),
                EVENT_CHANNEL_CHEER.into(),
                EVENT_CHANNEL_RAID.into(),
                EVENT_STREAM_ONLINE.into(),
                EVENT_STREAM_OFFLINE.into(),
                EVENT_REWARD_REDEMPTION.into(),
                EVENT_CHAT_MESSAGE.into(),
                EVENT_SUBSCRIPTION_GIFT.into(),
                EVENT_SUBSCRIPTION_MESSAGE.into(),
                EVENT_SHOUTOUT_RECEIVE.into(),
            ],
        }
    }
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
        let mut last_failure_at: Option<Instant> = None;
        let mut ws_url = EVENTSUB_URL.to_string();
        loop {
            if shutdown_rx.try_recv().is_ok() {
                tracing::info!("EventSub shutdown requested");
                return;
            }
            if let Some(last_failure) = last_failure_at {
                if last_failure.elapsed() >= FAILURE_RESET_WINDOW {
                    if failures > 0 {
                        tracing::info!(failures, "EventSub failures reset after stable interval");
                    }
                    failures = 0;
                    last_failure_at = None;
                }
            }
            match Self::connect_once(&config, &ws_url, &event_tx, &mut shutdown_rx).await {
                Ok(Some(next_url)) => {
                    failures = 0;
                    ws_url = next_url;
                    tracing::info!(ws_url = %ws_url, "EventSub reconnect URL accepted");
                }
                Ok(None) => {
                    tracing::info!("EventSub connection closed cleanly");
                    return;
                }
                Err(e) => {
                    if Self::is_auth_error(&e) {
                        tracing::warn!(
                            error = %e,
                            "EventSub connection failed due to auth error; terminating loop for token re-evaluation"
                        );
                        return;
                    }
                    failures += 1;
                    last_failure_at = Some(Instant::now());
                    if ws_url != EVENTSUB_URL {
                        tracing::warn!(
                            "EventSub reconnect URL failed, falling back to default URL"
                        );
                        ws_url = EVENTSUB_URL.to_string();
                    }
                    if failures >= MAX_CONSECUTIVE_FAILURES_BEFORE_RESTART {
                        tracing::warn!(
                            failures,
                            "EventSub failures exceeded threshold; restarting client loop for full re-initialization"
                        );
                        return;
                    }
                    let backoff = Self::backoff_duration(failures);
                    tracing::warn!(
                        error = %e, attempt = failures,
                        backoff_secs = backoff.as_secs(),
                        "EventSub connection failed, will reconnect"
                    );
                    tokio::select! {
                        _ = shutdown_rx.recv() => {
                            tracing::info!("EventSub shutdown requested during reconnect backoff");
                            return;
                        }
                        _ = tokio::time::sleep(backoff) => {}
                    }
                }
            }
        }
    }

    fn backoff_duration(failures: u32) -> Duration {
        let d = BASE_BACKOFF * 2u32.saturating_pow(failures.saturating_sub(1));
        d.min(MAX_BACKOFF)
    }

    fn is_auth_error(error: &TwitchError) -> bool {
        matches!(
            error,
            TwitchError::ApiError {
                status: 401 | 403,
                ..
            } | TwitchError::AuthRequired
        )
    }
}
