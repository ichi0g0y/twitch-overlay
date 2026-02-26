pub async fn followed_channels(
    State(state): State<SharedState>,
    Query(q): Query<FollowedChannelsQuery>,
) -> ApiResult {
    let mut token = get_valid_token(&state).await?;
    let config = state.config().await;
    if config.twitch_user_id.is_empty() {
        return Err(err_json(401, "TWITCH_USER_ID is not configured"));
    }

    let limit = q.limit.unwrap_or(50).clamp(1, 100) as usize;
    let client = TwitchApiClient::new(config.client_id.clone());
    let mut followed: Vec<FollowedChannel> = Vec::new();
    let mut after: Option<String> = None;
    loop {
        let (mut page_rows, next_cursor): (Vec<FollowedChannel>, Option<String>) = match client
            .get_followed_channels_page(
                &token,
                &config.twitch_user_id,
                FOLLOWED_CHANNELS_PAGE_SIZE,
                after.as_deref(),
            )
            .await
        {
            Ok(rows) => rows,
            Err(err) if is_unauthorized_error(&err) => {
                tracing::warn!("followed_channels got 401, refreshing token and retrying");
                let refreshed = force_refresh_token(&state, &token).await?;
                token = refreshed.clone();
                client
                    .get_followed_channels_page(
                        &token,
                        &config.twitch_user_id,
                        FOLLOWED_CHANNELS_PAGE_SIZE,
                        after.as_deref(),
                    )
                    .await
                    .map_err(map_twitch_error)?
            }
            Err(err) => return Err(map_twitch_error(err)),
        };
        followed.append(&mut page_rows);
        if followed.len() >= FOLLOWED_CHANNELS_SCAN_LIMIT {
            break;
        }
        let Some(cursor) = next_cursor.filter(|cursor| !cursor.is_empty()) else {
            break;
        };
        after = Some(cursor);
    }

    let user_ids: Vec<String> = followed
        .iter()
        .map(|row| row.broadcaster_id.clone())
        .collect();
    let users: Vec<TwitchUser> = if user_ids.is_empty() {
        Vec::new()
    } else {
        let mut all_users: Vec<TwitchUser> = Vec::new();
        for chunk in user_ids.chunks(FOLLOWED_CHANNELS_LOOKUP_CHUNK_SIZE) {
            let mut rows = match client.get_users_by_ids(&token, chunk).await {
                Ok(rows) => rows,
                Err(err) if is_unauthorized_error(&err) => {
                    tracing::warn!(
                        "followed_channels(users) got 401, refreshing token and retrying"
                    );
                    let refreshed = force_refresh_token(&state, &token).await?;
                    token = refreshed.clone();
                    client
                        .get_users_by_ids(&token, chunk)
                        .await
                        .map_err(map_twitch_error)?
                }
                Err(err) => return Err(map_twitch_error(err)),
            };
            all_users.append(&mut rows);
        }
        all_users
    };
    let streams: Vec<StreamInfo> = if user_ids.is_empty() {
        Vec::new()
    } else {
        let mut all_streams: Vec<StreamInfo> = Vec::new();
        for chunk in user_ids.chunks(FOLLOWED_CHANNELS_LOOKUP_CHUNK_SIZE) {
            let mut rows = match client.get_streams_by_user_ids(&token, chunk).await {
                Ok(rows) => rows,
                Err(err) if is_unauthorized_error(&err) => {
                    tracing::warn!(
                        "followed_channels(streams) got 401, refreshing token and retrying"
                    );
                    let refreshed = force_refresh_token(&state, &token).await?;
                    token = refreshed.clone();
                    client
                        .get_streams_by_user_ids(&token, chunk)
                        .await
                        .map_err(map_twitch_error)?
                }
                Err(err) => return Err(map_twitch_error(err)),
            };
            all_streams.append(&mut rows);
        }
        all_streams
    };

    let user_map: HashMap<String, TwitchUser> =
        users.into_iter().map(|u| (u.id.clone(), u)).collect();
    let stream_map: HashMap<String, StreamInfo> = streams
        .into_iter()
        .map(|s| (s.user_id.clone(), s))
        .collect();

    let broadcast_map = update_broadcast_cache(
        &state, &followed, &stream_map, &user_ids, &client, &token,
    )
    .await;

    let mut rows: Vec<FollowedChannelStatus> = followed
        .into_iter()
        .map(|item| {
            let stream = stream_map.get(&item.broadcaster_id);
            let user = user_map.get(&item.broadcaster_id);
            FollowedChannelStatus {
                broadcaster_id: item.broadcaster_id.clone(),
                broadcaster_login: item.broadcaster_login,
                broadcaster_name: item.broadcaster_name,
                profile_image_url: user
                    .map(|u| u.profile_image_url.clone())
                    .unwrap_or_default(),
                followed_at: item.followed_at,
                is_live: stream.is_some(),
                viewer_count: stream.map(|s| s.viewer_count).unwrap_or(0),
                title: stream.map(|s| s.title.clone()),
                game_name: stream.map(|s| s.game_name.clone()),
                started_at: stream.and_then(|s| s.started_at.clone()),
                last_broadcast_at: broadcast_map.get(&item.broadcaster_id).cloned(),
            }
        })
        .collect();
    sort_followed_channel_status(&mut rows);
    if rows.len() > limit {
        rows.truncate(limit);
    }

    Ok(Json(json!({ "data": rows, "count": rows.len() })))
}

