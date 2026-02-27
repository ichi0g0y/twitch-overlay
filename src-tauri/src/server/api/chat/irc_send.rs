async fn post_twitch_chat_via_irc_channel(
    state: &SharedState,
    raw_channel_login: &str,
    raw_message: &str,
) -> Result<Value, (axum::http::StatusCode, Json<Value>)> {
    let channel_login = normalize_channel_login(raw_channel_login)
        .ok_or_else(|| err_json(400, "invalid channel"))?;
    let message = raw_message.replace(['\r', '\n'], " ").trim().to_string();
    if message.is_empty() {
        return Err(err_json(400, "message is required"));
    }

    let identity = resolve_twitch_irc_identity(state).await?;

    let (mut ws, _) = connect_async(TWITCH_IRC_WS_ENDPOINT)
        .await
        .map_err(|e| err_json(502, &format!("Failed to connect Twitch IRC: {e}")))?;

    ws.send(WsMessage::Text(
        format!("PASS oauth:{}", identity.token.access_token).into(),
    ))
    .await
    .map_err(|e| err_json(502, &format!("Failed to authenticate Twitch IRC: {e}")))?;
    ws.send(WsMessage::Text(format!("NICK {}", identity.nick).into()))
        .await
        .map_err(|e| err_json(502, &format!("Failed to set Twitch IRC nickname: {e}")))?;
    ws.send(WsMessage::Text(
        "CAP REQ :twitch.tv/tags twitch.tv/commands"
            .to_string()
            .into(),
    ))
    .await
    .map_err(|e| {
        err_json(
            502,
            &format!("Failed to request Twitch IRC capabilities: {e}"),
        )
    })?;
    ws.send(WsMessage::Text(format!("JOIN #{channel_login}").into()))
        .await
        .map_err(|e| err_json(502, &format!("Failed to join Twitch IRC channel: {e}")))?;

    let privmsg = format!("PRIVMSG #{channel_login} :{message}");
    let deadline = Instant::now() + Duration::from_secs(TWITCH_IRC_SEND_TIMEOUT_SECS);
    let mut join_confirmed = false;
    let mut message_sent = false;

    while Instant::now() < deadline && !message_sent {
        let remaining = deadline.saturating_duration_since(Instant::now());
        let next_frame = match timeout(remaining, ws.next()).await {
            Ok(frame) => frame,
            Err(_) => break,
        };

        let Some(frame) = next_frame else {
            break;
        };

        match frame.map_err(|e| err_json(502, &format!("Twitch IRC receive error: {e}")))? {
            WsMessage::Ping(payload) => {
                ws.send(WsMessage::Pong(payload))
                    .await
                    .map_err(|e| err_json(502, &format!("Failed to send Twitch IRC pong: {e}")))?;
            }
            WsMessage::Text(text) => {
                for line in text.lines().filter(|line| !line.is_empty()) {
                    if let Some(payload) = line.strip_prefix("PING ") {
                        ws.send(WsMessage::Text(format!("PONG {payload}").into()))
                            .await
                            .map_err(|e| {
                                err_json(502, &format!("Failed to reply Twitch IRC ping: {e}"))
                            })?;
                        continue;
                    }

                    if line.contains("Login authentication failed") {
                        return Err(err_json(
                            401,
                            "Twitch IRC authentication failed. Twitch再認証を実行してください。",
                        ));
                    }

                    if !join_confirmed
                        && (line.contains(&format!(" JOIN #{channel_login}"))
                            || line.contains(&format!(" 366 {} #{channel_login} :", identity.nick)))
                    {
                        join_confirmed = true;
                    }
                }

                if join_confirmed {
                    ws.send(WsMessage::Text(privmsg.clone().into()))
                        .await
                        .map_err(|e| {
                            err_json(502, &format!("Failed to send Twitch IRC message: {e}"))
                        })?;
                    message_sent = true;
                }
            }
            _ => {}
        }
    }

    if !message_sent {
        ws.send(WsMessage::Text(privmsg.into()))
            .await
            .map_err(|e| err_json(502, &format!("Failed to send Twitch IRC message: {e}")))?;
    }

    let _ = ws.close(None).await;

    let now = chrono::Utc::now();
    let sender_login = identity.sender_user.login.trim().to_string();
    let message_id = format!("irc-local-{}", now.timestamp_micros());
    save_irc_chat_message(
        state,
        &channel_login,
        &message_id,
        &identity.sender_user.id,
        Some(&sender_login),
        Some(&identity.sender_user.display_name),
        Some(&identity.sender_user.profile_image_url),
        None,
        &message,
        Vec::new(),
        json!([{ "type": "text", "text": message }]),
        now.timestamp(),
    )
    .await
}
