pub async fn get_irc_credentials(State(state): State<SharedState>) -> ApiResult {
    match resolve_twitch_irc_identity(&state).await {
        Ok(identity) => Ok(Json(json!({
            "authenticated": true,
            "nick": identity.nick,
            "pass": format!("oauth:{}", identity.token.access_token),
            "user_id": identity.sender_user.id,
            "login": identity.sender_user.login,
            "display_name": if identity.sender_user.display_name.trim().is_empty() {
                identity.sender_user.login
            } else {
                identity.sender_user.display_name
            },
        }))),
        Err((_, payload)) => {
            let reason = payload
                .0
                .get("error")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            Ok(Json(json!({
                "authenticated": false,
                "nick": "",
                "pass": "",
                "reason": reason,
            })))
        }
    }
}

/// GET /api/chat/messages
pub async fn get_messages(
    State(state): State<SharedState>,
    Query(q): Query<ChatQuery>,
) -> ApiResult {
    let since = q
        .since
        .or_else(|| {
            q.days
                .map(|days| chrono::Utc::now().timestamp() - (days * 24 * 3600))
        })
        .unwrap_or(0);
    let messages = state
        .db()
        .get_chat_messages_since(since, q.limit)
        .map_err(|e| err_json(500, &e.to_string()))?;
    Ok(Json(
        json!({ "messages": messages, "count": messages.len() }),
    ))
}

/// GET /api/chat/history (legacy compatibility endpoint)
pub async fn get_history(
    State(state): State<SharedState>,
    Query(q): Query<ChatQuery>,
) -> ApiResult {
    let since = q
        .since
        .or_else(|| {
            q.days
                .map(|days| chrono::Utc::now().timestamp() - (days * 24 * 3600))
        })
        .unwrap_or(0);
    let messages = state
        .db()
        .get_chat_messages_since(since, q.limit)
        .map_err(|e| err_json(500, &e.to_string()))?;
    Ok(Json(json!({ "messages": messages })))
}

/// GET /api/chat/irc/history
pub async fn get_irc_history(
    State(state): State<SharedState>,
    Query(q): Query<ChatQuery>,
) -> ApiResult {
    let channel = q.channel.unwrap_or_default();
    let channel_login =
        normalize_channel_login(&channel).ok_or_else(|| err_json(400, "channel is required"))?;
    let since = q
        .since
        .or_else(|| {
            q.days
                .map(|days| chrono::Utc::now().timestamp() - (days * 24 * 3600))
        })
        .unwrap_or(0);
    let messages = state
        .db()
        .get_irc_chat_messages_since(&channel_login, since, q.limit)
        .map_err(|e| err_json(500, &e.to_string()))?;
    Ok(Json(
        json!({ "channel": channel_login, "messages": messages }),
    ))
}

/// GET /api/chat/irc/channel-profiles?channels=foo,bar
pub async fn get_irc_channel_profiles(
    State(state): State<SharedState>,
    Query(q): Query<IrcChannelProfilesQuery>,
) -> ApiResult {
    let channels = parse_channel_logins_csv(q.channels.as_deref());
    if channels.is_empty() {
        return Ok(Json(json!({ "profiles": [] })));
    }

    let profiles = state
        .db()
        .get_irc_channel_profiles(&channels)
        .map_err(|e| err_json(500, &e.to_string()))?;

    Ok(Json(json!({ "profiles": profiles })))
}

/// POST /api/chat/irc/channel-profile
pub async fn post_irc_channel_profile(
    State(state): State<SharedState>,
    Json(body): Json<IrcChannelProfileBody>,
) -> ApiResult {
    let channel_login =
        normalize_channel_login(&body.channel).ok_or_else(|| err_json(400, "invalid channel"))?;
    let display_name = body.display_name.trim().to_string();
    if display_name.is_empty() {
        return Err(err_json(400, "display_name is required"));
    }

    let updated_at = chrono::Utc::now().timestamp();
    state
        .db()
        .upsert_irc_channel_profile(&channel_login, &display_name, updated_at)
        .map_err(|e| err_json(500, &e.to_string()))?;

    Ok(Json(json!({
        "status": "ok",
        "profile": {
            "channel_login": channel_login,
            "display_name": display_name,
            "updated_at": updated_at,
        }
    })))
}

/// POST /api/chat/irc/message
pub async fn post_irc_message(
    State(state): State<SharedState>,
    Json(body): Json<IrcChatMessageBody>,
) -> ApiResult {
    let channel_login =
        normalize_channel_login(&body.channel).ok_or_else(|| err_json(400, "invalid channel"))?;
    let message = body.message.trim().to_string();
    if message.is_empty() {
        return Err(err_json(400, "message is required"));
    }
    let user_id = body
        .user_id
        .as_deref()
        .map(str::trim)
        .unwrap_or_default()
        .to_string();
    let message_id = body
        .message_id
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| format!("irc-ingest-{}", chrono::Utc::now().timestamp_micros()));
    let fragments = body
        .fragments
        .clone()
        .unwrap_or_else(|| json!([{ "type": "text", "text": message }]));
    let badge_keys = body
        .badge_keys
        .clone()
        .unwrap_or_default()
        .into_iter()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();
    let created_at = parse_created_at_from_rfc3339(body.timestamp.as_deref());

    let ws_payload = save_irc_chat_message(
        &state,
        &channel_login,
        &message_id,
        &user_id,
        body.username.as_deref(),
        body.display_name.as_deref(),
        body.avatar_url.as_deref(),
        &message,
        badge_keys,
        fragments,
        created_at,
    )
    .await?;

    Ok(Json(json!({ "status": "ok", "message": ws_payload })))
}

