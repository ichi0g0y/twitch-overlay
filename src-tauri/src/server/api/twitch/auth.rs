pub async fn verify_twitch(State(state): State<SharedState>) -> ApiResult {
    let config = state.config().await;
    let twitch_user_id = config.twitch_user_id.clone();
    let configured = !config.client_id.is_empty()
        && !config.client_secret.is_empty()
        && !twitch_user_id.is_empty();

    if !configured {
        return Ok(Json(verify_twitch_error_payload(
            &twitch_user_id,
            false,
            "Twitch credentials not configured",
        )));
    }

    let token = match get_valid_token(&state).await {
        Ok(token) => token,
        Err((StatusCode::UNAUTHORIZED, body)) => {
            let message = body.0["error"]
                .as_str()
                .unwrap_or("Authentication required");
            return Ok(Json(verify_twitch_error_payload(
                &twitch_user_id,
                false,
                message,
            )));
        }
        Err(err) => return Err(err),
    };

    let client = TwitchApiClient::new(config.client_id.clone());
    let user = match client.get_user(&token, &twitch_user_id).await {
        Ok(user) => user,
        Err(err) if is_unauthorized_error(&err) => {
            tracing::warn!("verify_twitch got 401, refreshing token and retrying");
            let refreshed = match force_refresh_token(&state, &token).await {
                Ok(token) => token,
                Err((StatusCode::UNAUTHORIZED, body)) => {
                    let message = body.0["error"]
                        .as_str()
                        .unwrap_or("Token refresh failed, please re-authenticate");
                    return Ok(Json(verify_twitch_error_payload(
                        &twitch_user_id,
                        false,
                        message,
                    )));
                }
                Err(err) => return Err(err),
            };

            match client.get_user(&refreshed, &twitch_user_id).await {
                Ok(user) => user,
                Err(err) => {
                    let (_, body) = map_twitch_error(err);
                    let message = body.0["error"]
                        .as_str()
                        .unwrap_or("Failed to fetch Twitch user");
                    return Ok(Json(verify_twitch_error_payload(
                        &twitch_user_id,
                        true,
                        message,
                    )));
                }
            }
        }
        Err(err) => {
            let (_, body) = map_twitch_error(err);
            let message = body.0["error"]
                .as_str()
                .unwrap_or("Failed to fetch Twitch user");
            return Ok(Json(verify_twitch_error_payload(
                &twitch_user_id,
                true,
                message,
            )));
        }
    };

    Ok(Json(verify_twitch_success_payload(&user)))
}

/// GET /api/settings/auth/status
pub async fn auth_status(State(state): State<SharedState>) -> ApiResult {
    let token = state
        .db()
        .get_latest_token()
        .map_err(|e| err_json(500, &e.to_string()))?;
    let auth_url = match create_auth(&state).await {
        Ok(auth) => auth.get_auth_url().unwrap_or_default(),
        Err(_) => String::new(),
    };
    Ok(Json(json!({
        "authenticated": token.is_some(),
        "authUrl": auth_url,
        "expiresAt": token.as_ref().map(|t| t.expires_at),
    })))
}

// ---------------------------------------------------------------------------
// OAuth flow
// ---------------------------------------------------------------------------

/// GET /auth – Redirect to Twitch OAuth
pub async fn auth_redirect(State(state): State<SharedState>) -> impl IntoResponse {
    let auth = match create_auth(&state).await {
        Ok(a) => a,
        Err(e) => return Err(e),
    };
    let oauth_state = Uuid::new_v4().to_string();
    state.set_oauth_state(oauth_state.clone()).await;
    let url = auth
        .get_auth_url_with_state(Some(&oauth_state))
        .map_err(|e| err_json(500, &e.to_string()))?;
    Ok(Redirect::temporary(&url))
}

#[derive(Debug, Deserialize)]
pub struct CallbackQuery {
    pub code: Option<String>,
    pub state: Option<String>,
    pub error: Option<String>,
    pub error_description: Option<String>,
}

/// GET /callback – Exchange OAuth code for tokens.
pub async fn callback(
    State(state): State<SharedState>,
    Query(q): Query<CallbackQuery>,
) -> Result<Html<String>, (axum::http::StatusCode, Json<Value>)> {
    if let Some(error) = q.error {
        let desc = q.error_description.unwrap_or_default();
        return Ok(Html(format!(
            r#"<!DOCTYPE html><html><body><h2>認証エラー</h2><p>{error}: {desc}</p>
            <script>setTimeout(()=>window.close(),5000)</script></body></html>"#
        )));
    }
    let code = q
        .code
        .filter(|c| !c.is_empty())
        .ok_or_else(|| err_json(400, "OAuth code missing"))?;
    let callback_state = q
        .state
        .filter(|s| !s.is_empty())
        .ok_or_else(|| err_json(400, "OAuth state missing"))?;
    let expected_state = state
        .take_oauth_state()
        .await
        .ok_or_else(|| err_json(400, "OAuth state not initialized"))?;
    if callback_state != expected_state {
        return Err(err_json(400, "OAuth state mismatch"));
    }
    let auth = create_auth(&state).await?;
    let token = auth.exchange_code(&code).await.map_err(map_twitch_error)?;
    state
        .db()
        .save_token(&to_db_token(&token))
        .map_err(|e| err_json(500, &e.to_string()))?;
    tracing::info!(expires_at = token.expires_at, "OAuth token saved");
    let _ = state
        .ws_sender()
        .send(json!({"type":"auth_success","data":{"authenticated":true}}).to_string());
    state.emit_event(
        events::AUTH_SUCCESS,
        events::AuthSuccessPayload {
            authenticated: true,
        },
    );

    Ok(Html(
        r#"<!DOCTYPE html><html><body>
<h2>認証成功！</h2><p>このウィンドウは自動的に閉じます。</p>
<script>setTimeout(()=>window.close(),2000)</script></body></html>"#
            .to_string(),
    ))
}

// ---------------------------------------------------------------------------
// Token refresh
// ---------------------------------------------------------------------------

/// GET|POST /api/twitch/refresh-token
pub async fn refresh_token(State(state): State<SharedState>) -> ApiResult {
    let current = get_valid_token(&state).await?;
    let new_token = force_refresh_token(&state, &current).await?;
    Ok(Json(
        json!({ "success": true, "expires_at": new_token.expires_at }),
    ))
}

// ---------------------------------------------------------------------------
// Stream status
// ---------------------------------------------------------------------------

