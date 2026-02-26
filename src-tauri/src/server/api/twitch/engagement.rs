/// POST /api/twitch/raid/start
pub async fn start_raid(
    State(state): State<SharedState>,
    Json(body): Json<StartRaidBody>,
) -> ApiResult {
    let mut token = get_valid_token(&state).await?;
    let config = state.config().await;
    let from_broadcaster_id = config.twitch_user_id.clone();
    if from_broadcaster_id.is_empty() {
        return Err(err_json(401, "TWITCH_USER_ID is not configured"));
    }

    let client = TwitchApiClient::new(config.client_id.clone());
    let to_broadcaster_id = if let Some(id) = body
        .to_broadcaster_id
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
    {
        id
    } else if let Some(login) = body
        .to_channel_login
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
    {
        match client.get_user_by_login(&token, &login).await {
            Ok(user) => user.id,
            Err(err) if is_unauthorized_error(&err) => {
                tracing::warn!(
                    "start_raid(get_user_by_login) got 401, refreshing token and retrying"
                );
                let refreshed = force_refresh_token(&state, &token).await?;
                token = refreshed.clone();
                client
                    .get_user_by_login(&token, &login)
                    .await
                    .map_err(map_twitch_error)?
                    .id
            }
            Err(err) => return Err(map_twitch_error(err)),
        }
    } else {
        return Err(err_json(400, "target channel is required"));
    };

    if to_broadcaster_id == from_broadcaster_id {
        return Err(err_json(400, "cannot raid your own channel"));
    }

    let raid_info: Option<RaidInfo> = match client
        .start_raid(&token, &from_broadcaster_id, &to_broadcaster_id)
        .await
    {
        Ok(info) => info,
        Err(err) if is_unauthorized_error(&err) => {
            tracing::warn!("start_raid got 401, refreshing token and retrying");
            let refreshed = force_refresh_token(&state, &token).await?;
            token = refreshed.clone();
            client
                .start_raid(&token, &from_broadcaster_id, &to_broadcaster_id)
                .await
                .map_err(map_twitch_error)?
        }
        Err(err) => return Err(map_twitch_error(err)),
    };

    Ok(Json(json!({
        "success": true,
        "from_broadcaster_id": from_broadcaster_id,
        "to_broadcaster_id": to_broadcaster_id,
        "data": raid_info,
    })))
}

/// POST /api/twitch/shoutout/start
pub async fn start_shoutout(
    State(state): State<SharedState>,
    Json(body): Json<StartShoutoutBody>,
) -> ApiResult {
    let mut token = get_valid_token(&state).await?;
    let config = state.config().await;
    let from_broadcaster_id = config.twitch_user_id.clone();
    if from_broadcaster_id.is_empty() {
        return Err(err_json(401, "TWITCH_USER_ID is not configured"));
    }
    let moderator_id = from_broadcaster_id.clone();

    let client = TwitchApiClient::new(config.client_id.clone());
    let to_broadcaster_id = if let Some(id) = body
        .to_broadcaster_id
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
    {
        id
    } else if let Some(login) = body
        .to_channel_login
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
    {
        match client.get_user_by_login(&token, &login).await {
            Ok(user) => user.id,
            Err(err) if is_unauthorized_error(&err) => {
                tracing::warn!(
                    "start_shoutout(get_user_by_login) got 401, refreshing token and retrying"
                );
                let refreshed = force_refresh_token(&state, &token).await?;
                token = refreshed.clone();
                client
                    .get_user_by_login(&token, &login)
                    .await
                    .map_err(map_twitch_error)?
                    .id
            }
            Err(err) => return Err(map_twitch_error(err)),
        }
    } else {
        return Err(err_json(400, "target channel is required"));
    };

    if to_broadcaster_id == from_broadcaster_id {
        return Err(err_json(400, "cannot shoutout your own channel"));
    }

    match client
        .start_shoutout(
            &token,
            &from_broadcaster_id,
            &to_broadcaster_id,
            &moderator_id,
        )
        .await
    {
        Ok(()) => {}
        Err(err) if is_unauthorized_error(&err) => {
            tracing::warn!("start_shoutout got 401, refreshing token and retrying");
            let refreshed = force_refresh_token(&state, &token).await?;
            token = refreshed.clone();
            client
                .start_shoutout(
                    &token,
                    &from_broadcaster_id,
                    &to_broadcaster_id,
                    &moderator_id,
                )
                .await
                .map_err(map_twitch_error)?;
        }
        Err(err) => return Err(map_twitch_error(err)),
    };

    Ok(Json(json!({
        "success": true,
        "from_broadcaster_id": from_broadcaster_id,
        "to_broadcaster_id": to_broadcaster_id,
    })))
}

