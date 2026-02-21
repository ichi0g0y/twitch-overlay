use std::time::Duration;

use tauri::Manager;
use tokio::time::sleep;

use crate::app::SharedState;
use crate::notification;
use crate::services::print_queue;
use crate::window;

pub async fn graceful_shutdown(state: &SharedState) {
    tracing::info!("Shutdown sequence started");

    save_final_window_state(state);

    state.shutdown_token().cancel();
    tracing::info!("Shutdown: background loops cancelled");

    if let Some(tx) = state.take_eventsub_shutdown().await {
        if tx.send(()).await.is_ok() {
            tracing::info!("Shutdown: EventSub stop signal sent");
        } else {
            tracing::warn!("Shutdown: failed to send EventSub stop signal");
        }
    }

    print_queue::close().await;
    tracing::info!("Shutdown: print queue closed");

    notification::queue::close().await;
    tracing::info!("Shutdown: notification queue closed");

    sleep(Duration::from_millis(200)).await;
    tracing::info!("Shutdown sequence completed");
}

fn save_final_window_state(state: &SharedState) {
    let Some(app_handle) = state.app_handle() else {
        return;
    };
    let Some(main_window) = app_handle.get_webview_window("main") else {
        return;
    };

    let Ok(position) = main_window.outer_position() else {
        return;
    };
    let Ok(size) = main_window.outer_size() else {
        return;
    };
    let is_fullscreen = main_window.is_fullscreen().unwrap_or(false);

    window::position::save_window_state(
        state.db(),
        &window::position::WindowState {
            x: position.x,
            y: position.y,
            width: size.width,
            height: size.height,
            is_fullscreen,
        },
    );
}
