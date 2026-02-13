//! Printer control API (scan, test, status, reconnect).

use axum::Json;
use axum::extract::State;
use serde_json::{Value, json};

use crate::app::SharedState;
use crate::services::printer;
use crate::services::printer_pipeline;

type ApiResult = Result<Json<Value>, (axum::http::StatusCode, Json<Value>)>;

use super::err_json;

/// POST /api/printer/scan – Scan for BLE printers
pub async fn scan_printers(State(_state): State<SharedState>) -> ApiResult {
    match printer::scan_bluetooth_printers().await {
        Ok(devices) => Ok(Json(json!({
            "devices": devices,
            "status": "success",
        }))),
        Err(err) => {
            printer::mark_error(err.clone()).await;
            Err(err_json(500, &err))
        }
    }
}

/// POST /api/printer/test – Test printer connection
pub async fn test_printer(State(_state): State<SharedState>, Json(body): Json<Value>) -> ApiResult {
    let printer_type = body["printer_type"].as_str().unwrap_or("bluetooth");

    match printer_type {
        "bluetooth" => {
            let address = body["mac_address"].as_str().unwrap_or("").trim();
            if address.is_empty() {
                return Err(err_json(
                    400,
                    "MAC address is required for Bluetooth printer",
                ));
            }

            match printer::test_bluetooth_connection(address).await {
                Ok(()) => {
                    printer::mark_connected("bluetooth", address).await;
                    Ok(Json(
                        json!({ "success": true, "message": "Connection successful" }),
                    ))
                }
                Err(err) => {
                    printer::mark_error(err.clone()).await;
                    Err(err_json(500, &err))
                }
            }
        }
        "usb" => {
            let printer_name = body["printer_name"]
                .as_str()
                .or_else(|| body["usb_printer_name"].as_str())
                .unwrap_or("")
                .trim();
            if printer_name.is_empty() {
                return Err(err_json(400, "Printer name is required for USB printer"));
            }

            match printer::is_usb_printer_available(printer_name).await {
                Ok(true) => {
                    printer::mark_connected("usb", printer_name).await;
                    Ok(Json(json!({
                        "success": true,
                        "message": format!("Printer found: {printer_name}"),
                    })))
                }
                Ok(false) => {
                    let msg = format!("printer '{printer_name}' not found in system");
                    printer::mark_error(msg.clone()).await;
                    Err(err_json(404, &msg))
                }
                Err(err) => {
                    printer::mark_error(err.clone()).await;
                    Err(err_json(500, &err))
                }
            }
        }
        _ => Err(err_json(400, "Invalid printer type")),
    }
}

/// GET /api/printer/status
pub async fn printer_status(State(state): State<SharedState>) -> ApiResult {
    let (dry_run_mode, mut printer_type, printer_address, usb_printer_name) = {
        let config = state.config().await;
        (
            config.dry_run_mode,
            config.printer_type.clone(),
            config.printer_address.clone(),
            config.usb_printer_name.clone(),
        )
    };

    if printer_type.is_empty() {
        printer_type = "bluetooth".to_string();
    }

    let configured = if printer_type == "usb" {
        !usb_printer_name.is_empty()
    } else {
        !printer_address.is_empty()
    };

    let runtime = printer::get_runtime_state().await;
    let connected = if printer_type == "usb" {
        if usb_printer_name.is_empty() {
            false
        } else {
            printer::is_usb_printer_available(&usb_printer_name)
                .await
                .unwrap_or(false)
        }
    } else {
        runtime.connected
            && runtime.connected_type.as_deref() == Some("bluetooth")
            && runtime.connected_target.as_deref() == Some(printer_address.as_str())
    };

    Ok(Json(json!({
        "connected": connected,
        "dry_run_mode": dry_run_mode,
        "printer_address": printer_address,
        "printer_type": printer_type,
        "usb_printer_name": usb_printer_name,
        "configured": configured,
        "print_queue": 0,
        "error": runtime.last_error,
    })))
}

/// POST /api/printer/reconnect
pub async fn reconnect_printer(State(state): State<SharedState>) -> ApiResult {
    let (mut printer_type, printer_address) = {
        let config = state.config().await;
        (config.printer_type.clone(), config.printer_address.clone())
    };

    if printer_type.is_empty() {
        printer_type = "bluetooth".to_string();
    }

    if printer_type != "bluetooth" {
        return Err(err_json(
            400,
            "Bluetooth printer mode is required for reconnect",
        ));
    }

    if printer_address.is_empty() {
        return Err(err_json(400, "Printer address is not configured"));
    }

    match printer::reconnect_bluetooth(&printer_address).await {
        Ok(()) => {
            printer::mark_connected("bluetooth", &printer_address).await;
            Ok(Json(json!({
                "success": true,
                "connected": true,
                "printer_address": printer_address,
                "message": "プリンターに再接続しました",
            })))
        }
        Err(err) => {
            printer::mark_error(err.clone()).await;
            Err(err_json(500, &err))
        }
    }
}

/// POST /api/printer/test-print
pub async fn test_print(State(state): State<SharedState>, Json(_body): Json<Value>) -> ApiResult {
    let (dry_run_mode, mut printer_type, printer_address, usb_printer_name, rotate_print) = {
        let config = state.config().await;
        (
            config.dry_run_mode,
            config.printer_type.clone(),
            config.printer_address.clone(),
            config.usb_printer_name.clone(),
            config.rotate_print,
        )
    };

    if printer_type.is_empty() {
        printer_type = "bluetooth".to_string();
    }

    if printer_type == "usb" && usb_printer_name.is_empty() {
        return Err(err_json(400, "USB printer name is not configured"));
    }
    if printer_type == "bluetooth" && printer_address.is_empty() {
        return Err(err_json(400, "Bluetooth printer address is not configured"));
    }

    if dry_run_mode {
        return Ok(Json(json!({
            "success": true,
            "message": "Test print (dry run mode)",
            "dry_run": true,
            "printer_type": printer_type,
        })));
    }

    let width = catprinter::PRINT_WIDTH;
    let bitmap = printer_pipeline::generate_test_bitmap(width);

    let print_result = match printer_type.as_str() {
        "usb" => {
            printer_pipeline::print_bitmap_usb(&usb_printer_name, &bitmap, width, rotate_print)
                .await
        }
        "bluetooth" => {
            printer_pipeline::print_bitmap_bluetooth(&printer_address, &bitmap, width, rotate_print)
                .await
        }
        _ => Err(format!("Unsupported printer type: {printer_type}")),
    };

    match print_result {
        Ok(()) => Ok(Json(json!({
            "success": true,
            "message": "Test print sent",
            "dry_run": false,
            "printer_type": printer_type,
        }))),
        Err(err) => {
            printer::mark_error(err.clone()).await;
            Err(err_json(500, &err))
        }
    }
}

/// GET /api/printer/system-printers
pub async fn list_system_printers(State(_state): State<SharedState>) -> ApiResult {
    match printer::list_system_printers().await {
        Ok(printers) => Ok(Json(json!({
            "printers": printers,
            "count": printers.len(),
            "status": "success",
        }))),
        Err(err) => {
            printer::mark_error(err.clone()).await;
            Err(err_json(500, &err))
        }
    }
}
