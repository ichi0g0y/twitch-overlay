//! KeepAlive logic for maintaining BLE printer connections.
//!
//! Two-level reconnection strategy:
//! - Level 1: Disconnect -> 500ms wait -> Reconnect (same instance)
//! - Level 2: Full reset on fatal BLE errors (recreate BLE connection)

use std::time::Duration;

use crate::ble::BleConnection;
use crate::{CatPrinterError, Result};

/// Delay between disconnect and reconnect in Level 1 keep-alive.
const LEVEL1_RECONNECT_DELAY: Duration = Duration::from_millis(500);

/// Delay for full BLE reset in Level 2 keep-alive.
const LEVEL2_RESET_DELAY: Duration = Duration::from_millis(2000);

/// Error substrings that trigger a Level 2 (full reset) reconnection.
const FORCE_RESET_PATTERNS: &[&str] = &[
    "already exists",
    "connection canceled",
    "can't dial",
    "broken pipe",
    "bluetooth",
];

/// Manages periodic BLE reconnection to prevent connection staleness.
///
/// BLE connections can go stale after prolonged inactivity. The KeepAlive
/// manager periodically refreshes the connection using a two-level strategy.
pub struct KeepAliveManager {
    /// Whether keep-alive is active.
    enabled: bool,
    /// Interval between keep-alive reconnection attempts.
    interval: Duration,
}

impl KeepAliveManager {
    /// Create a new KeepAliveManager.
    ///
    /// - `enabled`: whether keep-alive logic is active
    /// - `interval_secs`: seconds between reconnection cycles (minimum 10s)
    pub fn new(enabled: bool, interval_secs: u64) -> Self {
        let interval_secs = interval_secs.max(10);
        Self {
            enabled,
            interval: Duration::from_secs(interval_secs),
        }
    }

    /// Whether keep-alive is enabled.
    pub fn is_enabled(&self) -> bool {
        self.enabled
    }

    /// Set enabled state.
    pub fn set_enabled(&mut self, enabled: bool) {
        self.enabled = enabled;
    }

    /// Get the reconnection interval.
    pub fn interval(&self) -> Duration {
        self.interval
    }

    /// Set the reconnection interval (minimum 10 seconds).
    pub fn set_interval(&mut self, secs: u64) {
        self.interval = Duration::from_secs(secs.max(10));
    }

    /// Perform a Level 1 keep-alive: disconnect and reconnect on the same
    /// BLE connection instance, preserving the BLE adapter state.
    pub async fn refresh_level1(conn: &mut BleConnection) -> Result<()> {
        tracing::info!("KeepAlive Level 1: disconnect -> reconnect");

        conn.disconnect().await?;
        tokio::time::sleep(LEVEL1_RECONNECT_DELAY).await;

        // The caller must reconnect using the stored device info.
        // We only handle the disconnect + delay here; reconnect is
        // driven by the caller since it requires device + UUID info.
        Ok(())
    }

    /// Perform a Level 2 keep-alive: full BLE stack reset.
    ///
    /// Creates a brand new `BleConnection`, discarding the old adapter state.
    /// This is the nuclear option used when Level 1 fails with a fatal error.
    pub async fn reset_level2() -> Result<BleConnection> {
        tracing::warn!("KeepAlive Level 2: full BLE reset");
        tokio::time::sleep(LEVEL2_RESET_DELAY).await;

        BleConnection::new().await.map_err(|e| {
            CatPrinterError::KeepAlive(format!("Level 2 reset failed: {e}"))
        })
    }

    /// Determine whether an error requires a Level 2 (full reset).
    ///
    /// Checks the error message against known fatal BLE error patterns.
    pub fn should_force_reset(err: &CatPrinterError) -> bool {
        let msg = err.to_string().to_lowercase();
        FORCE_RESET_PATTERNS
            .iter()
            .any(|pattern| msg.contains(pattern))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_enforces_minimum_interval() {
        let mgr = KeepAliveManager::new(true, 3);
        assert_eq!(mgr.interval(), Duration::from_secs(10));
    }

    #[test]
    fn test_new_respects_valid_interval() {
        let mgr = KeepAliveManager::new(true, 60);
        assert_eq!(mgr.interval(), Duration::from_secs(60));
    }

    #[test]
    fn test_enabled_toggle() {
        let mut mgr = KeepAliveManager::new(false, 30);
        assert!(!mgr.is_enabled());
        mgr.set_enabled(true);
        assert!(mgr.is_enabled());
    }

    #[test]
    fn test_should_force_reset_known_errors() {
        let cases = vec![
            ("already exists", true),
            ("connection canceled", true),
            ("can't dial", true),
            ("broken pipe", true),
            ("bluetooth adapter error", true),
            ("normal timeout", false),
            ("write failed", false),
        ];

        for (msg, expected) in cases {
            let err = CatPrinterError::BleConnection(msg.to_string());
            assert_eq!(
                KeepAliveManager::should_force_reset(&err),
                expected,
                "Pattern '{}' should{} trigger reset",
                msg,
                if expected { "" } else { " not" }
            );
        }
    }

    #[test]
    fn test_set_interval_minimum() {
        let mut mgr = KeepAliveManager::new(true, 60);
        mgr.set_interval(5);
        assert_eq!(mgr.interval(), Duration::from_secs(10));
    }
}
