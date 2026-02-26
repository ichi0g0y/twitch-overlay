pub async fn cleanup_messages(
    State(state): State<SharedState>,
    Json(body): Json<Value>,
) -> ApiResult {
    let hours = body["hours"].as_i64().unwrap_or(24);
    let cutoff = chrono::Utc::now().timestamp() - (hours * 3600);
    state
        .db()
        .cleanup_chat_messages_before(cutoff)
        .map_err(|e| err_json(500, &e.to_string()))?;
    Ok(Json(
        json!({ "status": "ok", "message": format!("Cleaned up messages older than {hours}h") }),
    ))
}

/// GET /api/chat/avatar/:user_id
pub async fn get_avatar(
    State(state): State<SharedState>,
    axum::extract::Path(user_id): axum::extract::Path<String>,
) -> ApiResult {
    let mut url = state
        .db()
        .get_latest_chat_avatar(&user_id)
        .map_err(|e| err_json(500, &e.to_string()))?;

    if url.as_deref().unwrap_or_default().trim().is_empty() && !user_id.trim().is_empty() {
        let (_, _, avatar_url, _) = resolve_chat_user_profile(&state, &user_id, None, false).await?;
        if !avatar_url.trim().is_empty() {
            url = Some(avatar_url);
        }
    }

    Ok(Json(json!({ "avatar_url": url })))
}
