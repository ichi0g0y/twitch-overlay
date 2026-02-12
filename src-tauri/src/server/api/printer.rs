//! Printer control API (scan, test, status, reconnect).

use axum::extract::State;
use axum::Json;
use serde_json::{json, Value};

use crate::app::SharedState;

use super::err_json;

type ApiResult = Result<Json<Value>, (axum::http::StatusCode, Json<Value>)>;

/// POST /api/printer/scan – Scan for BLE printers
pub async fn scan_printers(State(_state): State<SharedState>) -> ApiResult {
    // TODO: Integrate with catprinter crate for BLE scanning
    Ok(Json(json!({
        "devices": [],
        "status": "scan_complete",
        "message": "BLE scanning not yet integrated",
    })))
}

/// POST /api/printer/test – Test printer connection
pub async fn test_printer(
    State(_state): State<SharedState>,
    Json(body): Json<Value>,
) -> ApiResult {
    let address = body["mac_address"].as_str().unwrap_or("");
    let printer_type = body["printer_type"].as_str().unwrap_or("bluetooth");
    // TODO: Integrate with catprinter crate
    Ok(Json(json!({
        "success": false,
        "address": address,
        "type": printer_type,
        "message": "Printer testing not yet integrated",
    })))
}

/// GET /api/printer/status
pub async fn printer_status(State(_state): State<SharedState>) -> ApiResult {
    // TODO: Get actual printer status from shared state
    Ok(Json(json!({
        "connected": false,
        "type": "bluetooth",
        "address": "",
    })))
}

/// POST /api/printer/reconnect
pub async fn reconnect_printer(State(_state): State<SharedState>) -> ApiResult {
    // TODO: Integrate with catprinter crate
    Ok(Json(json!({
        "success": false,
        "message": "Printer reconnection not yet integrated",
    })))
}

/// POST /api/printer/test-print
pub async fn test_print(
    State(state): State<SharedState>,
    Json(_body): Json<Value>,
) -> ApiResult {
    let config = state.config().await;
    if config.dry_run_mode {
        return Ok(Json(json!({
            "success": true,
            "message": "Test print (dry run mode)",
            "dry_run": true,
        })));
    }
    // TODO: Integrate with catprinter crate for actual printing
    Err(err_json(501, "Printing not yet integrated"))
}
