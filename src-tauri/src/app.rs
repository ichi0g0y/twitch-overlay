use std::path::PathBuf;
use std::sync::Arc;

use overlay_db::Database;
use tokio::sync::{broadcast, RwLock};

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
            }),
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
