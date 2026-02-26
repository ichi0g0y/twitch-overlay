#[cfg(test)]
mod tests {
    use super::{legacy_overlay_json_key, normalize_overlay_db_key, smart_json_value};
    use serde_json::Value;

    #[test]
    fn smart_json_value_converts_bool_true() {
        assert_eq!(smart_json_value("true"), Value::Bool(true));
    }

    #[test]
    fn smart_json_value_converts_bool_false() {
        assert_eq!(smart_json_value("false"), Value::Bool(false));
    }

    #[test]
    fn smart_json_value_converts_int() {
        assert_eq!(smart_json_value("42"), Value::Number(42.into()));
    }

    #[test]
    fn smart_json_value_converts_float() {
        assert_eq!(smart_json_value("3.14"), serde_json::json!(3.14));
    }

    #[test]
    fn smart_json_value_keeps_plain_string() {
        assert_eq!(
            smart_json_value("hello"),
            Value::String("hello".to_string())
        );
    }

    #[test]
    fn smart_json_value_keeps_empty_string() {
        assert_eq!(smart_json_value(""), Value::String(String::new()));
    }

    #[test]
    fn smart_json_value_keeps_json_like_string() {
        assert_eq!(
            smart_json_value("{\"a\":1}"),
            Value::String("{\"a\":1}".to_string())
        );
    }

    #[test]
    fn normalize_overlay_db_key_accepts_legacy_overlay_prefix() {
        assert_eq!(
            normalize_overlay_db_key("overlay_location_enabled"),
            "LOCATION_ENABLED"
        );
        assert_eq!(
            normalize_overlay_db_key("overlay_date_enabled"),
            "DATE_ENABLED"
        );
        assert_eq!(
            normalize_overlay_db_key("overlay_time_enabled"),
            "TIME_ENABLED"
        );
    }

    #[test]
    fn normalize_overlay_db_key_accepts_new_key_names() {
        assert_eq!(
            normalize_overlay_db_key("location_enabled"),
            "LOCATION_ENABLED"
        );
        assert_eq!(normalize_overlay_db_key("date_enabled"), "DATE_ENABLED");
        assert_eq!(normalize_overlay_db_key("time_enabled"), "TIME_ENABLED");
    }

    #[test]
    fn legacy_overlay_json_key_maps_clock_detail_flags() {
        assert_eq!(
            legacy_overlay_json_key("LOCATION_ENABLED"),
            Some("overlay_location_enabled")
        );
        assert_eq!(
            legacy_overlay_json_key("DATE_ENABLED"),
            Some("overlay_date_enabled")
        );
        assert_eq!(
            legacy_overlay_json_key("TIME_ENABLED"),
            Some("overlay_time_enabled")
        );
        assert_eq!(legacy_overlay_json_key("CLOCK_ENABLED"), None);
    }
}
