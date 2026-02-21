use std::path::PathBuf;
use std::sync::{Arc, OnceLock};

use overlay_db::Database;
use serde::Serialize;
use tauri::Emitter;
use tokio::sync::{RwLock, broadcast, mpsc};
use tokio_util::sync::CancellationToken;

use crate::config::{AppConfig, SettingsManager};

/// Application shared state accessible from both Tauri commands and axum handlers.
#[derive(Clone)]
pub struct SharedState {
    inner: Arc<SharedStateInner>,
}

struct SharedStateInner {
    /// Broadcast channel for WebSocket messages
    ws_tx: broadcast::Sender<String>,
    /// Application configuration (reloadable)
    config: RwLock<AppConfig>,
    /// Database handle
    db: Database,
    /// Data directory path
    data_dir: PathBuf,
    /// Tauri AppHandle (set during setup, used for emit)
    app_handle: OnceLock<tauri::AppHandle>,
    /// Last known stream live status (None = unknown)
    stream_live: RwLock<Option<bool>>,
    /// OAuth state used to protect /callback from CSRF.
    oauth_state: RwLock<Option<String>>,
    /// Global cancellation token used to stop background loops.
    shutdown_token: CancellationToken,
    /// EventSub shutdown sender for graceful disconnect.
    eventsub_shutdown_tx: RwLock<Option<mpsc::Sender<()>>>,
}

impl SharedState {
    /// Create shared state from an already-opened database and loaded config.
    pub fn new(db: Database, config: AppConfig, data_dir: PathBuf) -> Self {
        let (ws_tx, _) = broadcast::channel(2048);

        Self {
            inner: Arc::new(SharedStateInner {
                ws_tx,
                config: RwLock::new(config),
                db,
                data_dir,
                app_handle: OnceLock::new(),
                stream_live: RwLock::new(None),
                oauth_state: RwLock::new(None),
                shutdown_token: CancellationToken::new(),
                eventsub_shutdown_tx: RwLock::new(None),
            }),
        }
    }

    /// Store the Tauri AppHandle (called once during setup).
    pub fn set_app_handle(&self, handle: tauri::AppHandle) {
        let _ = self.inner.app_handle.set(handle);
    }

    /// Emit a Tauri event to all frontend windows.
    pub fn emit_event(&self, event: &str, payload: impl Serialize + Clone) {
        if let Some(handle) = self.inner.app_handle.get() {
            if let Err(e) = handle.emit(event, payload) {
                tracing::warn!("Failed to emit event '{event}': {e}");
            }
        }
    }

    /// Get a clone of the Tauri AppHandle when available.
    pub fn app_handle(&self) -> Option<tauri::AppHandle> {
        self.inner.app_handle.get().cloned()
    }

    pub fn server_port(&self) -> u16 {
        // Read from config; fallback to 8080.
        self.inner
            .config
            .try_read()
            .map(|c| c.server_port)
            .unwrap_or(8080)
    }

    pub fn ws_sender(&self) -> &broadcast::Sender<String> {
        &self.inner.ws_tx
    }

    pub fn subscribe_ws(&self) -> broadcast::Receiver<String> {
        self.inner.ws_tx.subscribe()
    }

    pub fn db(&self) -> &Database {
        &self.inner.db
    }

    pub fn data_dir(&self) -> &PathBuf {
        &self.inner.data_dir
    }

    /// Get a read lock on the current config.
    pub async fn config(&self) -> tokio::sync::RwLockReadGuard<'_, AppConfig> {
        self.inner.config.read().await
    }

    /// Reload config from the database.
    pub async fn reload_config(&self) -> Result<(), anyhow::Error> {
        let sm = SettingsManager::new(self.inner.db.clone());
        let mut config = self.inner.config.write().await;
        config.reload(&sm)?;
        Ok(())
    }

    /// Update the last known stream live status.
    pub async fn set_stream_live(&self, is_live: bool) {
        let mut status = self.inner.stream_live.write().await;
        *status = Some(is_live);
    }

    /// Get the last known stream live status.
    pub async fn stream_live(&self) -> Option<bool> {
        *self.inner.stream_live.read().await
    }

    /// Store OAuth state before redirecting to Twitch.
    pub async fn set_oauth_state(&self, state: String) {
        let mut oauth_state = self.inner.oauth_state.write().await;
        *oauth_state = Some(state);
    }

    /// Consume stored OAuth state for callback validation.
    pub async fn take_oauth_state(&self) -> Option<String> {
        let mut oauth_state = self.inner.oauth_state.write().await;
        oauth_state.take()
    }

    /// Global cancellation token for graceful shutdown.
    pub fn shutdown_token(&self) -> &CancellationToken {
        &self.inner.shutdown_token
    }

    /// Store EventSub shutdown sender for graceful shutdown.
    pub async fn set_eventsub_shutdown(&self, tx: mpsc::Sender<()>) {
        let mut slot = self.inner.eventsub_shutdown_tx.write().await;
        *slot = Some(tx);
    }

    /// Take EventSub shutdown sender during graceful shutdown.
    pub async fn take_eventsub_shutdown(&self) -> Option<mpsc::Sender<()>> {
        let mut slot = self.inner.eventsub_shutdown_tx.write().await;
        slot.take()
    }
}
