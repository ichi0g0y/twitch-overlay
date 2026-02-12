//! BLE connection management using btleplug.
//!
//! Provides scanning, connecting, disconnecting, and chunked data writing
//! for thermal printer peripherals over Bluetooth Low Energy.

use std::time::Duration;

use btleplug::api::{
    Central, CentralEvent, Characteristic, Manager as _, Peripheral as _, ScanFilter, WriteType,
};
use btleplug::platform::{Adapter, Manager, Peripheral};
use futures::StreamExt;
use uuid::Uuid;

use crate::{CatPrinterError, Result};

/// Default BLE scan timeout in seconds.
const SCAN_TIMEOUT_SECS: u64 = 10;

/// Default delay between BLE write chunks.
const CHUNK_WRITE_DELAY: Duration = Duration::from_millis(20);

/// Discovered BLE device information.
#[derive(Debug, Clone)]
pub struct DiscoveredDevice {
    /// Device display name (may be empty if not advertised).
    pub name: String,
    /// Platform-specific device identifier (address on Linux, UUID on macOS).
    pub id: String,
    /// The underlying btleplug peripheral handle.
    pub peripheral: Peripheral,
}

/// Manages a BLE connection to a single thermal printer.
pub struct BleConnection {
    adapter: Adapter,
    peripheral: Option<Peripheral>,
    tx_char: Option<Characteristic>,
    chunk_size: usize,
}

impl BleConnection {
    /// Create a new BLE connection manager.
    ///
    /// Initializes the platform BLE adapter (first available).
    pub async fn new() -> Result<Self> {
        let manager = Manager::new()
            .await
            .map_err(|e| CatPrinterError::BleConnection(e.to_string()))?;

        let adapters = manager
            .adapters()
            .await
            .map_err(|e| CatPrinterError::BleConnection(e.to_string()))?;

        let adapter = adapters
            .into_iter()
            .next()
            .ok_or_else(|| CatPrinterError::BleConnection("No BLE adapter found".into()))?;

        Ok(Self {
            adapter,
            peripheral: None,
            tx_char: None,
            chunk_size: 182, // conservative default (185 MTU - 3)
        })
    }

    /// Scan for BLE devices advertising the given service UUID.
    ///
    /// Returns discovered devices after a 10-second scan window.
    /// Also tries the macOS fallback UUID (af30) if provided.
    pub async fn scan_devices(
        &self,
        service_uuid: Uuid,
        fallback_uuid: Option<Uuid>,
    ) -> Result<Vec<DiscoveredDevice>> {
        tracing::info!("Starting BLE scan ({}s timeout)", SCAN_TIMEOUT_SECS);

        self.adapter
            .start_scan(ScanFilter::default())
            .await
            .map_err(|e| CatPrinterError::BleScan(e.to_string()))?;

        // Listen for discovery events with timeout
        let mut events = self
            .adapter
            .events()
            .await
            .map_err(|e| CatPrinterError::BleScan(e.to_string()))?;

        let deadline = tokio::time::sleep(Duration::from_secs(SCAN_TIMEOUT_SECS));
        tokio::pin!(deadline);

        let mut found = Vec::new();
        let mut seen_ids = std::collections::HashSet::new();

        loop {
            tokio::select! {
                _ = &mut deadline => break,
                event = events.next() => {
                    if let Some(CentralEvent::DeviceDiscovered(id)) = event {
                        let id_str = id.to_string();
                        if seen_ids.contains(&id_str) {
                            continue;
                        }
                        if let Ok(peripheral) = self.adapter.peripheral(&id).await {
                            if let Ok(Some(props)) = peripheral.properties().await {
                                let name = props.local_name.unwrap_or_default();
                                let uuids = &props.services;
                                let matches = uuids.contains(&service_uuid)
                                    || fallback_uuid.map_or(false, |fu| uuids.contains(&fu));

                                if matches {
                                    tracing::info!(name = %name, id = %id_str, "Found printer");
                                    seen_ids.insert(id_str.clone());
                                    found.push(DiscoveredDevice {
                                        name,
                                        id: id_str,
                                        peripheral,
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }

        self.adapter
            .stop_scan()
            .await
            .map_err(|e| CatPrinterError::BleScan(e.to_string()))?;

        tracing::info!(count = found.len(), "BLE scan complete");
        Ok(found)
    }

    /// Connect to a specific peripheral and discover the TX characteristic.
    pub async fn connect(
        &mut self,
        device: &DiscoveredDevice,
        tx_uuid: Uuid,
    ) -> Result<()> {
        tracing::info!(id = %device.id, name = %device.name, "Connecting to device");

        device
            .peripheral
            .connect()
            .await
            .map_err(|e| CatPrinterError::BleConnection(e.to_string()))?;

        device
            .peripheral
            .discover_services()
            .await
            .map_err(|e| CatPrinterError::BleConnection(e.to_string()))?;

        // Find TX characteristic
        let tx_char = device
            .peripheral
            .characteristics()
            .into_iter()
            .find(|c| c.uuid == tx_uuid)
            .ok_or(CatPrinterError::MissingCharacteristic)?;

        // Negotiate MTU-based chunk size (MTU - 3 for ATT header)
        // btleplug does not expose MTU directly; use a safe default.
        self.chunk_size = 182;

        self.tx_char = Some(tx_char);
        self.peripheral = Some(device.peripheral.clone());

        tracing::info!(
            chunk_size = self.chunk_size,
            "Connected and discovered characteristic"
        );
        Ok(())
    }

    /// Disconnect from the currently connected peripheral.
    pub async fn disconnect(&mut self) -> Result<()> {
        if let Some(ref peripheral) = self.peripheral {
            tracing::info!("Disconnecting BLE device");
            peripheral
                .disconnect()
                .await
                .map_err(|e| CatPrinterError::BleConnection(e.to_string()))?;
        }
        self.peripheral = None;
        self.tx_char = None;
        Ok(())
    }

    /// Check whether a peripheral is currently connected.
    pub fn is_connected(&self) -> bool {
        self.peripheral.is_some()
    }

    /// Write data to the TX characteristic in MTU-sized chunks.
    ///
    /// Inserts a small delay between chunks to avoid overwhelming the device.
    pub async fn write_data(&self, data: &[u8]) -> Result<()> {
        let peripheral = self
            .peripheral
            .as_ref()
            .ok_or(CatPrinterError::NotConnected)?;
        let tx_char = self
            .tx_char
            .as_ref()
            .ok_or(CatPrinterError::MissingCharacteristic)?;

        let chunks: Vec<&[u8]> = data.chunks(self.chunk_size).collect();
        tracing::debug!(
            chunk_count = chunks.len(),
            chunk_size = self.chunk_size,
            total_bytes = data.len(),
            "Writing data in chunks"
        );

        for (i, chunk) in chunks.iter().enumerate() {
            peripheral
                .write(tx_char, chunk, WriteType::WithoutResponse)
                .await
                .map_err(|e| {
                    CatPrinterError::BleWrite(format!("chunk {}/{}: {}", i + 1, chunks.len(), e))
                })?;
            tokio::time::sleep(CHUNK_WRITE_DELAY).await;
        }

        Ok(())
    }

    /// Return a reference to the connected peripheral, if any.
    pub fn peripheral(&self) -> Option<&Peripheral> {
        self.peripheral.as_ref()
    }
}
