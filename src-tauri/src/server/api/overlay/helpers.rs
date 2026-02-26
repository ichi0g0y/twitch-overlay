/// Build the overlay settings JSON from DB.
fn build_overlay_json(state: &SharedState) -> Result<Value, (axum::http::StatusCode, Json<Value>)> {
    let sm = SettingsManager::new(state.db().clone());

    let mut map = serde_json::Map::new();
    for &key in OVERLAY_KEYS {
        let val = get_overlay_setting_value(state, &sm, key);
        // Use snake_case keys for JSON.
        let json_key = key.to_lowercase();
        let json_val = smart_json_value(&val);
        map.insert(json_key, json_val.clone());
        if let Some(legacy_json_key) = legacy_overlay_json_key(key) {
            map.insert(legacy_json_key.to_string(), json_val);
        }
    }

    Ok(Value::Object(map))
}

fn normalize_overlay_db_key(key: &str) -> String {
    match key {
        "overlay_location_enabled" | "location_enabled" => "LOCATION_ENABLED".to_string(),
        "overlay_date_enabled" | "date_enabled" => "DATE_ENABLED".to_string(),
        "overlay_time_enabled" | "time_enabled" => "TIME_ENABLED".to_string(),
        _ => key.to_uppercase(),
    }
}

fn legacy_overlay_key(key: &str) -> Option<&'static str> {
    match key {
        "LOCATION_ENABLED" => Some("OVERLAY_LOCATION_ENABLED"),
        "DATE_ENABLED" => Some("OVERLAY_DATE_ENABLED"),
        "TIME_ENABLED" => Some("OVERLAY_TIME_ENABLED"),
        _ => None,
    }
}

fn legacy_overlay_json_key(key: &str) -> Option<&'static str> {
    match key {
        "LOCATION_ENABLED" => Some("overlay_location_enabled"),
        "DATE_ENABLED" => Some("overlay_date_enabled"),
        "TIME_ENABLED" => Some("overlay_time_enabled"),
        _ => None,
    }
}

fn get_overlay_setting_value(state: &SharedState, sm: &SettingsManager, key: &str) -> String {
    if let Ok(Some(value)) = state.db().get_setting(key) {
        return value;
    }

    if let Some(legacy_key) = legacy_overlay_key(key) {
        if let Ok(Some(legacy_value)) = state.db().get_setting(legacy_key) {
            if let Err(e) = sm.set_setting(key, &legacy_value) {
                tracing::warn!("Failed to migrate overlay setting {legacy_key} -> {key}: {e}");
            }
            return legacy_value;
        }
    }

    sm.get_setting(key).unwrap_or_default()
}

fn smart_json_value(val: &str) -> Value {
    match val {
        "true" => Value::Bool(true),
        "false" => Value::Bool(false),
        _ => {
            if let Ok(n) = val.parse::<i64>() {
                return Value::Number(n.into());
            }
            if let Ok(f) = val.parse::<f64>() {
                if let Some(n) = serde_json::Number::from_f64(f) {
                    return Value::Number(n);
                }
            }
            Value::String(val.to_string())
        }
    }
}

/// Broadcast overlay settings to all WebSocket clients.
fn broadcast_overlay_settings(
    state: &SharedState,
) -> Result<(), (axum::http::StatusCode, Json<Value>)> {
    let settings = build_overlay_json(state)?;
    let msg = json!({
        "type": "settings",
        "data": settings,
    });
    let _ = state.ws_sender().send(msg.to_string());
    Ok(())
}

