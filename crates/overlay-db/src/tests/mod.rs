use crate::Database;

fn test_db() -> Database {
    Database::open_in_memory().expect("Failed to create test DB")
}

mod cache;
mod chat;
mod core;
mod lottery;
mod music;
mod rewards;
mod word_filter;
