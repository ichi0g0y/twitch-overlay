//! Fax (printed image) management with auto-deletion.
#![allow(dead_code)]

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, LazyLock, RwLock as StdRwLock};

use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

type FaxStore = Arc<RwLock<HashMap<String, Fax>>>;

static GLOBAL_FAX_STORES: LazyLock<StdRwLock<HashMap<String, FaxStore>>> =
    LazyLock::new(|| StdRwLock::new(HashMap::new()));

#[derive(Debug, thiserror::Error)]
pub enum FaxError {
    #[error("Fax not found: {0}")]
    NotFound(String),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Invalid image type: {0}")]
    InvalidImageType(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Fax {
    pub id: String,
    pub user_name: String,
    pub message: String,
    pub image_url: String,
    pub avatar_url: String,
    pub timestamp: i64,
    pub color_path: String,
    pub mono_path: String,
}

#[derive(Clone)]
pub struct FaxService {
    storage: FaxStore,
    data_dir: PathBuf,
}

impl FaxService {
    pub fn new(data_dir: PathBuf) -> Self {
        let key = data_dir.to_string_lossy().into_owned();
        let storage = {
            if let Some(existing) = GLOBAL_FAX_STORES
                .read()
                .expect("GLOBAL_FAX_STORES poisoned")
                .get(&key)
                .cloned()
            {
                existing
            } else {
                let mut stores = GLOBAL_FAX_STORES
                    .write()
                    .expect("GLOBAL_FAX_STORES poisoned");
                stores
                    .entry(key)
                    .or_insert_with(|| Arc::new(RwLock::new(HashMap::new())))
                    .clone()
            }
        };

        Self { storage, data_dir }
    }

    fn output_dir(&self) -> PathBuf {
        self.data_dir.join("output")
    }

    /// Save a fax with color and mono image data, schedule auto-deletion.
    pub async fn save_fax(
        &self,
        user_name: &str,
        message: &str,
        image_url: &str,
        avatar_url: &str,
        color_data: &[u8],
        mono_data: &[u8],
    ) -> Result<Fax, FaxError> {
        std::fs::create_dir_all(self.output_dir())?;

        let id = nanoid::nanoid!();
        let dir = self.output_dir();
        let color_path = dir.join(format!("{id}_color.png"));
        let mono_path = dir.join(format!("{id}_mono.png"));

        std::fs::write(&color_path, color_data)?;
        std::fs::write(&mono_path, mono_data)?;

        let fax = Fax {
            id: id.clone(),
            user_name: user_name.to_string(),
            message: message.to_string(),
            image_url: image_url.to_string(),
            avatar_url: avatar_url.to_string(),
            timestamp: chrono::Utc::now().timestamp(),
            color_path: color_path.to_string_lossy().into_owned(),
            mono_path: mono_path.to_string_lossy().into_owned(),
        };

        self.storage.write().await.insert(id.clone(), fax.clone());

        // Auto-delete after 10 minutes
        let storage = self.storage.clone();
        let del_id = id.clone();
        tokio::spawn(async move {
            tokio::time::sleep(tokio::time::Duration::from_secs(600)).await;
            if let Some(fax) = storage.write().await.remove(&del_id) {
                let _ = std::fs::remove_file(&fax.color_path);
                let _ = std::fs::remove_file(&fax.mono_path);
                tracing::info!(id = %del_id, "Fax auto-deleted");
            }
        });

        tracing::info!(id = %id, user = user_name, "Fax saved");
        Ok(fax)
    }

    pub async fn get_fax(&self, id: &str) -> Option<Fax> {
        self.storage.read().await.get(id).cloned()
    }

    pub async fn get_recent_faxes(&self, limit: usize) -> Vec<Fax> {
        let store = self.storage.read().await;
        let mut faxes: Vec<Fax> = store.values().cloned().collect();
        faxes.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
        faxes.truncate(limit);
        faxes
    }

    pub async fn get_image_path(&self, id: &str, image_type: &str) -> Result<PathBuf, FaxError> {
        let fax = self
            .get_fax(id)
            .await
            .ok_or_else(|| FaxError::NotFound(id.to_string()))?;

        match image_type {
            "color" => Ok(PathBuf::from(&fax.color_path)),
            "mono" => Ok(PathBuf::from(&fax.mono_path)),
            other => Err(FaxError::InvalidImageType(other.to_string())),
        }
    }
}
