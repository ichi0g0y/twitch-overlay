//! Image cache management service.
#![allow(dead_code)]

use std::path::PathBuf;

use overlay_db::cache::{CacheEntry, CacheStats};
use overlay_db::Database;
use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};

const DEFAULT_EXPIRY_DAYS: i64 = 7;
const DEFAULT_MAX_SIZE_MB: i64 = 100;

#[derive(Debug, thiserror::Error)]
pub enum CacheError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Database error: {0}")]
    Db(#[from] overlay_db::DbError),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheSettings {
    pub expiry_days: i64,
    pub max_size_mb: i64,
    pub cleanup_enabled: bool,
    pub cleanup_on_start: bool,
}

impl Default for CacheSettings {
    fn default() -> Self {
        Self {
            expiry_days: DEFAULT_EXPIRY_DAYS,
            max_size_mb: DEFAULT_MAX_SIZE_MB,
            cleanup_enabled: true,
            cleanup_on_start: true,
        }
    }
}

#[derive(Clone)]
pub struct CacheService {
    db: Database,
    data_dir: PathBuf,
}

impl CacheService {
    pub fn new(db: Database, data_dir: PathBuf) -> Self {
        Self { db, data_dir }
    }

    fn cache_dir(&self) -> PathBuf {
        self.data_dir.join("cache")
    }

    fn ensure_dir(&self) -> Result<(), CacheError> {
        std::fs::create_dir_all(self.cache_dir())?;
        Ok(())
    }

    fn hash_url(url: &str) -> String {
        let mut hasher = Sha1::new();
        hasher.update(url.as_bytes());
        hex::encode(hasher.finalize())
    }

    /// Add a cache entry: save data to disk and record in DB.
    pub fn add_entry(&self, url: &str, data: &[u8]) -> Result<CacheEntry, CacheError> {
        self.ensure_dir()?;
        let url_hash = Self::hash_url(url);
        let file_path = self.cache_dir().join(&url_hash);
        std::fs::write(&file_path, data)?;

        let path_str = file_path.to_string_lossy().into_owned();
        self.db
            .add_cache_entry(&url_hash, url, &path_str, data.len() as i64)?;

        let entry = self
            .db
            .get_cache_entry(&url_hash)?
            .ok_or_else(|| CacheError::Db(overlay_db::DbError::NotFound("just inserted".into())))?;

        tracing::debug!(url_hash = %url_hash, "Cache entry added");
        Ok(entry)
    }

    /// Get a cache entry by URL, updating last-accessed time.
    pub fn get_entry(&self, url: &str) -> Result<Option<CacheEntry>, CacheError> {
        let url_hash = Self::hash_url(url);
        let entry = self.db.get_cache_entry(&url_hash)?;
        if entry.is_some() {
            let _ = self.db.touch_cache_entry(&url_hash);
        }
        Ok(entry)
    }

    pub fn get_settings(&self) -> CacheSettings {
        let read = |key: &str, default: &str| -> String {
            self.db
                .get_setting(key)
                .ok()
                .flatten()
                .unwrap_or_else(|| default.to_string())
        };
        CacheSettings {
            expiry_days: read("cache_expiry_days", "7").parse().unwrap_or(DEFAULT_EXPIRY_DAYS),
            max_size_mb: read("cache_max_size_mb", "100").parse().unwrap_or(DEFAULT_MAX_SIZE_MB),
            cleanup_enabled: read("cache_cleanup_enabled", "true") == "true",
            cleanup_on_start: read("cache_cleanup_on_start", "true") == "true",
        }
    }

    pub fn update_settings(&self, s: &CacheSettings) -> Result<(), CacheError> {
        self.db.set_setting("cache_expiry_days", &s.expiry_days.to_string(), "cache")?;
        self.db.set_setting("cache_max_size_mb", &s.max_size_mb.to_string(), "cache")?;
        self.db.set_setting("cache_cleanup_enabled", &s.cleanup_enabled.to_string(), "cache")?;
        self.db.set_setting("cache_cleanup_on_start", &s.cleanup_on_start.to_string(), "cache")?;
        Ok(())
    }

    pub fn get_stats(&self) -> Result<CacheStats, CacheError> {
        Ok(self.db.get_cache_stats()?)
    }

    /// Delete expired cache entries and their files.
    pub fn cleanup_expired(&self) -> Result<u64, CacheError> {
        let settings = self.get_settings();
        let entries = self.db.get_all_cache_entries()?;
        let expiry_secs = settings.expiry_days * 86400;
        let now = chrono::Utc::now();
        let mut deleted = 0u64;

        for entry in &entries {
            if let Ok(created) =
                chrono::NaiveDateTime::parse_from_str(&entry.created_at, "%Y-%m-%d %H:%M:%S")
            {
                let age = now.naive_utc() - created;
                if age.num_seconds() > expiry_secs {
                    let _ = std::fs::remove_file(&entry.file_path);
                    let _ = self.db.delete_cache_entry(&entry.url_hash);
                    deleted += 1;
                }
            }
        }
        tracing::info!(deleted = deleted, "Expired cache cleaned up");
        Ok(deleted)
    }

    /// Remove oldest entries until cache is under max size.
    pub fn cleanup_oversize(&self) -> Result<u64, CacheError> {
        let settings = self.get_settings();
        let stats = self.get_stats()?;
        let max_bytes = settings.max_size_mb * 1024 * 1024;

        if stats.total_size_bytes <= max_bytes {
            return Ok(0);
        }

        let target = max_bytes * 80 / 100;
        let mut to_free = stats.total_size_bytes - target;
        let entries = self.db.get_all_cache_entries()?;
        let mut deleted = 0u64;

        // Entries ordered by last_accessed DESC; reverse for oldest first
        for entry in entries.iter().rev() {
            if to_free <= 0 {
                break;
            }
            let _ = std::fs::remove_file(&entry.file_path);
            let _ = self.db.delete_cache_entry(&entry.url_hash);
            to_free -= entry.file_size;
            deleted += 1;
        }
        tracing::info!(deleted = deleted, "Oversize cache cleaned up");
        Ok(deleted)
    }

    /// Remove all cache entries and files.
    pub fn clear_all(&self) -> Result<(), CacheError> {
        let entries = self.db.get_all_cache_entries()?;
        for entry in &entries {
            let _ = std::fs::remove_file(&entry.file_path);
        }
        self.db.clear_all_cache_entries()?;
        tracing::info!("All cache cleared");
        Ok(())
    }
}
