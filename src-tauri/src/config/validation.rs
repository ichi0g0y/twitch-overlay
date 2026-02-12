//! Setting value validation.

use regex::Regex;
use std::sync::LazyLock;

static RE_MAC: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^([0-9A-Fa-f]{2}[:\-]){5}([0-9A-Fa-f]{2})$").unwrap());
static RE_UUID_NO_HYPHEN: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^[0-9A-Fa-f]{32}$").unwrap());
static RE_UUID_HYPHEN: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$")
        .unwrap()
});

/// Validate a setting value. Returns `Ok(())` if valid, or an error message.
pub fn validate_setting(key: &str, value: &str) -> Result<(), String> {
    match key {
        "PRINTER_TYPE" => {
            if value != "bluetooth" && value != "usb" {
                return Err("must be 'bluetooth' or 'usb'".into());
            }
        }
        "USB_PRINTER_NAME" => {
            if !value.is_empty() && value.len() > 255 {
                return Err("printer name must be 1-255 characters".into());
            }
        }
        "BLACK_POINT" => {
            let v: f64 = value.parse().map_err(|_| "must be a float")?;
            if !(0.0..=1.0).contains(&v) {
                return Err("must be between 0.0 and 1.0".into());
            }
        }
        "KEEP_ALIVE_INTERVAL" => {
            let v: i32 = value.parse().map_err(|_| "must be an integer")?;
            if !(10..=3600).contains(&v) {
                return Err("must be between 10 and 3600 seconds".into());
            }
        }
        "PRINTER_ADDRESS" => {
            if !value.is_empty()
                && !RE_MAC.is_match(value)
                && !RE_UUID_NO_HYPHEN.is_match(value)
                && !RE_UUID_HYPHEN.is_match(value)
            {
                return Err("invalid address format (expected MAC or UUID)".into());
            }
        }
        "NOTIFICATION_DISPLAY_DURATION" => validate_int_range(value, 1, 60)?,
        "REWARD_COUNT_POSITION" => {
            if value != "left" && value != "right" {
                return Err("must be 'left' or 'right'".into());
            }
        }
        "LOTTERY_DISPLAY_DURATION" => validate_int_range(value, 3, 15)?,
        "LOTTERY_ANIMATION_SPEED" => {
            let v: f64 = value.parse().map_err(|_| "must be a float")?;
            if !(0.5..=2.0).contains(&v) {
                return Err("must be between 0.5 and 2.0".into());
            }
        }
        "MIC_TRANSCRIPT_TRANSLATION_MODE" => {
            if value != "off" && value != "chrome" {
                return Err("must be 'off' or 'chrome'".into());
            }
        }
        "MIC_TRANSCRIPT_V_ALIGN" => {
            if !value.is_empty() && value != "top" && value != "bottom" {
                return Err("must be 'top' or 'bottom'".into());
            }
        }
        "MIC_TRANSCRIPT_FRAME_HEIGHT_PX" => validate_int_range(value, 0, 4096)?,
        "MIC_TRANSCRIPT_MAX_WIDTH_PX" | "MIC_TRANSCRIPT_TRANSLATION_MAX_WIDTH_PX" => {
            validate_int_range(value, 0, 4096)?
        }
        "MIC_TRANSCRIPT_SPEECH_SHORT_PAUSE_MS" => validate_int_range(value, 0, 5000)?,
        "MIC_TRANSCRIPT_SPEECH_INTERIM_THROTTLE_MS" => validate_int_range(value, 0, 2000)?,
        "MIC_TRANSCRIPT_SPEECH_RESTART_DELAY_MS" => validate_int_range(value, 0, 2000)?,
        "TICKER_NOTICE_FONT_SIZE" => validate_int_range(value, 10, 48)?,
        "TICKER_NOTICE_ALIGN" => {
            if !["left", "center", "right"].contains(&value) {
                return Err("must be left, center, or right".into());
            }
        }
        "NOTIFICATION_DISPLAY_MODE" => {
            if value != "queue" && value != "overwrite" {
                return Err("must be 'queue' or 'overwrite'".into());
            }
        }
        "MIC_TRANSCRIPT_LINE_TTL_SECONDS" => validate_int_range(value, 1, 300)?,
        "MIC_TRANSCRIPT_LAST_TTL_SECONDS" => validate_int_range(value, 0, 300)?,
        // Boolean settings
        k if is_boolean_setting(k) => {
            if value != "true" && value != "false" {
                return Err("must be 'true' or 'false'".into());
            }
        }
        _ => {}
    }
    Ok(())
}

