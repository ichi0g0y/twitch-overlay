//! Clock fax save and broadcast helpers.

use serde_json::json;

use crate::app::SharedState;
use crate::events;
use crate::services::fax::{Fax, FaxService};

/// Save clock images as a fax record.
pub async fn save_clock_fax(
    state: &SharedState,
    time_str: &str,
    color_png: &[u8],
    mono_png: &[u8],
) -> Result<Fax, String> {
    let fax_service = FaxService::new(state.data_dir().clone());
    fax_service
        .save_fax("🕐 Clock", time_str, "", "", color_png, mono_png)
        .await
        .map_err(|e| e.to_string())
}

/// Broadcast newly created clock fax to websocket and tauri event.
pub fn broadcast_clock_fax(state: &SharedState, fax: &Fax) {
    broadcast_fax(state, fax);
}

/// Broadcast fax to websocket and tauri event.
pub fn broadcast_fax(state: &SharedState, fax: &Fax) {
    let payload = json!({
        "type": "fax",
        "id": fax.id,
        "timestamp": fax.timestamp.saturating_mul(1000),
        "username": fax.user_name,
        "displayName": fax.user_name,
        "message": fax.message,
        "imageUrl": format!("/fax/{}/color", fax.id),
    });

    let _ = state
        .ws_sender()
        .send(json!({ "type": "fax", "data": payload.clone() }).to_string());
    state.emit_event(events::FAX_RECEIVED, payload);
}
