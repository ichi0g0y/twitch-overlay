//! Broadcast cache storage for tracking last broadcast dates.

use crate::{Database, DbError};

#[derive(Debug, Clone)]
pub struct BroadcastCacheEntry {
    pub broadcaster_id: String,
    pub last_broadcast_at: String,
    pub updated_at: i64,
}

impl Database {
    /// 単一エントリをUPSERT
    pub fn upsert_broadcast_cache(
        &self,
        broadcaster_id: &str,
        last_broadcast_at: &str,
        updated_at: i64,
    ) -> Result<(), DbError> {
        if broadcaster_id.trim().is_empty() {
            return Ok(());
        }
        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO channel_broadcast_cache (broadcaster_id, last_broadcast_at, updated_at)
                 VALUES (?1, ?2, ?3)
                 ON CONFLICT(broadcaster_id) DO UPDATE SET
                    last_broadcast_at = excluded.last_broadcast_at,
                    updated_at = excluded.updated_at",
                rusqlite::params![broadcaster_id, last_broadcast_at, updated_at],
            )?;
            Ok(())
        })
    }

    /// バッチUPSERT（トランザクション内）
    pub fn upsert_broadcast_cache_batch(
        &self,
        entries: &[BroadcastCacheEntry],
    ) -> Result<(), DbError> {
        if entries.is_empty() {
            return Ok(());
        }
        self.with_conn_mut(|conn| {
            let tx = conn.transaction()?;
            {
                let mut stmt = tx.prepare(
                    "INSERT INTO channel_broadcast_cache (broadcaster_id, last_broadcast_at, updated_at)
                     VALUES (?1, ?2, ?3)
                     ON CONFLICT(broadcaster_id) DO UPDATE SET
                        last_broadcast_at = excluded.last_broadcast_at,
                        updated_at = excluded.updated_at",
                )?;
                for entry in entries {
                    stmt.execute(rusqlite::params![
                        entry.broadcaster_id,
                        entry.last_broadcast_at,
                        entry.updated_at,
                    ])?;
                }
            }
            tx.commit()?;
            Ok(())
        })
    }

    /// 指定IDのキャッシュエントリを取得
    pub fn get_broadcast_cache(
        &self,
        broadcaster_ids: &[String],
    ) -> Result<Vec<BroadcastCacheEntry>, DbError> {
        if broadcaster_ids.is_empty() {
            return Ok(Vec::new());
        }
        self.with_conn(|conn| {
            let placeholders: Vec<String> = (1..=broadcaster_ids.len())
                .map(|i| format!("?{i}"))
                .collect();
            let sql = format!(
                "SELECT broadcaster_id, last_broadcast_at, updated_at
                 FROM channel_broadcast_cache
                 WHERE broadcaster_id IN ({})",
                placeholders.join(", ")
            );
            let mut stmt = conn.prepare(&sql)?;
            let params: Vec<&dyn rusqlite::types::ToSql> = broadcaster_ids
                .iter()
                .map(|id| id as &dyn rusqlite::types::ToSql)
                .collect();
            let rows = stmt
                .query_map(params.as_slice(), |row| {
                    Ok(BroadcastCacheEntry {
                        broadcaster_id: row.get(0)?,
                        last_broadcast_at: row.get(1)?,
                        updated_at: row.get(2)?,
                    })
                })?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(rows)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_db() -> Database {
        Database::open_in_memory().expect("Failed to create test DB")
    }

    #[test]
    fn test_upsert_and_get() {
        let db = test_db();

        db.upsert_broadcast_cache("user1", "2025-01-15T10:00:00Z", 1000)
            .unwrap();
        db.upsert_broadcast_cache("user2", "2025-01-14T08:00:00Z", 1000)
            .unwrap();

        let entries = db
            .get_broadcast_cache(&["user1".to_string(), "user2".to_string()])
            .unwrap();
        assert_eq!(entries.len(), 2);

        let user1 = entries
            .iter()
            .find(|e| e.broadcaster_id == "user1")
            .unwrap();
        assert_eq!(user1.last_broadcast_at, "2025-01-15T10:00:00Z");
    }

    #[test]
    fn test_upsert_overwrites() {
        let db = test_db();

        db.upsert_broadcast_cache("user1", "2025-01-15T10:00:00Z", 1000)
            .unwrap();
        db.upsert_broadcast_cache("user1", "2025-01-16T12:00:00Z", 2000)
            .unwrap();

        let entries = db.get_broadcast_cache(&["user1".to_string()]).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].last_broadcast_at, "2025-01-16T12:00:00Z");
        assert_eq!(entries[0].updated_at, 2000);
    }

    #[test]
    fn test_batch_upsert() {
        let db = test_db();

        let entries = vec![
            BroadcastCacheEntry {
                broadcaster_id: "user1".to_string(),
                last_broadcast_at: "2025-01-15T10:00:00Z".to_string(),
                updated_at: 1000,
            },
            BroadcastCacheEntry {
                broadcaster_id: "user2".to_string(),
                last_broadcast_at: "2025-01-14T08:00:00Z".to_string(),
                updated_at: 1000,
            },
            BroadcastCacheEntry {
                broadcaster_id: "user3".to_string(),
                last_broadcast_at: "2025-01-13T06:00:00Z".to_string(),
                updated_at: 1000,
            },
        ];
        db.upsert_broadcast_cache_batch(&entries).unwrap();

        let results = db
            .get_broadcast_cache(&[
                "user1".to_string(),
                "user2".to_string(),
                "user3".to_string(),
            ])
            .unwrap();
        assert_eq!(results.len(), 3);
    }

    #[test]
    fn test_get_missing_ids() {
        let db = test_db();

        db.upsert_broadcast_cache("user1", "2025-01-15T10:00:00Z", 1000)
            .unwrap();

        let entries = db
            .get_broadcast_cache(&["user1".to_string(), "missing".to_string()])
            .unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].broadcaster_id, "user1");
    }

    #[test]
    fn test_empty_ids() {
        let db = test_db();
        let entries = db.get_broadcast_cache(&[]).unwrap();
        assert!(entries.is_empty());
    }

    #[test]
    fn test_empty_broadcaster_id_ignored() {
        let db = test_db();
        db.upsert_broadcast_cache("", "2025-01-15T10:00:00Z", 1000)
            .unwrap();
        db.upsert_broadcast_cache("  ", "2025-01-15T10:00:00Z", 1000)
            .unwrap();
        // 空のIDは無視されるため、取得結果は空
        let entries = db
            .get_broadcast_cache(&["".to_string(), "  ".to_string()])
            .unwrap();
        assert!(entries.is_empty());
    }

    #[test]
    fn test_empty_batch() {
        let db = test_db();
        db.upsert_broadcast_cache_batch(&[]).unwrap();
    }
}
