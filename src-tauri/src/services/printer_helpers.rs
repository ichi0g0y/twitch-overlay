use catprinter::ble::DiscoveredDevice;
use catprinter::protocol::gb::{GbProtocol, SERVICE_UUID_MACOS};
use catprinter::{CatPrinterError, PrinterProtocol};
use uuid::Uuid;

pub const GB_SERVICE_UUID_STANDARD: Uuid =
    Uuid::from_u128(0x0000_ae30_0000_1000_8000_0080_5f9b_34fb);

pub fn find_target_device(
    devices: Vec<DiscoveredDevice>,
    target: &str,
) -> Option<DiscoveredDevice> {
    devices
        .into_iter()
        .find(|device| device_matches_target(&device.id, &device.name, target))
}

pub fn scan_uuids(protocol: &GbProtocol) -> (Uuid, Option<Uuid>) {
    let service_uuid = protocol.service_uuid();
    let fallback_uuid = if service_uuid == SERVICE_UUID_MACOS {
        Some(GB_SERVICE_UUID_STANDARD)
    } else {
        Some(SERVICE_UUID_MACOS)
    };
    (service_uuid, fallback_uuid)
}

pub fn normalize_device_id(raw: &str) -> String {
    raw.chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .map(|c| c.to_ascii_lowercase())
        .collect()
}

pub fn ensure_bluetooth_safe_to_use() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let exe = std::env::current_exe()
            .map_err(|e| format!("failed to resolve executable path: {e}"))?;
        let exe_path = exe.to_string_lossy();
        if !exe_path.contains(".app/Contents/MacOS/") {
            return Err(
                "macOSのBluetooth機能は .app から起動しないと abort trap で落ちることがあるだす（`task dev:tauri` で起動するだす）".to_string()
            );
        }
    }
    Ok(())
}

pub fn cat_error(err: CatPrinterError) -> String {
    err.to_string()
}

fn device_matches_target(device_id: &str, device_name: &str, target: &str) -> bool {
    let normalized_target = normalize_device_id(target);
    device_id.eq_ignore_ascii_case(target)
        || normalize_device_id(device_id) == normalized_target
        || (!device_name.is_empty() && device_name.eq_ignore_ascii_case(target))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_device_id_removes_separators() {
        assert_eq!(normalize_device_id("AA:BB:CC:DD:EE:FF"), "aabbccddeeff");
        assert_eq!(
            normalize_device_id("12345678-1234-1234-1234-123456789abc"),
            "12345678123412341234123456789abc"
        );
    }

    #[test]
    fn find_target_device_matching_logic() {
        assert!(device_matches_target(
            "AA:BB:CC:DD:EE:FF",
            "cat-printer",
            "aabbccddeeff"
        ));
        assert!(device_matches_target(
            "001122334455",
            "cat-printer",
            "CAT-PRINTER"
        ));
        assert!(!device_matches_target("001122334455", "", "not-found"));
    }
}
