//! Printer data pipeline helpers.
//!
//! Converts monochrome bitmaps (0/1 per pixel) into printer commands and
//! sends them over BLE or USB paths.

use std::time::Duration;

use catprinter::ble::BleConnection;
use catprinter::protocol::gb::GbProtocol;
use catprinter::{CatPrinterError, PrinterProtocol};

use super::printer_helpers::{
    cat_error, ensure_bluetooth_safe_to_use, find_target_device, scan_uuids,
};

const POST_CONNECT_DELAY: Duration = Duration::from_millis(1000);
const TEST_IMAGE_HEIGHT: usize = 144;

/// Build a simple monochrome test bitmap (384px width).
pub fn generate_test_bitmap(width: u16) -> Vec<u8> {
    let w = width as usize;
    let h = TEST_IMAGE_HEIGHT;
    let mut out = vec![0u8; w * h];

    // Border + pattern bars for visible test output.
    for y in 0..h {
        for x in 0..w {
            let border = x < 2 || x >= w - 2 || y < 2 || y >= h - 2;
            let bar = y % 16 < 2;
            let diag = x == (y * 2) % w || x == w - 1 - ((y * 2) % w);
            let marker = y > 40 && y < 110 && (x % 48 < 12);
            if border || bar || diag || marker {
                out[y * w + x] = 1;
            }
        }
    }

    out
}

/// Send a bitmap to a Bluetooth cat-printer.
pub async fn print_bitmap_bluetooth(
    address: &str,
    bitmap: &[u8],
    width: u16,
    rotate_print: bool,
) -> Result<(), String> {
    if address.trim().is_empty() {
        return Err("Bluetooth printer address is not configured".to_string());
    }
    ensure_bluetooth_safe_to_use()?;

    let normalized = normalize_bitmap(bitmap, width)?;
    let print_bitmap = if rotate_print {
        rotate_bitmap_180(&normalized, width)
    } else {
        normalized
    };

    let protocol = GbProtocol::new();
    let mut conn = BleConnection::new().await.map_err(cat_error)?;
    let (service_uuid, fallback_uuid) = scan_uuids(&protocol);

    let devices = conn
        .scan_devices(service_uuid, fallback_uuid)
        .await
        .map_err(cat_error)?;
    let target = find_target_device(devices, address)
        .ok_or_else(|| format!("printer device '{address}' not found"))?;

    conn.connect(&target, protocol.tx_characteristic())
        .await
        .map_err(cat_error)?;
    tokio::time::sleep(POST_CONNECT_DELAY).await;

    let send_result = send_bitmap_over_ble(&conn, &protocol, &print_bitmap, width)
        .await
        .map_err(cat_error);
    if send_result.is_ok() {
        let rows = print_bitmap.len() / (width as usize);
        let wait_secs = (2 + rows / 60).max(3) as u64;
        tracing::info!(wait_secs, rows, "印刷完了待機中");
        tokio::time::sleep(Duration::from_secs(wait_secs)).await;
    }
    let disconnect_result = conn.disconnect().await.map_err(cat_error);
    finalize_ble_results(send_result, disconnect_result)
}

/// Send a bitmap to USB print path via CUPS/lpr.
pub async fn print_bitmap_usb(
    printer_name: &str,
    bitmap: &[u8],
    width: u16,
    rotate_print: bool,
) -> Result<(), String> {
    if printer_name.trim().is_empty() {
        return Err("USB printer name is not configured".to_string());
    }

    let normalized = normalize_bitmap(bitmap, width)?;
    let print_bitmap = if rotate_print {
        rotate_bitmap_180(&normalized, width)
    } else {
        normalized
    };
    let payload = build_gb_payload(&print_bitmap, width)?;
    let rows = print_bitmap.len() / (width as usize);

    let width_mm = 53.0f32;
    let height_mm = ((rows as f32) * width_mm / (width as f32)).ceil().max(10.0);

    crate::services::printer::print_via_usb(printer_name, &payload, width_mm, height_mm).await
}

