//! Runtime application configuration loaded from DB + environment overrides.
#![allow(dead_code)]

use super::manager::SettingsManager;

/// Runtime configuration populated from the settings DB.
#[derive(Debug, Clone)]
pub struct AppConfig {
    pub client_id: String,
    pub client_secret: String,
    pub twitch_user_id: String,
    pub trigger_custom_reward_id: String,
    pub printer_address: String,
    pub printer_type: String,
    pub usb_printer_name: String,
    pub best_quality: bool,
    pub dither: bool,
    pub black_point: f32,
    pub auto_rotate: bool,
    pub debug_output: bool,
    pub keep_alive_interval: i32,
    pub keep_alive_enabled: bool,
    pub clock_enabled: bool,
    pub dry_run_mode: bool,
    pub rotate_print: bool,
    pub server_port: u16,
    pub timezone: String,
    pub auto_dry_run_when_offline: bool,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            client_id: String::new(),
            client_secret: String::new(),
            twitch_user_id: String::new(),
            trigger_custom_reward_id: String::new(),
            printer_address: String::new(),
            printer_type: "bluetooth".into(),
            usb_printer_name: String::new(),
            best_quality: true,
            dither: true,
            black_point: 0.5,
            auto_rotate: false,
            debug_output: false,
            keep_alive_interval: 60,
            keep_alive_enabled: false,
            clock_enabled: false,
            dry_run_mode: true,
            rotate_print: true,
            server_port: 8080,
            timezone: "Asia/Tokyo".into(),
            auto_dry_run_when_offline: false,
        }
    }
}

impl AppConfig {
    /// Load configuration from the settings manager (DB-first, env overrides).
    pub fn load(sm: &SettingsManager) -> Result<Self, anyhow::Error> {
        let g = |key: &str| -> String { sm.get_setting(key).unwrap_or_default() };

        let mut server_port = parse_u16(&g("SERVER_PORT"), 8080);
        let mut keep_alive_interval = parse_i32(&g("KEEP_ALIVE_INTERVAL"), 60);

        // Environment variable overrides (backwards compatibility)
        if let Ok(v) = std::env::var("SERVER_PORT") {
            if let Ok(p) = v.parse::<u16>() {
                server_port = p;
            }
        }
        if let Ok(v) = std::env::var("KEEP_ALIVE_INTERVAL") {
            if let Ok(i) = v.parse::<i32>() {
                keep_alive_interval = i;
            }
        }

        // DRY_RUN_MODE can also be overridden by env
        let dry_run_mode = std::env::var("DRY_RUN_MODE")
            .map(|v| v == "true")
            .unwrap_or_else(|_| g("DRY_RUN_MODE") == "true");

        Ok(Self {
            client_id: g("CLIENT_ID"),
            client_secret: g("CLIENT_SECRET"),
            twitch_user_id: g("TWITCH_USER_ID"),
            trigger_custom_reward_id: g("TRIGGER_CUSTOM_REWORD_ID"),
            printer_address: g("PRINTER_ADDRESS"),
            printer_type: {
                let t = g("PRINTER_TYPE");
                if t.is_empty() { "bluetooth".into() } else { t }
            },
            usb_printer_name: g("USB_PRINTER_NAME"),
            best_quality: g("BEST_QUALITY") == "true",
            dither: g("DITHER") == "true",
            black_point: parse_f32(&g("BLACK_POINT"), 0.5),
            auto_rotate: g("AUTO_ROTATE") == "true",
            debug_output: g("DEBUG_OUTPUT") == "true",
            keep_alive_interval,
            keep_alive_enabled: g("KEEP_ALIVE_ENABLED") == "true",
            clock_enabled: g("CLOCK_ENABLED") == "true",
            dry_run_mode,
            rotate_print: g("ROTATE_PRINT") == "true",
            server_port,
            timezone: {
                let tz = g("TIMEZONE");
                if tz.is_empty() { "Asia/Tokyo".into() } else { tz }
            },
            auto_dry_run_when_offline: g("AUTO_DRY_RUN_WHEN_OFFLINE") == "true",
        })
    }

    /// Reload config from the settings manager.
    pub fn reload(&mut self, sm: &SettingsManager) -> Result<(), anyhow::Error> {
        *self = Self::load(sm)?;
        Ok(())
    }
}

fn parse_f32(s: &str, default: f32) -> f32 {
    if s.is_empty() {
        return default;
    }
    s.parse().unwrap_or(default)
}

fn parse_i32(s: &str, default: i32) -> i32 {
    if s.is_empty() {
        return default;
    }
    s.parse().unwrap_or(default)
}

fn parse_u16(s: &str, default: u16) -> u16 {
    if s.is_empty() {
        return default;
    }
    s.parse().unwrap_or(default)
}
