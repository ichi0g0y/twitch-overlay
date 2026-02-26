async fn resolve_chat_user_profile(
    state: &SharedState,
    user_id: &str,
    username_hint: Option<&str>,
    force_refresh: bool,
) -> Result<(String, String, String, String), (axum::http::StatusCode, Json<Value>)> {
    let normalized_user_id = user_id.trim();
    if normalized_user_id.is_empty() {
        return Err(err_json(400, "user_id is required"));
    }

    let existing = state
        .db()
        .get_chat_user_profile(normalized_user_id)
        .map_err(|e| err_json(500, &e.to_string()))?;

    let hinted_username = username_hint
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let mut username = hinted_username
        .clone()
        .or_else(|| existing.as_ref().map(|p| p.username.clone()))
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| normalized_user_id.to_string());
    let mut display_name = existing
        .as_ref()
        .map(|p| p.display_name.clone())
        .or_else(|| hinted_username.clone())
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| username.clone());
    let mut avatar_url = existing
        .as_ref()
        .map(|p| p.avatar_url.clone())
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_default();
    let color = existing
        .as_ref()
        .map(|p| p.color.clone())
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_default();

    if force_refresh
        || avatar_url.is_empty()
        || username == normalized_user_id
        || username.eq_ignore_ascii_case("webui")
        || display_name.trim().is_empty()
    {
        if let Some(user) = fetch_twitch_user_profile(state, normalized_user_id).await {
            if force_refresh || username == normalized_user_id || username.eq_ignore_ascii_case("webui")
            {
                username = if user.login.trim().is_empty() {
                    normalized_user_id.to_string()
                } else {
                    user.login.clone()
                };
            }
            if force_refresh
                || display_name.trim().is_empty()
                || display_name.eq_ignore_ascii_case("webui")
            {
                display_name = if user.display_name.trim().is_empty() {
                    username.clone()
                } else {
                    user.display_name
                };
            }
            if force_refresh || avatar_url.is_empty() {
                avatar_url = user.profile_image_url;
            }
        }
    }
    if display_name.trim().is_empty() {
        display_name = username.clone();
    }

    let now = chrono::Utc::now().timestamp();
    state
        .db()
        .upsert_chat_user_profile(
            normalized_user_id,
            &username,
            &display_name,
            &avatar_url,
            "",
            now,
        )
        .map_err(|e| err_json(500, &e.to_string()))?;

    Ok((username, display_name, avatar_url, color))
}

async fn save_irc_chat_message(
    state: &SharedState,
    channel_login: &str,
    message_id: &str,
    user_id: &str,
    username_hint: Option<&str>,
    display_name_hint: Option<&str>,
    avatar_url_hint: Option<&str>,
    color_hint: Option<&str>,
    message: &str,
    badge_keys: Vec<String>,
    fragments: Value,
    created_at: i64,
) -> Result<Value, (axum::http::StatusCode, Json<Value>)> {
    let normalized_username_hint = username_hint
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToOwned::to_owned);
    let normalized_display_name_hint = display_name_hint
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToOwned::to_owned);
    let normalized_avatar_url_hint = avatar_url_hint
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToOwned::to_owned);
    let normalized_color_hint = color_hint
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToOwned::to_owned);

    let (mut username, mut display_name, mut avatar_url, mut color) = if !user_id.trim().is_empty() {
        resolve_chat_user_profile(state, user_id, username_hint, false).await?
    } else {
        let username = normalized_username_hint
            .clone()
            .unwrap_or_else(|| "unknown".to_string());
        let display_name = normalized_display_name_hint
            .clone()
            .unwrap_or_else(|| username.clone());
        let avatar_url = normalized_avatar_url_hint.clone().unwrap_or_default();
        let color = normalized_color_hint.clone().unwrap_or_default();
        (username, display_name, avatar_url, color)
    };
    if !user_id.trim().is_empty() {
        let next_username = normalized_username_hint.unwrap_or_else(|| username.clone());
        let next_display_name = normalized_display_name_hint
            .unwrap_or_else(|| display_name.clone())
            .trim()
            .to_string();
        let next_display_name = if next_display_name.is_empty() {
            next_username.clone()
        } else {
            next_display_name
        };
        let next_avatar_url = normalized_avatar_url_hint.unwrap_or_else(|| avatar_url.clone());
        let next_color = normalized_color_hint.unwrap_or_else(|| color.clone());
        let now = chrono::Utc::now().timestamp();
        state
            .db()
            .upsert_chat_user_profile(
                user_id,
                &next_username,
                &next_display_name,
                &next_avatar_url,
                &next_color,
                now,
            )
            .map_err(|e| err_json(500, &e.to_string()))?;
        username = next_username;
        display_name = next_display_name;
        avatar_url = next_avatar_url;
        color = next_color;
    }

    let irc_msg = overlay_db::chat::IrcChatMessage {
        id: 0,
        channel_login: channel_login.to_string(),
        message_id: message_id.to_string(),
        user_id: user_id.to_string(),
        username: username.clone(),
        display_name: display_name.clone(),
        message: message.to_string(),
        badge_keys: badge_keys.clone(),
        fragments_json: fragments.to_string(),
        avatar_url: String::new(),
        color: String::new(),
        created_at,
    };
    state
        .db()
        .add_irc_chat_message(&irc_msg)
        .map_err(|e| err_json(500, &e.to_string()))?;
    state
        .db()
        .cleanup_irc_chat_messages_exceeding_limit(
            channel_login,
            IRC_RETENTION_MAX_MESSAGES_PER_CHANNEL,
        )
        .map_err(|e| err_json(500, &e.to_string()))?;

    Ok(json!({
        "channel": channel_login,
        "username": username,
        "displayName": display_name,
        "userId": user_id,
        "messageId": message_id,
        "message": message,
        "chatSource": "irc",
        "badge_keys": badge_keys,
        "fragments": fragments,
        "avatarUrl": avatar_url,
        "color": color,
        "translation": "",
        "translationStatus": "",
        "translationLang": "",
        "timestamp": chrono::DateTime::from_timestamp(created_at, 0)
            .map(|dt| dt.to_rfc3339())
            .unwrap_or_else(|| chrono::Utc::now().to_rfc3339()),
    }))
}
