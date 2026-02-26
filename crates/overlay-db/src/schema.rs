//! Database schema definitions and migrations.

use rusqlite::Connection;

use crate::DbError;

mod migrations;
mod schema_sql;

pub fn run_migrations(conn: &Connection) -> Result<(), DbError> {
    conn.execute_batch(schema_sql::SCHEMA)?;
    migrations::migrate_legacy_tables(conn)?;
    Ok(())
}
