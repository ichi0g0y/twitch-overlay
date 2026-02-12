use std::path::PathBuf;
use std::sync::{Arc, OnceLock};

use overlay_db::Database;
use serde::Serialize;
use tauri::Emitter;
use tokio::sync::{RwLock, broadcast};

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
}
