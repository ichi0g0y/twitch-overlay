//! Application settings key-value store.

use std::collections::HashMap;

use crate::{Database, DbError};

impl Database {
    pub fn get_setting(&self, key: &str) -> Result<Option<String>, DbError> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = ?1")?;
            let value = stmt
                .query_row([key], |row| row.get::<_, String>(0))
                .optional()?;
            Ok(value)
        })
    }

    pub fn set_setting(&self, key: &str, value: &str, setting_type: &str) -> Result<(), DbError> {
        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO settings (key, value, setting_type, updated_at) VALUES (?1, ?2, ?3, CURRENT_TIMESTAMP)
                 ON CONFLICT(key) DO UPDATE SET value = ?2, setting_type = ?3, updated_at = CURRENT_TIMESTAMP",
                rusqlite::params![key, value, setting_type],
            )?;
            Ok(())
        })
    }

    pub fn get_all_settings(&self) -> Result<HashMap<String, String>, DbError> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare("SELECT key, value FROM settings")?;
            let rows = stmt.query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })?;
            let mut map = HashMap::new();
            for row in rows {
                let (k, v) = row?;
                map.insert(k, v);
            }
            Ok(map)
        })
    }

    pub fn get_settings_by_type(
        &self,
        setting_type: &str,
    ) -> Result<HashMap<String, String>, DbError> {
        self.with_conn(|conn| {
            let mut stmt =
                conn.prepare("SELECT key, value FROM settings WHERE setting_type = ?1")?;
            let rows = stmt.query_map([setting_type], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })?;
            let mut map = HashMap::new();
            for row in rows {
                let (k, v) = row?;
                map.insert(k, v);
            }
            Ok(map)
        })
    }

    pub fn update_settings_bulk(&self, settings: &HashMap<String, String>) -> Result<(), DbError> {
        self.with_conn_mut(|conn| {
            let tx = conn.transaction()?;
            {
                let mut stmt = tx.prepare(
                    "INSERT INTO settings (key, value, setting_type, updated_at) VALUES (?1, ?2, 'normal', CURRENT_TIMESTAMP)
                     ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = CURRENT_TIMESTAMP",
                )?;
                for (key, value) in settings {
                    stmt.execute(rusqlite::params![key, value])?;
                }
            }
            tx.commit()?;
            Ok(())
        })
    }

    pub fn delete_setting(&self, key: &str) -> Result<(), DbError> {
        self.with_conn(|conn| {
            conn.execute("DELETE FROM settings WHERE key = ?1", [key])?;
            Ok(())
        })
    }
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