fn build_gb_payload(bitmap: &[u8], width: u16) -> Result<Vec<u8>, String> {
    let protocol = GbProtocol::new();
    let row_width = width as usize;
    if row_width == 0 || !bitmap.len().is_multiple_of(row_width) {
        return Err("bitmap dimensions are invalid".to_string());
    }

    let mut payload = Vec::new();
    for cmd in protocol.build_init_sequence() {
        payload.extend_from_slice(&cmd);
    }
    for row in bitmap.chunks(row_width) {
        let cmd = protocol.encode_row(row, width);
        payload.extend_from_slice(&cmd);
    }
    payload.extend_from_slice(&protocol.build_feed_command(4));
    for cmd in protocol.build_finish_sequence() {
        payload.extend_from_slice(&cmd);
    }

    Ok(payload)
}

async fn send_bitmap_over_ble(
    conn: &BleConnection,
    protocol: &GbProtocol,
    bitmap: &[u8],
    width: u16,
) -> Result<(), CatPrinterError> {
    let row_width = width as usize;
    for cmd in protocol.build_init_sequence() {
        conn.write_data(&cmd).await?;
    }
    for row in bitmap.chunks(row_width) {
        let cmd = protocol.encode_row(row, width);
        conn.write_data(&cmd).await?;
    }
    conn.write_data(&protocol.build_feed_command(4)).await?;
    for cmd in protocol.build_finish_sequence() {
        conn.write_data(&cmd).await?;
    }
    Ok(())
}

fn normalize_bitmap(bitmap: &[u8], width: u16) -> Result<Vec<u8>, String> {
    let row_width = width as usize;
    if row_width == 0 {
        return Err("bitmap width must be greater than 0".to_string());
    }
    if !bitmap.len().is_multiple_of(row_width) {
        return Err("bitmap dimensions are invalid".to_string());
    }
    Ok(bitmap
        .iter()
        .map(|&v| if v == 0 { 0u8 } else { 1u8 })
        .collect())
}

fn rotate_bitmap_180(bitmap: &[u8], width: u16) -> Vec<u8> {
    let row_width = width as usize;
    let rows = bitmap.len() / row_width;
    let mut out = vec![0u8; bitmap.len()];
    for y in 0..rows {
        for x in 0..row_width {
            let src = y * row_width + x;
            let dst = (rows - 1 - y) * row_width + (row_width - 1 - x);
            out[dst] = bitmap[src];
        }
    }
    out
}

fn finalize_ble_results(
    send_result: Result<(), String>,
    disconnect_result: Result<(), String>,
) -> Result<(), String> {
    match (send_result, disconnect_result) {
        (Ok(()), Ok(())) => Ok(()),
        (Err(send_err), Ok(())) => Err(send_err),
        (Ok(()), Err(disconnect_err)) => Err(disconnect_err),
        (Err(send_err), Err(disconnect_err)) => Err(format!(
            "{send_err}; disconnect also failed: {disconnect_err}"
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bitmap_has_expected_size() {
        let bmp = generate_test_bitmap(384);
        assert_eq!(bmp.len(), 384 * TEST_IMAGE_HEIGHT);
        assert!(bmp.iter().any(|v| *v == 1));
    }

    #[test]
    fn test_rotate_bitmap_180_preserves_len() {
        let src = vec![0u8, 1, 0, 1, 1, 0];
        let rotated = rotate_bitmap_180(&src, 3);
        assert_eq!(rotated.len(), src.len());
    }

    #[test]
    fn test_finalize_ble_results_prefers_send_error() {
        let result = finalize_ble_results(Err("send failed".to_string()), Ok(()));
        assert_eq!(result, Err("send failed".to_string()));
    }

    #[test]
    fn test_finalize_ble_results_returns_disconnect_error() {
        let result = finalize_ble_results(Ok(()), Err("disconnect failed".to_string()));
        assert_eq!(result, Err("disconnect failed".to_string()));
    }

    #[test]
    fn test_finalize_ble_results_reports_both_errors() {
        let result = finalize_ble_results(
            Err("send failed".to_string()),
            Err("disconnect failed".to_string()),
        );
        assert_eq!(
            result,
            Err("send failed; disconnect also failed: disconnect failed".to_string())
        );
    }
}
