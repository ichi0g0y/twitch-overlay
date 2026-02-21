//! Tauri emit event constants and helpers.
//!
//! These events are emitted from Rust to the Tauri frontend (settings window).
//! The overlay (web/) receives updates via WebSocket/SSE from the axum server.

use serde::Serialize;

// -- Event name constants --

pub const STREAM_STATUS_CHANGED: &str = "stream_status_changed";
pub const PRINTER_CONNECTED: &str = "printer_connected";
pub const PRINTER_ERROR: &str = "printer_error";
pub const PRINT_ERROR: &str = "print_error";
pub const PRINT_SUCCESS: &str = "print_success";
pub const WEBSERVER_STARTED: &str = "webserver_started";
pub const WEBSERVER_ERROR: &str = "webserver_error";
pub const AUTH_SUCCESS: &str = "auth_success";
pub const SETTINGS_UPDATED: &str = "settings_updated";
pub const MUSIC_STATUS_UPDATE: &str = "music_status_update";
pub const MUSIC_CONTROL_COMMAND: &str = "music_control_command";
pub const FAX_RECEIVED: &str = "fax_received";
pub const EVENTSUB_EVENT: &str = "eventsub_event";
pub const SAVE_WINDOW_POSITION: &str = "save_window_position";

// -- Payload types --

#[derive(Debug, Clone, Serialize)]
pub struct StreamStatusPayload {
    pub is_live: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct PrinterStatusPayload {
    pub connected: bool,
    pub printer_type: String,
    pub target: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ErrorPayload {
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct PrintResultPayload {
    pub message: String,
    pub dry_run: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct AuthSuccessPayload {
    pub authenticated: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct SettingsUpdatedPayload {
    pub source: String,
    pub count: u32,
}

#[derive(Debug, Clone, Serialize)]
pub struct ServerStartedPayload {
    pub port: u16,
}

#[derive(Debug, Clone, Serialize)]
pub struct WindowPositionPayload {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}
