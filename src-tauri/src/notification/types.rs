//! Notification type definitions.

use serde::{Deserialize, Serialize};

/// A chat notification to be displayed.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatNotification {
    pub username: String,
    pub message: String,
    pub fragments: Vec<FragmentInfo>,
    pub avatar_url: Option<String>,
    pub color: Option<String>,
    pub display_mode: DisplayMode,
    pub notification_type: NotificationType,
}

/// Fragment types for mixed content rendering.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum FragmentInfo {
    Text(String),
    Emoji(String),
    Emote { id: String, url: String },
}

/// How the notification is displayed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DisplayMode {
    Queue,
    Overwrite,
}

impl Default for DisplayMode {
    fn default() -> Self {
        Self::Queue
    }
}

impl DisplayMode {
    pub fn from_str_setting(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "overwrite" => Self::Overwrite,
            _ => Self::Queue,
        }
    }
}

/// Type of notification event.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NotificationType {
    Chat,
    Follow,
    Subscribe,
    GiftSub,
    Resub,
    Cheer,
    Raid,
    Shoutout,
}
