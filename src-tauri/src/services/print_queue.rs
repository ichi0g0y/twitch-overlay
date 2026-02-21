//! Print job queue and orchestration.
//!
//! Manages a background worker that processes print jobs sequentially,
//! handles BLE/USB printing, and respects dry-run mode.

use std::sync::LazyLock;

use serde_json::json;
use tokio::sync::{RwLock, mpsc};

use crate::app::SharedState;
use crate::events;
use crate::services::printer_pipeline;

/// Maximum number of queued print jobs.
const QUEUE_CAPACITY: usize = 100;

/// A print job to be processed by the worker.
#[derive(Debug)]
pub struct PrintJob {
    /// Monochrome image ready for the thermal printer.
    pub mono_image: Vec<u8>,
    /// Bitmap width (pixels). Defaults to 384 when set to 0.
    pub mono_width: u16,
    /// Color image for FAX storage (optional).
    pub color_image: Option<Vec<u8>>,
    /// Description for logging.
    pub description: String,
    /// Force print even in dry-run mode.
    pub force: bool,
}

#[derive(Debug, Default)]
struct QueueState {
    pending_count: usize,
    total_processed: u64,
    last_print_at: Option<String>,
}

static QUEUE_STATE: LazyLock<RwLock<QueueState>> =
    LazyLock::new(|| RwLock::new(QueueState::default()));

static JOB_TX: LazyLock<RwLock<Option<mpsc::Sender<PrintJob>>>> =
    LazyLock::new(|| RwLock::new(None));

/// Initialize the print queue and start the background worker.
pub async fn start_worker(state: SharedState) {
    let (tx, rx) = mpsc::channel::<PrintJob>(QUEUE_CAPACITY);
    {
        let mut slot = JOB_TX.write().await;
        *slot = Some(tx);
    }

    tokio::spawn(worker_loop(state, rx));
    tracing::info!("Print queue worker started (capacity={QUEUE_CAPACITY})");
}

/// Enqueue a print job. Returns error if the queue is full.
pub async fn enqueue(job: PrintJob) -> Result<(), String> {
    let tx_guard = JOB_TX.read().await;
    let tx = tx_guard
        .as_ref()
        .ok_or_else(|| "Print queue not initialized".to_string())?;

    tx.try_send(job)
        .map_err(|e| format!("Print queue full or closed: {e}"))?;

    let mut qs = QUEUE_STATE.write().await;
    qs.pending_count += 1;

    Ok(())
}

/// Close the queue sender to stop the worker loop.
pub async fn close() {
    let mut slot = JOB_TX.write().await;
    *slot = None;
}

/// Get the current queue status.
pub async fn queue_status() -> (usize, u64) {
    let qs = QUEUE_STATE.read().await;
    (qs.pending_count, qs.total_processed)
}

/// Background worker loop — processes jobs sequentially.
async fn worker_loop(state: SharedState, mut rx: mpsc::Receiver<PrintJob>) {
    while let Some(job) = rx.recv().await {
        {
            let mut qs = QUEUE_STATE.write().await;
            qs.pending_count = qs.pending_count.saturating_sub(1);
        }

        let should_dry_run = should_use_dry_run(&state).await && !job.force;

        if should_dry_run {
            tracing::info!(desc = %job.description, "Print job (dry run)");
            broadcast_print_event(&state, "print_success", &job.description, true);
            state.emit_event(
                events::PRINT_SUCCESS,
                events::PrintResultPayload {
                    message: job.description.clone(),
                    dry_run: true,
                },
            );
        } else {
            match execute_print(&state, &job).await {
                Ok(()) => {
                    tracing::info!(desc = %job.description, "Print job completed");
                    broadcast_print_event(&state, "print_success", &job.description, false);
                    state.emit_event(
                        events::PRINT_SUCCESS,
                        events::PrintResultPayload {
                            message: job.description.clone(),
                            dry_run: false,
                        },
                    );
                }
                Err(e) => {
                    tracing::error!(desc = %job.description, error = %e, "Print job failed");
                    broadcast_print_event(&state, "print_error", &e, false);
                    state.emit_event(
                        events::PRINT_ERROR,
                        events::PrintResultPayload {
                            message: e.clone(),
                            dry_run: false,
                        },
                    );
                    // Wait before retrying next job
                    tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                }
            }
        }

        let mut qs = QUEUE_STATE.write().await;
        qs.total_processed += 1;
        qs.last_print_at = Some(chrono::Utc::now().to_rfc3339());
    }

    tracing::info!("Print queue worker stopped");
}

/// Check whether dry-run mode should be used.
async fn should_use_dry_run(state: &SharedState) -> bool {
    let config = state.config().await;
    if config.dry_run_mode {
        return true;
    }
    let auto_when_offline = config.auto_dry_run_when_offline;
    drop(config);

    auto_dry_run_from_stream(auto_when_offline, state.stream_live().await)
}

fn auto_dry_run_from_stream(auto_when_offline: bool, stream_live: Option<bool>) -> bool {
    auto_when_offline && matches!(stream_live, Some(false))
}

/// Execute the actual printing.
async fn execute_print(state: &SharedState, job: &PrintJob) -> Result<(), String> {
    let config = state.config().await;
    let printer_type = if config.printer_type.is_empty() {
        "bluetooth".to_string()
    } else {
        config.printer_type.clone()
    };
    let address = config.printer_address.clone();
    let usb_name = config.usb_printer_name.clone();
    let rotate_print = config.rotate_print;
    drop(config);

    let width = if job.mono_width == 0 {
        catprinter::PRINT_WIDTH
    } else {
        job.mono_width
    };

    match printer_type.as_str() {
        "usb" => {
            if usb_name.is_empty() {
                return Err("USB printer name not configured".into());
            }
            printer_pipeline::print_bitmap_usb(&usb_name, &job.mono_image, width, rotate_print)
                .await
        }
        "bluetooth" => {
            if address.is_empty() {
                return Err("Bluetooth printer address not configured".into());
            }
            printer_pipeline::print_bitmap_bluetooth(&address, &job.mono_image, width, rotate_print)
                .await
        }
        _ => Err(format!("Unsupported printer type: {printer_type}")),
    }
}

fn broadcast_print_event(state: &SharedState, event_type: &str, message: &str, dry_run: bool) {
    let msg = json!({
        "type": event_type,
        "data": {
            "message": message,
            "dry_run": dry_run,
            "timestamp": chrono::Utc::now().to_rfc3339(),
        }
    });
    let _ = state.ws_sender().send(msg.to_string());
}

#[cfg(test)]
mod tests {
    use super::auto_dry_run_from_stream;

    #[test]
    fn auto_dry_run_disabled_never_forces() {
        assert!(!auto_dry_run_from_stream(false, Some(false)));
    }

    #[test]
    fn auto_dry_run_enabled_and_offline_forces() {
        assert!(auto_dry_run_from_stream(true, Some(false)));
    }

    #[test]
    fn auto_dry_run_enabled_and_online_does_not_force() {
        assert!(!auto_dry_run_from_stream(true, Some(true)));
    }

    #[test]
    fn auto_dry_run_enabled_and_unknown_does_not_force() {
        assert!(!auto_dry_run_from_stream(true, None));
    }
}