/// GET /api/twitch/chatters
pub async fn chatters(
    State(state): State<SharedState>,
    Query(q): Query<ChattersQuery>,
) -> ApiResult {
    let mut token = get_valid_token(&state).await?;
    let config = state.config().await;
    if config.twitch_user_id.is_empty() {
        return Err(err_json(401, "TWITCH_USER_ID is not configured"));
    }

    let client = TwitchApiClient::new(config.client_id.clone());
    let broadcaster_id = if let Some(channel_login) = q
        .channel_login
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_ascii_lowercase())
    {
        match client.get_user_by_login(&token, &channel_login).await {
            Ok(user) => user.id,
            Err(err) if is_unauthorized_error(&err) => {
                tracing::warn!(
                    "chatters(get_user_by_login) got 401, refreshing token and retrying"
                );
                let refreshed = force_refresh_token(&state, &token).await?;
                token = refreshed.clone();
                client
                    .get_user_by_login(&token, &channel_login)
                    .await
                    .map_err(map_twitch_error)?
                    .id
            }
            Err(err) => return Err(map_twitch_error(err)),
        }
    } else {
        config.twitch_user_id.clone()
    };

    let mut rows: Vec<Chatter> = Vec::new();
    let mut after: Option<String> = None;
    let mut total: Option<u64> = None;

    loop {
        let (mut page_rows, next_cursor, page_total): (Vec<Chatter>, Option<String>, u64) =
            match client
                .get_chatters_page(
                    &token,
                    &broadcaster_id,
                    &config.twitch_user_id,
                    CHATTERS_PAGE_SIZE,
                    after.as_deref(),
                )
                .await
            {
                Ok(rows) => rows,
                Err(err) if is_unauthorized_error(&err) => {
                    tracing::warn!("chatters got 401, refreshing token and retrying");
                    let refreshed = force_refresh_token(&state, &token).await?;
                    token = refreshed.clone();
                    client
                        .get_chatters_page(
                            &token,
                            &broadcaster_id,
                            &config.twitch_user_id,
                            CHATTERS_PAGE_SIZE,
                            after.as_deref(),
                        )
                        .await
                        .map_err(map_twitch_error)?
                }
                Err(err) => return Err(map_twitch_error(err)),
            };
        total = Some(total.unwrap_or(page_total));
        rows.append(&mut page_rows);
        if rows.len() >= CHATTERS_SCAN_LIMIT {
            break;
        }
        let Some(cursor) = next_cursor.filter(|cursor| !cursor.is_empty()) else {
            break;
        };
        after = Some(cursor);
    }

    if rows.len() > CHATTERS_SCAN_LIMIT {
        rows.truncate(CHATTERS_SCAN_LIMIT);
    }
    let count = rows.len();
    Ok(Json(json!({
        "data": rows,
        "count": count,
        "total": total.unwrap_or(count as u64),
        "broadcaster_id": broadcaster_id
    })))
}