fn validate_int_range(value: &str, min: i32, max: i32) -> Result<(), String> {
    let v: i32 = value.parse().map_err(|_| "must be an integer")?;
    if v < min || v > max {
        return Err(format!("must be between {min} and {max}"));
    }
    Ok(())
}

fn is_boolean_setting(key: &str) -> bool {
    matches!(
        key,
        "DRY_RUN_MODE"
            | "BEST_QUALITY"
            | "DITHER"
            | "AUTO_ROTATE"
            | "ROTATE_PRINT"
            | "KEEP_ALIVE_ENABLED"
            | "CLOCK_ENABLED"
            | "CLOCK_SHOW_ICONS"
            | "DEBUG_OUTPUT"
            | "NOTIFICATION_ENABLED"
            | "REWARD_COUNT_ENABLED"
            | "LOTTERY_ENABLED"
            | "LOTTERY_LOCKED"
            | "LOTTERY_TICKER_ENABLED"
            | "TICKER_NOTICE_ENABLED"
            | "MUSIC_ENABLED"
            | "MUSIC_AUTO_PLAY"
            | "FAX_ENABLED"
            | "OVERLAY_CLOCK_ENABLED"
            | "OVERLAY_LOCATION_ENABLED"
            | "OVERLAY_DATE_ENABLED"
            | "OVERLAY_TIME_ENABLED"
            | "OVERLAY_DEBUG_ENABLED"
            | "MIC_TRANSCRIPT_ENABLED"
            | "MIC_TRANSCRIPT_SPEECH_ENABLED"
            | "MIC_TRANSCRIPT_SPEECH_DUAL_INSTANCE_ENABLED"
            | "MIC_TRANSCRIPT_BOUYOMI_ENABLED"
            | "MIC_TRANSCRIPT_ANTI_SEXUAL_ENABLED"
            | "MIC_TRANSCRIPT_TRANSLATION_ENABLED"
            | "AUTO_DRY_RUN_WHEN_OFFLINE"
            | "WINDOW_FULLSCREEN"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_boolean() {
        assert!(validate_setting("DRY_RUN_MODE", "true").is_ok());
        assert!(validate_setting("DRY_RUN_MODE", "false").is_ok());
        assert!(validate_setting("DRY_RUN_MODE", "yes").is_err());
    }

    #[test]
    fn test_valid_printer_address() {
        assert!(validate_setting("PRINTER_ADDRESS", "AA:BB:CC:DD:EE:FF").is_ok());
        assert!(validate_setting("PRINTER_ADDRESS", "aabbccddeeff00112233445566778899").is_ok());
        assert!(validate_setting("PRINTER_ADDRESS", "12345678-1234-1234-1234-123456789abc").is_ok());
        assert!(validate_setting("PRINTER_ADDRESS", "invalid").is_err());
        assert!(validate_setting("PRINTER_ADDRESS", "").is_ok()); // empty is ok
    }

    #[test]
    fn test_valid_black_point() {
        assert!(validate_setting("BLACK_POINT", "0.5").is_ok());
        assert!(validate_setting("BLACK_POINT", "0.0").is_ok());
        assert!(validate_setting("BLACK_POINT", "1.0").is_ok());
        assert!(validate_setting("BLACK_POINT", "1.1").is_err());
        assert!(validate_setting("BLACK_POINT", "-0.1").is_err());
    }
}
