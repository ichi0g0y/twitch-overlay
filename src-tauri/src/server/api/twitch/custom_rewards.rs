// ---------------------------------------------------------------------------
// Custom rewards CRUD
// ---------------------------------------------------------------------------

/// GET /api/twitch/custom-rewards
pub async fn get_custom_rewards(State(state): State<SharedState>) -> ApiResult {
    let token = get_valid_token(&state).await?;
    let config = state.config().await;
    if config.twitch_user_id.is_empty() {
        return Err(err_json(401, "TWITCH_USER_ID is not configured"));
    }
    let client = TwitchApiClient::new(config.client_id.clone());
    let rewards = match client
        .get_custom_rewards(&token, &config.twitch_user_id)
        .await
    {
        Ok(rewards) => rewards,
        Err(err) if is_unauthorized_error(&err) => {
            tracing::warn!("get_custom_rewards got 401, refreshing token and retrying");
            let refreshed = force_refresh_token(&state, &token).await?;
            client
                .get_custom_rewards(&refreshed, &config.twitch_user_id)
                .await
                .map_err(map_twitch_error)?
        }
        Err(err) => return Err(map_twitch_error(err)),
    };
    Ok(Json(json!({ "data": rewards })))
}

/// POST /api/twitch/custom-rewards
pub async fn create_custom_reward(
    State(state): State<SharedState>,
    Json(body): Json<Value>,
) -> ApiResult {
    let token = get_valid_token(&state).await?;
    let config = state.config().await;
    if config.twitch_user_id.is_empty() {
        return Err(err_json(401, "TWITCH_USER_ID is not configured"));
    }
    let client = TwitchApiClient::new(config.client_id.clone());
    let req = CreateRewardRequest {
        title: body["title"].as_str().unwrap_or("").to_string(),
        cost: body["cost"].as_u64().unwrap_or(100),
        prompt: body["prompt"].as_str().map(String::from),
        is_enabled: body["is_enabled"].as_bool(),
        background_color: body["background_color"].as_str().map(String::from),
        is_user_input_required: body["is_user_input_required"].as_bool(),
        should_redemptions_skip_request_queue: body["should_redemptions_skip_request_queue"]
            .as_bool(),
    };
    let reward = match client
        .create_custom_reward(&token, &config.twitch_user_id, &req)
        .await
    {
        Ok(reward) => reward,
        Err(err) if is_unauthorized_error(&err) => {
            tracing::warn!("create_custom_reward got 401, refreshing token and retrying");
            let refreshed = force_refresh_token(&state, &token).await?;
            client
                .create_custom_reward(&refreshed, &config.twitch_user_id, &req)
                .await
                .map_err(map_twitch_error)?
        }
        Err(err) => return Err(map_twitch_error(err)),
    };
    let _ = state
        .db()
        .record_app_created_reward(&reward.id, &reward.title);
    Ok(Json(json!({ "data": reward })))
}

/// POST /api/twitch/custom-rewards/create (legacy alias)
pub async fn create_custom_reward_legacy(
    state: State<SharedState>,
    body: Json<Value>,
) -> ApiResult {
    create_custom_reward(state, body).await
}

/// PUT /api/twitch/custom-rewards/:id
pub async fn update_custom_reward(
    State(state): State<SharedState>,
    Path(id): Path<String>,
    Json(body): Json<Value>,
) -> ApiResult {
    let token = get_valid_token(&state).await?;
    let config = state.config().await;
    if config.twitch_user_id.is_empty() {
        return Err(err_json(401, "TWITCH_USER_ID is not configured"));
    }
    let client = TwitchApiClient::new(config.client_id.clone());
    let req = UpdateRewardRequest {
        title: body["title"].as_str().map(String::from),
        cost: body["cost"].as_u64(),
        prompt: body["prompt"].as_str().map(String::from),
        is_enabled: body["is_enabled"].as_bool(),
        is_paused: body["is_paused"].as_bool(),
        background_color: body["background_color"].as_str().map(String::from),
    };
    let reward = match client
        .update_custom_reward(&token, &config.twitch_user_id, &id, &req)
        .await
    {
        Ok(reward) => reward,
        Err(err) if is_unauthorized_error(&err) => {
            tracing::warn!("update_custom_reward got 401, refreshing token and retrying");
            let refreshed = force_refresh_token(&state, &token).await?;
            client
                .update_custom_reward(&refreshed, &config.twitch_user_id, &id, &req)
                .await
                .map_err(map_twitch_error)?
        }
        Err(err) => return Err(map_twitch_error(err)),
    };
    Ok(Json(json!({ "data": reward })))
}

