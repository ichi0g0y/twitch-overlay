//! Print job queue and orchestration.
//!
//! Manages a background worker that processes print jobs sequentially,
//! handles BLE/USB printing, and respects dry-run mode.

use std::sync::LazyLock;

use serde_json::json;
use tokio::sync::{RwLock, mpsc};

use crate::app::SharedState;
use crate::services::printer;

/// Maximum number of queued print jobs.
const QUEUE_CAPACITY: usize = 100;

/// A print job to be processed by the worker.
#[derive(Debug)]
pub struct PrintJob {
    /// Monochrome image ready for the thermal printer.
    pub mono_image: Vec<u8>,
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
        } else {
            match execute_print(&state, &job).await {
                Ok(()) => {
                    tracing::info!(desc = %job.description, "Print job completed");
                    broadcast_print_event(&state, "print_success", &job.description, false);
                }
                Err(e) => {
                    tracing::error!(desc = %job.description, error = %e, "Print job failed");
                    broadcast_print_event(&state, "print_error", &e, false);
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
    // Auto dry-run when stream is offline (if enabled)
    // TODO: integrate with stream status tracking
    false
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
    drop(config);

    match printer_type.as_str() {
        "usb" => {
            if usb_name.is_empty() {
                return Err("USB printer name not configured".into());
            }
            // Calculate media size: 53mm width, height proportional to image
            let width_mm = 53.0f32;
            let height_mm = (job.mono_image.len() as f32 / 384.0) * 53.0 / 384.0;
            let height_mm = height_mm.max(10.0);
            printer::print_via_usb(&usb_name, &job.mono_image, width_mm, height_mm).await
        }
        _ => {
            if address.is_empty() {
                return Err("Bluetooth printer address not configured".into());
            }
            // TODO: BLE print pipeline — encode with protocol, send via BLE
            Err("BLE print pipeline not yet integrated (use USB or dry-run mode)".into())
        }
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
