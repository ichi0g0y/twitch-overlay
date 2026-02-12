//! REST API handlers grouped by domain.

pub mod cache;
pub mod chat;
pub mod debug;
pub mod fax;
pub mod font;
pub mod logs;
pub mod music;
pub mod music_playlist;
pub mod music_state;
pub mod overlay;
pub mod present;
pub mod printer;
pub mod reward;
pub mod settings;
pub mod twitch;
pub mod word_filter;

use axum::Json;
use serde_json::{json, Value};

/// Standard success response.
#[allow(dead_code)]
pub fn ok_json(data: Value) -> Json<Value> {
    Json(json!({ "status": "ok", "data": data }))
}

/// Standard error response.
pub fn err_json(status: u16, message: &str) -> (axum::http::StatusCode, Json<Value>) {
    (
        axum::http::StatusCode::from_u16(status).unwrap_or(axum::http::StatusCode::INTERNAL_SERVER_ERROR),
        Json(json!({ "status": "error", "error": message })),
    )
}
