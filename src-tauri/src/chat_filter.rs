//! チャットメッセージのBot判定およびバッジキー抽出

use std::collections::HashSet;

use serde_json::Value;

const KNOWN_BOT_LOGINS: &[&str] = &["mjnco"];
const KNOWN_BOT_USER_IDS: &[&str] = &["774281749"];

/// EventSubチャットメッセージペイロードから `"set_id/id"` 形式のバッジキーを抽出する。
pub fn extract_badge_keys(payload: &Value) -> Vec<String> {
    let Some(items) = payload.get("badges").and_then(|badges| badges.as_array()) else {
        return Vec::new();
    };

    let mut keys = Vec::new();
    let mut dedupe = HashSet::new();
    for item in items {
        let Some(set_id_raw) = item.get("set_id").and_then(|v| v.as_str()) else {
            continue;
        };
        let set_id = set_id_raw.trim();
        if set_id.is_empty() {
            continue;
        }
        let badge_id = item
            .get("id")
            .and_then(|v| v.as_str())
            .map(str::trim)
            .unwrap_or_default();
        let key = if badge_id.is_empty() {
            set_id.to_string()
        } else {
            format!("{set_id}/{badge_id}")
        };
        if dedupe.insert(key.clone()) {
            keys.push(key);
        }
    }
    keys
}

/// Botメッセージと判定した場合に `true` を返す。
/// 通知はスキップされるが、DB保存・WebSocket転送は継続される。
pub fn is_bot_chat_message(
    payload: &Value,
    user_id: &str,
    username: &str,
    badge_keys: &[String],
) -> bool {
    if bool_field(payload, &["chatter_is_bot"]) || bool_field(payload, &["is_bot"]) {
        return true;
    }

    let normalized_user_id = user_id.trim();
    if KNOWN_BOT_USER_IDS
        .iter()
        .any(|known| *known == normalized_user_id)
    {
        return true;
    }

    let normalized_username = username.trim().to_lowercase();
    if KNOWN_BOT_LOGINS
        .iter()
        .any(|known| known.eq_ignore_ascii_case(&normalized_username))
    {
        return true;
    }

    badge_keys
        .iter()
        .any(|badge| badge == "bot" || badge.starts_with("bot/"))
}

fn bool_field(payload: &Value, path: &[&str]) -> bool {
    let mut cur = payload;
    for key in path {
        cur = match cur.get(*key) {
            Some(v) => v,
            None => return false,
        };
    }
    cur.as_bool().unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::{extract_badge_keys, is_bot_chat_message};

    #[test]
    fn bot_login_is_filtered() {
        let payload = serde_json::json!({});
        let badge_keys = Vec::new();
        assert!(is_bot_chat_message(&payload, "", "mjnco", &badge_keys));
    }

    #[test]
    fn bot_badge_is_filtered() {
        let payload = serde_json::json!({
            "badges": [
                { "set_id": "bot", "id": "1" }
            ]
        });
        let badge_keys = extract_badge_keys(&payload);
        assert!(is_bot_chat_message(&payload, "123", "someone", &badge_keys));
    }

    #[test]
    fn non_bot_user_is_not_filtered() {
        let payload = serde_json::json!({
            "badges": [
                { "set_id": "subscriber", "id": "12" }
            ]
        });
        let badge_keys = extract_badge_keys(&payload);
        assert!(!is_bot_chat_message(
            &payload,
            "999",
            "regular_user",
            &badge_keys
        ));
    }
}
