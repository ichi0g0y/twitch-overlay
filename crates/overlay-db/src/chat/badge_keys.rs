use serde_json::Value;

pub(super) fn parse_badge_keys_json(raw: String) -> Result<Vec<String>, rusqlite::Error> {
    if raw.trim().is_empty() {
        return Ok(Vec::new());
    }

    let parsed = serde_json::from_str::<Value>(&raw).unwrap_or(Value::Array(vec![]));
    let Some(items) = parsed.as_array() else {
        return Ok(Vec::new());
    };

    Ok(items
        .iter()
        .filter_map(|value| value.as_str().map(ToOwned::to_owned))
        .collect())
}
