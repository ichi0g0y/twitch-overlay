//! Configuration management: defaults, validation, loading from DB + environment.

pub mod app_config;
pub mod defaults;
pub mod manager;
pub mod validation;

pub use app_config::AppConfig;
pub use manager::SettingsManager;

use serde::{Deserialize, Serialize};

/// Setting type: normal or secret (masked in API responses).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SettingType {
    Normal,
    Secret,
}

/// A setting as returned to the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SettingInfo {
    pub key: String,
    pub value: String,
    #[serde(rename = "type")]
    pub setting_type: SettingType,
    pub required: bool,
    pub description: String,
    pub has_value: bool,
}

/// Feature availability status.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeatureStatus {
    pub twitch_configured: bool,
    pub printer_configured: bool,
    pub printer_connected: bool,
    pub missing_settings: Vec<String>,
    pub warnings: Vec<String>,
}
