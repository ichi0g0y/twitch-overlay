pub async fn post_chat_message(
    State(state): State<SharedState>,
    Json(body): Json<PostChatBody>,
) -> ApiResult {
    let message = body.message.trim().to_string();
    if message.is_empty() {
        return Err(err_json(400, "message is required"));
    }

    if let Some(channel) = body.channel.as_deref().filter(|s| !s.trim().is_empty()) {
        let ws_payload = post_twitch_chat_via_irc_channel(&state, channel, &message).await?;
        return Ok(Json(json!({ "status": "ok", "message": ws_payload })));
    }

    let user_id = resolve_default_user_id(&state, &body).await;
    let username = body
        .username
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "".to_string());
    let mut username = if username.is_empty() {
        resolve_default_username(&state, &user_id).await
    } else {
        username
    };
    let mut display_name = if let Ok(Some(profile)) = state.db().get_chat_user_profile(&user_id) {
        profile.display_name.trim().to_string()
    } else {
        String::new()
    };
    if display_name.is_empty() {
        display_name = username.clone();
    }

    let now = chrono::Utc::now();
    let created_at = now.timestamp();
    let message_id = format!("local-{}", now.timestamp_micros());

    let mut avatar_url = resolve_avatar_url(&state, &body, &user_id).await;
    if (username == user_id || username.eq_ignore_ascii_case("webui"))
        || display_name.trim().is_empty()
        || avatar_url.is_empty()
    {
        if let Some(user) = fetch_twitch_user_profile(&state, &user_id).await {
            if username == user_id || username.eq_ignore_ascii_case("webui") {
                username = if !user.login.trim().is_empty() {
                    user.login
                } else {
                    user_id.clone()
                };
            }
            display_name = if !user.display_name.trim().is_empty() {
                user.display_name
            } else {
                username.clone()
            };
            if avatar_url.is_empty() {
                avatar_url = user.profile_image_url;
            }
        }
    }
    if display_name.trim().is_empty() {
        display_name = username.clone();
    }

    let fragments = json!([{ "type": "text", "text": message }]);
    let msg = overlay_db::chat::ChatMessage {
        id: 0,
        message_id: message_id.clone(),
        user_id: user_id.clone(),
        username: username.clone(),
        display_name: display_name.clone(),
        message: message.clone(),
        badge_keys: Vec::new(),
        fragments_json: fragments.to_string(),
        avatar_url: String::new(),
        translation_text: String::new(),
        translation_status: String::new(),
        translation_lang: String::new(),
        created_at,
    };

    state
        .db()
        .upsert_chat_user_profile(&user_id, &username, &display_name, &avatar_url, created_at)
        .map_err(|e| err_json(500, &e.to_string()))?;

    state
        .db()
        .add_chat_message(&msg)
        .map_err(|e| err_json(500, &e.to_string()))?;

    let ws_payload = json!({
        "username": username,
        "displayName": display_name.clone(),
        "userId": user_id,
        "messageId": message_id,
        "message": message,
        "badge_keys": [],
        "fragments": [{
            "type": "text",
            "text": msg.message,
        }],
        "avatarUrl": avatar_url,
        "translation": "",
        "translationStatus": "",
        "translationLang": "",
        "timestamp": now.to_rfc3339(),
    });
    let broadcast = json!({ "type": "chat-message", "data": ws_payload.clone() });
    let _ = state.ws_sender().send(broadcast.to_string());

    let notif = types::ChatNotification {
        username: display_name,
        message: message.clone(),
        fragments: vec![types::FragmentInfo::Text(message.clone())],
        avatar_url: if avatar_url.is_empty() {
            None
        } else {
            Some(avatar_url.clone())
        },
        color: None,
        display_mode: types::DisplayMode::Queue,
        notification_type: types::NotificationType::Chat,
    };
    let _ = queue::enqueue(notif).await;

    Ok(Json(json!({ "status": "ok", "message": ws_payload })))
}

/// POST /api/chat/user-profile
pub async fn upsert_user_profile(
    State(state): State<SharedState>,
    Json(body): Json<ChatUserProfileBody>,
) -> ApiResult {
    let user_id = body.user_id.trim();
    if user_id.is_empty() {
        return Err(err_json(400, "user_id is required"));
    }

    let (username, display_name, avatar_url) =
        resolve_chat_user_profile(&state, user_id, body.username.as_deref(), false).await?;
    Ok(Json(json!({
        "user_id": user_id,
        "username": username,
        "display_name": display_name,
        "avatar_url": avatar_url,
    })))
}

