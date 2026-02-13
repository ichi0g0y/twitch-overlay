//! Image cache entry storage.

use crate::{Database, DbError};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheEntry {
    pub id: i64,
    pub url_hash: String,
    pub original_url: String,
    pub file_path: String,
    pub file_size: i64,
    pub created_at: String,
    pub last_accessed_at: String,
}

impl Database {
    pub fn add_cache_entry(
        &self,
        url_hash: &str,
        original_url: &str,
        file_path: &str,
        file_size: i64,
    ) -> Result<(), DbError> {
        self.with_conn(|conn| {
            conn.execute(
                "INSERT OR REPLACE INTO cache_entries (url_hash, original_url, file_path, file_size, created_at, last_accessed_at)
                 VALUES (?1, ?2, ?3, ?4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
                rusqlite::params![url_hash, original_url, file_path, file_size],
            )?;
            Ok(())
        })
    }

    pub fn get_cache_entry(&self, url_hash: &str) -> Result<Option<CacheEntry>, DbError> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, url_hash, original_url, file_path, file_size, created_at, last_accessed_at
                 FROM cache_entries WHERE url_hash = ?1",
            )?;
            let entry = stmt
                .query_row([url_hash], |row| {
                    Ok(CacheEntry {
                        id: row.get(0)?,
                        url_hash: row.get(1)?,
                        original_url: row.get(2)?,
                        file_path: row.get(3)?,
                        file_size: row.get(4)?,
                        created_at: row.get(5)?,
                        last_accessed_at: row.get(6)?,
                    })
                })
                .optional()?;
            Ok(entry)
        })
    }

    pub fn touch_cache_entry(&self, url_hash: &str) -> Result<(), DbError> {
        self.with_conn(|conn| {
            conn.execute(
                "UPDATE cache_entries SET last_accessed_at = CURRENT_TIMESTAMP WHERE url_hash = ?1",
                [url_hash],
            )?;
            Ok(())
        })
    }

    pub fn get_all_cache_entries(&self) -> Result<Vec<CacheEntry>, DbError> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, url_hash, original_url, file_path, file_size, created_at, last_accessed_at
                 FROM cache_entries ORDER BY last_accessed_at DESC",
            )?;
            let rows = stmt.query_map([], |row| {
                Ok(CacheEntry {
                    id: row.get(0)?,
                    url_hash: row.get(1)?,
                    original_url: row.get(2)?,
                    file_path: row.get(3)?,
                    file_size: row.get(4)?,
                    created_at: row.get(5)?,
                    last_accessed_at: row.get(6)?,
                })
            })?;
            rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
        })
    }

    pub fn delete_cache_entry(&self, url_hash: &str) -> Result<(), DbError> {
        self.with_conn(|conn| {
            conn.execute("DELETE FROM cache_entries WHERE url_hash = ?1", [url_hash])?;
            Ok(())
        })
    }

    pub fn clear_all_cache_entries(&self) -> Result<(), DbError> {
        self.with_conn(|conn| {
            conn.execute("DELETE FROM cache_entries", [])?;
            Ok(())
        })
    }

    pub fn get_cache_stats(&self) -> Result<CacheStats, DbError> {
        self.with_conn(|conn| {
            let total_files: i64 =
                conn.query_row("SELECT COUNT(*) FROM cache_entries", [], |row| row.get(0))?;
            let total_size: i64 = conn.query_row(
                "SELECT COALESCE(SUM(file_size), 0) FROM cache_entries",
                [],
                |row| row.get(0),
            )?;
            let oldest: Option<String> = conn
                .query_row("SELECT MIN(created_at) FROM cache_entries", [], |row| {
                    row.get(0)
                })
                .optional()?
                .flatten();

            Ok(CacheStats {
                total_files,
                total_size_bytes: total_size,
                oldest_file_date: oldest,
            })
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheStats {
    pub total_files: i64,
    pub total_size_bytes: i64,
    pub oldest_file_date: Option<String>,
}

trait OptionalExt<T> {
    fn optional(self) -> Result<Option<T>, rusqlite::Error>;
}

impl<T> OptionalExt<T> for Result<T, rusqlite::Error> {
    fn optional(self) -> Result<Option<T>, rusqlite::Error> {
        match self {
            Ok(v) => Ok(Some(v)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }
}
