//! BLE初期化のリトライ・エラー処理ヘルパー（macOS CentralManager対応）

use std::time::Duration;

use crate::CatPrinterError;

pub(crate) const RETRY_COUNT: usize = 6;
pub(crate) const RETRY_DELAY: Duration = Duration::from_millis(500);

pub(crate) fn is_central_manager_transient(err: &CatPrinterError) -> bool {
    #[cfg(target_os = "macos")]
    {
        if let CatPrinterError::BleConnection(msg) = err {
            let msg = msg.to_ascii_lowercase();
            return msg.contains("central manager has invalid state") && msg.contains("have=0");
        }
    }

    false
}

pub(crate) fn wrap_ble_init_error(err: CatPrinterError) -> CatPrinterError {
    #[cfg(target_os = "macos")]
    {
        if let CatPrinterError::BleConnection(msg) = &err {
            if msg
                .to_ascii_lowercase()
                .contains("central manager has invalid state")
            {
                return CatPrinterError::BleConnection(format!(
                    "{msg} (macOS: Bluetoothがオンか、システム設定 > プライバシーとセキュリティ > Bluetooth でこのアプリを許可するだす)"
                ));
            }
        }
    }

    err
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn central_manager_transient_error_detection() {
        let transient =
            CatPrinterError::BleConnection("central manager has invalid state (have=0)".into());
        let non_transient =
            CatPrinterError::BleConnection("central manager has invalid state (have=1)".into());

        if cfg!(target_os = "macos") {
            assert!(is_central_manager_transient(&transient));
            assert!(!is_central_manager_transient(&non_transient));
        } else {
            assert!(!is_central_manager_transient(&transient));
            assert!(!is_central_manager_transient(&non_transient));
        }
    }

    #[test]
    fn wrap_ble_init_error_with_macos_hint() {
        let wrapped = wrap_ble_init_error(CatPrinterError::BleConnection(
            "central manager has invalid state".into(),
        ));

        match wrapped {
            CatPrinterError::BleConnection(msg) => {
                if cfg!(target_os = "macos") {
                    assert!(msg.contains("central manager has invalid state"));
                    assert!(msg.contains("プライバシーとセキュリティ"));
                } else {
                    assert_eq!(msg, "central manager has invalid state");
                }
            }
            _ => unreachable!(),
        }
    }
}
