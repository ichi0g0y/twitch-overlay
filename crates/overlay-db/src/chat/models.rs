use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub id: i64,
    pub message_id: String,
    pub user_id: String,
    pub username: String,
    pub display_name: String,
    pub message: String,
    pub badge_keys: Vec<String>,
    pub fragments_json: String,
    pub avatar_url: String,
    pub color: String,
    pub translation_text: String,
    pub translation_status: String,
    pub translation_lang: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatUserProfile {
    pub user_id: String,
    pub username: String,
    pub display_name: String,
    pub avatar_url: String,
    pub color: String,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IrcChatMessage {
    pub id: i64,
    pub channel_login: String,
    pub message_id: String,
    pub user_id: String,
    pub username: String,
    pub display_name: String,
    pub message: String,
    pub badge_keys: Vec<String>,
    pub fragments_json: String,
    pub avatar_url: String,
    pub color: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IrcChannelProfile {
    pub channel_login: String,
    pub display_name: String,
    pub updated_at: i64,
}
