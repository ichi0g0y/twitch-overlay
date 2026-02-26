//! SQLite database layer for the overlay application.

pub mod broadcast_cache;
pub mod cache;
pub mod chat;
pub mod lottery;
pub mod lottery_engine;
pub mod lottery_history;
pub mod lottery_settings;
pub mod music;
pub mod rewards;
pub mod schema;
pub mod settings;
pub mod tokens;
pub mod word_filter;

use std::path::Path;
use std::sync::{Arc, Mutex};

use rusqlite::Connection;

/// Thread-safe database handle wrapping a single SQLite connection.
#[derive(Clone)]
pub struct Database {
    conn: Arc<Mutex<Connection>>,
}

impl Database {
    /// Open or create database at the given path.
    pub fn open(path: impl AsRef<Path>) -> Result<Self, DbError> {
        let conn = Connection::open(path)?;
        let db = Self {
            conn: Arc::new(Mutex::new(conn)),
        };
        db.configure()?;
        db.migrate()?;
        Ok(db)
    }

    /// Create an in-memory database (for testing).
    pub fn open_in_memory() -> Result<Self, DbError> {
        let conn = Connection::open_in_memory()?;
        let db = Self {
            conn: Arc::new(Mutex::new(conn)),
        };
        db.configure()?;
        db.migrate()?;
        Ok(db)
    }

    /// Access the underlying connection with a closure.
    pub fn with_conn<F, R>(&self, f: F) -> Result<R, DbError>
    where
        F: FnOnce(&Connection) -> Result<R, DbError>,
    {
        let conn = self.conn.lock().map_err(|_| DbError::LockPoisoned)?;
        f(&conn)
    }

    /// Access the underlying connection mutably (for transactions).
    pub fn with_conn_mut<F, R>(&self, f: F) -> Result<R, DbError>
    where
        F: FnOnce(&mut Connection) -> Result<R, DbError>,
    {
        let mut conn = self.conn.lock().map_err(|_| DbError::LockPoisoned)?;
        f(&mut conn)
    }

    fn configure(&self) -> Result<(), DbError> {
        self.with_conn(|conn| {
            conn.execute_batch(
                "PRAGMA journal_mode=WAL;
                 PRAGMA busy_timeout=5000;
                 PRAGMA foreign_keys=ON;",
            )?;
            Ok(())
        })
    }

    fn migrate(&self) -> Result<(), DbError> {
        self.with_conn(|conn| {
            schema::run_migrations(conn)?;
            Ok(())
        })
    }
}

/// Database error type.
#[derive(Debug, thiserror::Error)]
pub enum DbError {
    #[error("SQLite error: {0}")]
    Sqlite(#[from] rusqlite::Error),

    #[error("Database lock poisoned")]
    LockPoisoned,

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Invalid data: {0}")]
    InvalidData(String),
}

#[cfg(test)]
mod tests;
