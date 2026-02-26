pub async fn stream_status(State(state): State<SharedState>) -> ApiResult {
    let token = match get_valid_token(&state).await {
        Ok(token) => token,
        Err(_) => return Ok(Json(offline_stream_status_payload())),
    };
    let (client_id, twitch_user_id) = {
        let config = state.config().await;
        (config.client_id.clone(), config.twitch_user_id.clone())
    };
    if twitch_user_id.is_empty() {
        return Ok(Json(offline_stream_status_payload()));
    }
    let client = TwitchApiClient::new(client_id);
    let status = match client.get_stream_info(&token, &twitch_user_id).await {
        Ok(status) => status,
        Err(err) if is_unauthorized_error(&err) => {
            tracing::warn!("stream_status got 401, refreshing token and retrying");
            let refreshed = force_refresh_token(&state, &token).await?;
            client
                .get_stream_info(&refreshed, &twitch_user_id)
                .await
                .map_err(map_twitch_error)?
        }
        Err(err) => return Err(map_twitch_error(err)),
    };
    state.set_stream_live(status.is_live).await;
    Ok(Json(stream_status_payload(&status)))
}

/// GET /api/twitch/stream-status-by-login?login=...
pub async fn stream_status_by_login(
    State(state): State<SharedState>,
    Query(q): Query<StreamStatusByLoginQuery>,
) -> ApiResult {
    let login = q
        .login
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_ascii_lowercase())
        .ok_or_else(|| err_json(400, "login is required"))?;

    let mut token = match get_valid_token(&state).await {
        Ok(token) => token,
        Err(_) => return Ok(Json(offline_stream_status_payload())),
    };
    let client_id = state.config().await.client_id.clone();
    let client = TwitchApiClient::new(client_id);

    let user = match client.get_user_by_login(&token, &login).await {
        Ok(user) => user,
        Err(err) if is_unauthorized_error(&err) => {
            tracing::warn!(
                "stream_status_by_login(get_user_by_login) got 401, refreshing token and retrying"
            );
            let refreshed = force_refresh_token(&state, &token).await?;
            token = refreshed.clone();
            client
                .get_user_by_login(&token, &login)
                .await
                .map_err(map_twitch_error)?
        }
        Err(err) if is_not_found_error(&err) => return Ok(Json(offline_stream_status_payload())),
        Err(err) => return Err(map_twitch_error(err)),
    };

    let status = match client.get_stream_info(&token, &user.id).await {
        Ok(status) => status,
        Err(err) if is_unauthorized_error(&err) => {
            tracing::warn!(
                "stream_status_by_login(get_stream_info) got 401, refreshing token and retrying"
            );
            let refreshed = force_refresh_token(&state, &token).await?;
            token = refreshed.clone();
            client
                .get_stream_info(&token, &user.id)
                .await
                .map_err(map_twitch_error)?
        }
        Err(err) => return Err(map_twitch_error(err)),
    };
    Ok(Json(stream_status_payload(&status)))
}

