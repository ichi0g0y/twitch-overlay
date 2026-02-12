//! SettingsManager: DB-backed settings with defaults, migration, and feature status.

use std::collections::HashMap;

use overlay_db::Database;

use super::defaults::DEFAULT_SETTINGS;
use super::validation::validate_setting;
use super::{FeatureStatus, SettingInfo, SettingType};

/// Wraps [`Database`] to provide high-level settings operations.
pub struct SettingsManager {
    db: Database,
}

impl SettingsManager {
    pub fn new(db: Database) -> Self {
        Self { db }
    }

    /// Get a setting value. Falls back to default if not in DB.
    pub fn get_setting(&self, key: &str) -> Result<String, anyhow::Error> {
        if let Some(val) = self.db.get_setting(key)? {
            return Ok(val);
        }
        if let Some(def) = DEFAULT_SETTINGS.get(key) {
            return Ok(def.default.to_string());
        }
        anyhow::bail!("setting not found: {key}");
    }

    /// Set a setting value with validation.
    pub fn set_setting(&self, key: &str, value: &str) -> Result<(), anyhow::Error> {
        let def = DEFAULT_SETTINGS
            .get(key)
            .ok_or_else(|| anyhow::anyhow!("unknown setting key: {key}"))?;

        validate_setting(key, value).map_err(|e| anyhow::anyhow!("validation error for {key}: {e}"))?;

        let type_str = if def.secret { "secret" } else { "normal" };
        self.db.set_setting(key, value, type_str)?;
        Ok(())
    }

    /// Get all settings, filling in defaults for missing keys.
    pub fn get_all_settings(&self) -> Result<HashMap<String, SettingInfo>, anyhow::Error> {
        let db_settings = self.db.get_all_settings()?;
        let mut result = HashMap::new();

        // Add DB settings (type determined from defaults map)
        for (key, value) in &db_settings {
            let def = DEFAULT_SETTINGS.get(key.as_str());
            let setting_type = match def {
                Some(d) if d.secret => SettingType::Secret,
                _ => SettingType::Normal,
            };
            result.insert(
                key.clone(),
                SettingInfo {
                    key: key.clone(),
                    value: value.clone(),
                    setting_type,
                    required: def.map_or(false, |d| d.required),
                    description: def.map_or(String::new(), |d| d.description.to_string()),
                    has_value: !value.is_empty(),
                },
            );
        }

        // Fill defaults for missing keys
        for (key, def) in DEFAULT_SETTINGS.iter() {
            if !result.contains_key(*key) {
                result.insert(
                    key.to_string(),
                    SettingInfo {
                        key: key.to_string(),
                        value: def.default.to_string(),
                        setting_type: if def.secret {
                            SettingType::Secret
                        } else {
                            SettingType::Normal
                        },
                        required: def.required,
                        description: def.description.to_string(),
                        has_value: !def.default.is_empty(),
                    },
                );
            }
        }

        Ok(result)
    }

    /// Initialize default settings in DB (skip existing).
    pub fn initialize_defaults(&self) -> Result<(), anyhow::Error> {
        for (key, def) in DEFAULT_SETTINGS.iter() {
            if self.db.get_setting(key)?.is_some() {
                continue;
            }
            let type_str = if def.secret { "secret" } else { "normal" };
            self.db.set_setting(key, def.default, type_str)?;
        }
        Ok(())
    }

    /// Migrate settings from environment variables to DB (one-time).
    pub fn migrate_from_env(&self) -> Result<u32, anyhow::Error> {
        let mut migrated = 0u32;
        for key in DEFAULT_SETTINGS.keys() {
            if self.db.get_setting(key)?.is_some() {
                continue;
            }
            if let Ok(env_val) = std::env::var(key) {
                if !env_val.is_empty() {
                    let def = &DEFAULT_SETTINGS[key];
                    let type_str = if def.secret { "secret" } else { "normal" };
                    self.db.set_setting(key, &env_val, type_str)?;
                    tracing::info!("Migrated setting from env: {key}");
                    migrated += 1;
                }
            }
        }
        if migrated > 0 {
            tracing::info!("Migration completed: {migrated} settings migrated");
            if has_secret_in_env() {
                tracing::warn!(
                    "SECURITY WARNING: Sensitive data in env vars. \
                     Remove from .env after confirming migration."
                );
            }
        }
        Ok(migrated)
    }

    /// Check which features are properly configured.
    pub fn check_feature_status(&self) -> Result<FeatureStatus, anyhow::Error> {
        let mut status = FeatureStatus {
            twitch_configured: true,
            printer_configured: false,
            printer_connected: false,
            missing_settings: Vec::new(),
            warnings: Vec::new(),
        };

        // Twitch settings check
        for key in &["CLIENT_ID", "CLIENT_SECRET", "TWITCH_USER_ID", "TRIGGER_CUSTOM_REWORD_ID"] {
            let val = self.get_setting(key).unwrap_or_default();
            if val.is_empty() {
                status.missing_settings.push(key.to_string());
                status.twitch_configured = false;
            }
        }

        // Printer settings check
        let printer_addr = self.get_setting("PRINTER_ADDRESS").unwrap_or_default();
        if printer_addr.is_empty() {
            status.missing_settings.push("PRINTER_ADDRESS".into());
        } else {
            status.printer_configured = true;
        }

        // Warnings
        if self.get_setting("DRY_RUN_MODE").unwrap_or_default() == "true" {
            status.warnings.push("DRY_RUN_MODE is enabled - no actual printing".into());
        }

        Ok(status)
    }

    pub fn db(&self) -> &Database {
        &self.db
    }
}

fn has_secret_in_env() -> bool {
    ["CLIENT_SECRET", "CLIENT_ID", "TWITCH_USER_ID", "TRIGGER_CUSTOM_REWORD_ID"]
        .iter()
        .any(|k| std::env::var(k).is_ok_and(|v| !v.is_empty()))
}