/// PATCH /api/twitch/custom-rewards/:id/toggle
pub async fn toggle_custom_reward(
    State(state): State<SharedState>,
    Path(id): Path<String>,
    body: Option<Json<Value>>,
) -> ApiResult {
    let mut token = get_valid_token(&state).await?;
    let config = state.config().await;
    if config.twitch_user_id.is_empty() {
        return Err(err_json(401, "TWITCH_USER_ID is not configured"));
    }
    let client = TwitchApiClient::new(config.client_id.clone());

    let target_enabled = body
        .as_ref()
        .and_then(|b| b.get("is_enabled"))
        .and_then(|v| v.as_bool());

    let is_enabled = if let Some(v) = target_enabled {
        v
    } else {
        let rewards = match client
            .get_custom_rewards(&token, &config.twitch_user_id)
            .await
        {
            Ok(rewards) => rewards,
            Err(err) if is_unauthorized_error(&err) => {
                tracing::warn!("toggle_custom_reward(get) got 401, refreshing token and retrying");
                let refreshed = force_refresh_token(&state, &token).await?;
                token = refreshed.clone();
                client
                    .get_custom_rewards(&token, &config.twitch_user_id)
                    .await
                    .map_err(map_twitch_error)?
            }
            Err(err) => return Err(map_twitch_error(err)),
        };
        let current = rewards
            .iter()
            .find(|r| r.id == id)
            .ok_or_else(|| err_json(404, "Reward not found"))?;
        !current.is_enabled
    };

    let reward = match client
        .update_reward_enabled(&token, &config.twitch_user_id, &id, is_enabled)
        .await
    {
        Ok(reward) => reward,
        Err(err) if is_unauthorized_error(&err) => {
            tracing::warn!("toggle_custom_reward(update) got 401, refreshing token and retrying");
            let refreshed = force_refresh_token(&state, &token).await?;
            client
                .update_reward_enabled(&refreshed, &config.twitch_user_id, &id, is_enabled)
                .await
                .map_err(map_twitch_error)?
        }
        Err(err) => return Err(map_twitch_error(err)),
    };
    Ok(Json(json!({ "data": reward })))
}

/// DELETE /api/twitch/custom-rewards/:id
pub async fn delete_custom_reward(
    State(state): State<SharedState>,
    Path(id): Path<String>,
) -> ApiResult {
    let token = get_valid_token(&state).await?;
    let config = state.config().await;
    if config.twitch_user_id.is_empty() {
        return Err(err_json(401, "TWITCH_USER_ID is not configured"));
    }
    let client = TwitchApiClient::new(config.client_id.clone());
    match client
        .delete_custom_reward(&token, &config.twitch_user_id, &id)
        .await
    {
        Ok(_) => {}
        Err(err) if is_unauthorized_error(&err) => {
            tracing::warn!("delete_custom_reward got 401, refreshing token and retrying");
            let refreshed = force_refresh_token(&state, &token).await?;
            client
                .delete_custom_reward(&refreshed, &config.twitch_user_id, &id)
                .await
                .map_err(map_twitch_error)?;
        }
        Err(err) => return Err(map_twitch_error(err)),
    }
    Ok(Json(json!({ "success": true })))
}

