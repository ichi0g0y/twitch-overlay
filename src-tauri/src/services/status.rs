//! Stream and printer status management with WebSocket broadcast.
#![allow(dead_code)]

use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tokio::sync::{broadcast, RwLock};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamStatus {
    pub is_live: bool,
    pub started_at: Option<i64>,
    pub viewer_count: i32,
    pub last_checked: i64,
}

impl Default for StreamStatus {
    fn default() -> Self {
        Self {
            is_live: false,
            started_at: None,
            viewer_count: 0,
            last_checked: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrinterStatus {
    pub connected: bool,
}

impl Default for PrinterStatus {
    fn default() -> Self {
        Self { connected: false }
    }
}

type StreamCallback = Box<dyn Fn(StreamStatus) + Send + Sync>;
type PrinterCallback = Box<dyn Fn(bool) + Send + Sync>;

struct StatusInner {
    stream: StreamStatus,
    printer: PrinterStatus,
    stream_callbacks: Vec<StreamCallback>,
    printer_callbacks: Vec<PrinterCallback>,
    ws_tx: broadcast::Sender<String>,
}

#[derive(Clone)]
pub struct StatusManager {
    inner: Arc<RwLock<StatusInner>>,
}

impl StatusManager {
    pub fn new(ws_tx: broadcast::Sender<String>) -> Self {
        Self {
            inner: Arc::new(RwLock::new(StatusInner {
                stream: StreamStatus::default(),
                printer: PrinterStatus::default(),
                stream_callbacks: Vec::new(),
                printer_callbacks: Vec::new(),
                ws_tx,
            })),
        }
    }

    pub async fn set_stream_online(&self, started_at: i64, viewer_count: i32) {
        let (changed, status) = {
            let mut inner = self.inner.write().await;
            let was_live = inner.stream.is_live;
            inner.stream.is_live = true;
            inner.stream.started_at = Some(started_at);
            inner.stream.viewer_count = viewer_count;
            inner.stream.last_checked = chrono::Utc::now().timestamp();
            (!was_live, inner.stream.clone())
        };
        if changed {
            self.notify_stream(&status).await;
            self.broadcast("stream_online", &status).await;
        }
    }

    pub async fn set_stream_offline(&self) {
        let (changed, status) = {
            let mut inner = self.inner.write().await;
            let was_live = inner.stream.is_live;
            inner.stream.is_live = false;
            inner.stream.started_at = None;
            inner.stream.viewer_count = 0;
            inner.stream.last_checked = chrono::Utc::now().timestamp();
            (was_live, inner.stream.clone())
        };
        if changed {
            self.notify_stream(&status).await;
            self.broadcast("stream_offline", &status).await;
        }
    }

    pub async fn update_viewer_count(&self, count: i32) {
        let mut inner = self.inner.write().await;
        inner.stream.viewer_count = count;
        inner.stream.last_checked = chrono::Utc::now().timestamp();
    }

    pub async fn get_stream_status(&self) -> StreamStatus {
        self.inner.read().await.stream.clone()
    }

    pub async fn set_printer_connected(&self, connected: bool) {
        let changed = {
            let mut inner = self.inner.write().await;
            let was = inner.printer.connected;
            inner.printer.connected = connected;
            was != connected
        };
        if changed {
            self.notify_printer(connected).await;
            let event = if connected { "printer_connected" } else { "printer_disconnected" };
            let msg = serde_json::json!({ "type": event, "data": { "connected": connected } });
            let inner = self.inner.read().await;
            let _ = inner.ws_tx.send(msg.to_string());
        }
    }

    pub async fn is_printer_connected(&self) -> bool {
        self.inner.read().await.printer.connected
    }

    pub async fn on_stream_change(&self, callback: StreamCallback) {
        self.inner.write().await.stream_callbacks.push(callback);
    }

    pub async fn on_printer_change(&self, callback: PrinterCallback) {
        self.inner.write().await.printer_callbacks.push(callback);
    }

    async fn notify_stream(&self, status: &StreamStatus) {
        let inner = self.inner.read().await;
        for cb in &inner.stream_callbacks {
            cb(status.clone());
        }
    }

    async fn notify_printer(&self, connected: bool) {
        let inner = self.inner.read().await;
        for cb in &inner.printer_callbacks {
            cb(connected);
        }
    }

    async fn broadcast(&self, event_type: &str, status: &StreamStatus) {
        let msg = serde_json::json!({ "type": event_type, "data": status });
        let inner = self.inner.read().await;
        let _ = inner.ws_tx.send(msg.to_string());
    }
}
