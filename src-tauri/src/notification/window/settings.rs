use overlay_db::Database;

use crate::config::SettingsManager;

pub(super) fn load_interaction_settings(
    db: &Database,
    movable_key: &str,
    resizable_key: &str,
) -> (bool, bool) {
    let sm = SettingsManager::new(db.clone());
    let movable = parse_saved_bool(sm.get_setting(movable_key).unwrap_or_default(), true);
    let resizable = parse_saved_bool(sm.get_setting(resizable_key).unwrap_or_default(), true);
    (movable, resizable)
}

pub(super) fn load_saved_coordinate(
    sm: &SettingsManager,
    absolute_key: &str,
    legacy_key: &str,
) -> Option<i32> {
    let absolute = sm.get_setting(absolute_key).unwrap_or_default();
    parse_saved_i32(absolute).or_else(|| {
        let legacy = sm.get_setting(legacy_key).unwrap_or_default();
        parse_saved_i32(legacy)
    })
}

fn parse_saved_i32(value: String) -> Option<i32> {
    if let Ok(i) = value.parse::<i32>() {
        return Some(i);
    }
    value.parse::<f64>().ok().map(|f| f.round() as i32)
}

fn parse_saved_bool(value: String, default_value: bool) -> bool {
    if value.eq_ignore_ascii_case("true") {
        return true;
    }
    if value.eq_ignore_ascii_case("false") {
        return false;
    }
    default_value
}
