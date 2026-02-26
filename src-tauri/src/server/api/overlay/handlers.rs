/// GET /api/settings/overlay
pub async fn get_overlay_settings(
    State(state): State<SharedState>,
) -> Result<Json<Value>, (axum::http::StatusCode, Json<Value>)> {
    let settings = build_overlay_json(&state)?;
    Ok(Json(settings))
}

/// POST /api/settings/overlay – partial update
pub async fn update_overlay_settings(
    State(state): State<SharedState>,
    Json(body): Json<HashMap<String, Value>>,
) -> Result<Json<Value>, (axum::http::StatusCode, Json<Value>)> {
    let sm = SettingsManager::new(state.db().clone());

    // Convert JSON key format (snake_case) to DB key format (SCREAMING_SNAKE_CASE)
    for (key, value) in &body {
        let db_key = normalize_overlay_db_key(key);
        let str_val = match value {
            Value::String(s) => s.clone(),
            Value::Bool(b) => b.to_string(),
            Value::Number(n) => n.to_string(),
            _ => value.to_string(),
        };
        if let Err(e) = sm.set_setting(&db_key, &str_val) {
            tracing::warn!("Failed to set overlay setting {db_key}: {e}");
        }
    }

    // Reload runtime config
    state
        .reload_config()
        .await
        .map_err(|e| err_json(500, &format!("Failed to reload config: {e}")))?;

    // Broadcast updated settings via WebSocket
    broadcast_overlay_settings(&state)?;

    Ok(Json(json!({ "status": "ok" })))
}

/// POST /api/overlay/refresh
pub async fn refresh_overlay(
    State(state): State<SharedState>,
) -> Result<Json<Value>, (axum::http::StatusCode, Json<Value>)> {
    broadcast_overlay_settings(&state)?;
    Ok(Json(json!({
        "success": true,
        "message": "Overlay settings refreshed"
    })))
}

