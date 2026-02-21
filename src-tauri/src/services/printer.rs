//! Printer service helpers (BLE scan/test/reconnect + CUPS listing).

use std::sync::LazyLock;
use std::time::Duration;

use catprinter::ble::BleConnection;
use catprinter::keepalive::KeepAliveManager;
use catprinter::protocol::gb::GbProtocol;
use catprinter::{CatPrinterError, PrinterProtocol};
use serde::Serialize;
use tokio::process::Command;
use tokio::sync::RwLock;

use crate::app::SharedState;
use crate::events;

use super::printer_helpers::{
    cat_error, ensure_bluetooth_safe_to_use, find_target_device, scan_uuids,
};

#[derive(Debug, Clone, Serialize)]
pub struct DiscoveredPrinter {
    pub mac_address: String,
    pub name: String,
    pub last_seen: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SystemPrinter {
    pub name: String,
    pub status: String,
}

#[derive(Debug, Clone, Default)]
pub struct PrinterRuntimeState {
    pub connected: bool,
    pub connected_type: Option<String>,
    pub connected_target: Option<String>,
    pub last_error: Option<String>,
}

static PRINTER_RUNTIME: LazyLock<RwLock<PrinterRuntimeState>> =
    LazyLock::new(|| RwLock::new(PrinterRuntimeState::default()));

pub async fn get_runtime_state() -> PrinterRuntimeState {
    PRINTER_RUNTIME.read().await.clone()
}

pub async fn mark_connected(state: &SharedState, printer_type: &str, target: &str) {
    let mut rt = PRINTER_RUNTIME.write().await;
    rt.connected = true;
    rt.connected_type = Some(printer_type.to_string());
    rt.connected_target = Some(target.to_string());
    rt.last_error = None;

    state.emit_event(
        events::PRINTER_CONNECTED,
        events::PrinterStatusPayload {
            connected: true,
            printer_type: printer_type.to_string(),
            target: target.to_string(),
        },
    );
}

pub async fn mark_error(state: &SharedState, err: impl Into<String>) {
    let message = err.into();
    let mut rt = PRINTER_RUNTIME.write().await;
    rt.connected = false;
    rt.last_error = Some(message.clone());

    state.emit_event(events::PRINTER_ERROR, events::ErrorPayload { message });
}

pub async fn scan_bluetooth_printers() -> Result<Vec<DiscoveredPrinter>, String> {
    ensure_bluetooth_safe_to_use()?;
    let conn = BleConnection::new().await.map_err(cat_error)?;
    let protocol = GbProtocol::new();
    let (service_uuid, fallback_uuid) = scan_uuids(&protocol);

    let devices = conn
        .scan_devices(service_uuid, fallback_uuid)
        .await
        .map_err(cat_error)?;

    let now = chrono::Utc::now().to_rfc3339();
    let mut printers = devices
        .into_iter()
        .map(|d| DiscoveredPrinter {
            mac_address: d.id,
            name: d.name,
            last_seen: now.clone(),
        })
        .collect::<Vec<_>>();

    printers.sort_by(|a, b| {
        let a_has_name = !a.name.is_empty();
        let b_has_name = !b.name.is_empty();
        b_has_name
            .cmp(&a_has_name)
            .then_with(|| a.name.cmp(&b.name))
            .then_with(|| a.mac_address.cmp(&b.mac_address))
    });

    Ok(printers)
}

pub async fn test_bluetooth_connection(address: &str) -> Result<(), String> {
    ensure_bluetooth_safe_to_use()?;
    let protocol = GbProtocol::new();
    let mut conn = BleConnection::new().await.map_err(cat_error)?;

    connect_target(&mut conn, address, &protocol)
        .await
        .map_err(cat_error)?;
    tokio::time::sleep(Duration::from_secs(1)).await;
    conn.disconnect().await.map_err(cat_error)?;

    Ok(())
}

pub async fn reconnect_bluetooth(address: &str) -> Result<(), String> {
    ensure_bluetooth_safe_to_use()?;
    let protocol = GbProtocol::new();
    let mut conn = BleConnection::new().await.map_err(cat_error)?;

    connect_target(&mut conn, address, &protocol)
        .await
        .map_err(cat_error)?;

    let refresh_result = KeepAliveManager::refresh_level1(&mut conn).await;
    if let Err(err) = refresh_result {
        if KeepAliveManager::should_force_reset(&err) {
            let mut reset_conn = KeepAliveManager::reset_level2().await.map_err(cat_error)?;
            connect_target(&mut reset_conn, address, &protocol)
                .await
                .map_err(cat_error)?;
            reset_conn.disconnect().await.map_err(cat_error)?;
            return Ok(());
        }
        return Err(cat_error(err));
    }

    let reconnect_result = connect_target(&mut conn, address, &protocol).await;
    match reconnect_result {
        Ok(()) => {
            conn.disconnect().await.map_err(cat_error)?;
            Ok(())
        }
        Err(err) if KeepAliveManager::should_force_reset(&err) => {
            let mut reset_conn = KeepAliveManager::reset_level2().await.map_err(cat_error)?;
            connect_target(&mut reset_conn, address, &protocol)
                .await
                .map_err(cat_error)?;
            reset_conn.disconnect().await.map_err(cat_error)?;
            Ok(())
        }
        Err(err) => Err(cat_error(err)),
    }
}

pub async fn list_system_printers() -> Result<Vec<SystemPrinter>, String> {
    let output = Command::new("lpstat")
        .arg("-p")
        .output()
        .await
        .map_err(|e| format!("failed to run lpstat -p: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    if !output.status.success() {
        if stderr.contains("No destinations added") || stderr.contains("No printers") {
            return Ok(Vec::new());
        }
        return Err(format!("lpstat -p failed: {}", stderr.trim()));
    }

    Ok(parse_lpstat_output(&stdout))
}

pub async fn is_usb_printer_available(printer_name: &str) -> Result<bool, String> {
    let printers = list_system_printers().await?;
    Ok(printers.iter().any(|p| p.name == printer_name))
}

async fn connect_target(
    conn: &mut BleConnection,
    address: &str,
    protocol: &GbProtocol,
) -> Result<(), CatPrinterError> {
    let (service_uuid, fallback_uuid) = scan_uuids(protocol);
    let devices = conn.scan_devices(service_uuid, fallback_uuid).await?;
    let device = find_target_device(devices, address).ok_or(CatPrinterError::PrinterNotFound)?;
    conn.connect(&device, protocol.tx_characteristic()).await
}

/// Print image data via USB/CUPS using the `lpr` command.
pub async fn print_via_usb(
    printer_name: &str,
    image_data: &[u8],
    width_mm: f32,
    height_mm: f32,
) -> Result<(), String> {
    let tmp_dir = std::path::PathBuf::from("/tmp/twitch-overlay-print");
    tokio::fs::create_dir_all(&tmp_dir)
        .await
        .map_err(|e| format!("Failed to create temp dir: {e}"))?;

    let tmp_file = tmp_dir.join("current_job.bin");
    tokio::fs::write(&tmp_file, image_data)
        .await
        .map_err(|e| format!("Failed to write temp file: {e}"))?;

    let media = format!("Custom.{:.0}x{:.0}mm", width_mm, height_mm);
    let output = Command::new("lpr")
        .arg("-P")
        .arg(printer_name)
        .arg("-o")
        .arg(format!("media={media}"))
        .arg(&tmp_file)
        .output()
        .await
        .map_err(|e| format!("Failed to run lpr: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("lpr failed: {}", stderr.trim()));
    }

    let _ = tokio::fs::remove_file(&tmp_file).await;
    Ok(())
}

fn parse_lpstat_output(stdout: &str) -> Vec<SystemPrinter> {
    let mut printers = Vec::new();

    for line in stdout.lines() {
        let trimmed = line.trim();
        let Some(rest) = trimmed.strip_prefix("printer ") else {
            continue;
        };

        let mut parts = rest.splitn(2, ' ');
        let Some(name) = parts.next() else {
            continue;
        };
        let status = parts
            .next()
            .and_then(|s| s.strip_prefix("is "))
            .map(|s| s.trim().trim_end_matches('.').to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "unknown".to_string());

        printers.push(SystemPrinter {
            name: name.to_string(),
            status,
        });
    }

    printers
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_lpstat_lines() {
        let input = "printer EPSON_TM is idle. enabled since Thu 01 Jan 00:00:00 1970\nprinter Label_Printer is disabled. since Thu 01 Jan 00:00:00 1970\n";
        let printers = parse_lpstat_output(input);

        assert_eq!(printers.len(), 2);
        assert_eq!(printers[0].name, "EPSON_TM");
        assert_eq!(
            printers[0].status,
            "idle. enabled since Thu 01 Jan 00:00:00 1970"
        );
        assert_eq!(printers[1].name, "Label_Printer");
        assert_eq!(
            printers[1].status,
            "disabled. since Thu 01 Jan 00:00:00 1970"
        );
    }
}
