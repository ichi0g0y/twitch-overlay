//! Headless server binary — runs without Tauri window.
//!
//! Starts the axum web server, background tasks, and signal handling.
//! Use this for server-only deployments (no desktop UI).

use tracing_subscriber::EnvFilter;

use twitch_overlay_lib::app::SharedState;
use twitch_overlay_lib::background;
use twitch_overlay_lib::server;
use twitch_overlay_lib::services;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Step 1: Tracing
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env())
        .init();

    tracing::info!("Starting Helsinki Overlay (headless mode)");

    // Steps 2-5: Foundation
    let (db, config, dir) = twitch_overlay_lib::init_foundation()?;
    let state = SharedState::new(db, config, dir);

    // Step 15: Web server
    let server_state = state.clone();
    let server_handle = tokio::spawn(async move {
        if let Err(e) = server::start_server(server_state).await {
            tracing::error!("Server failed: {e}");
        }
    });

    // Step 16: Token auto-refresh
    let s = state.clone();
    tokio::spawn(async move { background::token_refresh_loop(s).await });

    // Step 11: Stream status sync (startup + periodic)
    let s = state.clone();
    tokio::spawn(async move { background::stream_status_sync_loop(s).await });

    // Step 13: EventSub
    let s = state.clone();
    tokio::spawn(async move { twitch_overlay_lib::run_eventsub_handler(s).await });

    // Step 10: Printer KeepAlive
    let s = state.clone();
    tokio::spawn(async move { background::printer_keepalive_loop(s).await });

    // Clock routine (hourly print)
    let s = state.clone();
    tokio::spawn(async move { services::clock_print::clock_routine_loop(s).await });

    // Print queue worker
    let s = state.clone();
    tokio::spawn(async move { services::print_queue::start_worker(s).await });

    // Step 14: Notification
    let s = state.clone();
    tokio::spawn(async move { twitch_overlay_lib::init_notification_system(s).await });

    tracing::info!(
        port = state.server_port(),
        "Headless server running. Press Ctrl+C to stop."
    );

    // Wait for shutdown signal
    tokio::signal::ctrl_c().await?;
    tracing::info!("Shutting down...");

    server_handle.abort();
    Ok(())
}
