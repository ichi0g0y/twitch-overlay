//! Cat printer control library supporting GB and MXW01 series.
//!
//! Provides BLE connection management, printer protocol implementation,
//! and KeepAlive functionality for thermal printers.

pub mod ble;
mod ble_init;
pub mod keepalive;
pub mod options;
pub mod protocol;

// Re-exports for convenience
pub use ble::BleConnection;
pub use keepalive::KeepAliveManager;
pub use options::PrinterOptions;
pub use protocol::PrinterProtocol;

/// Print width in pixels (standard for GB/MXW01 series thermal printers).
pub const PRINT_WIDTH: u16 = 384;

/// Errors that can occur during printer operations.
#[derive(Debug, thiserror::Error)]
pub enum CatPrinterError {
    #[error("Printer not found during BLE scan")]
    PrinterNotFound,

    #[error("Missing TX characteristic on connected device")]
    MissingCharacteristic,

    #[error("BLE connection error: {0}")]
    BleConnection(String),

    #[error("BLE write error: {0}")]
    BleWrite(String),

    #[error("BLE scan error: {0}")]
    BleScan(String),

    #[error("Device already disconnected")]
    AlreadyDisconnected,

    #[error("Not connected to any device")]
    NotConnected,

    #[error("Connection timeout after {0} seconds")]
    ConnectionTimeout(u64),

    #[error("Invalid image dimensions: expected width {expected}, got {actual}")]
    InvalidImageSize { expected: u16, actual: u16 },

    #[error("Image is not black and white")]
    NotBlackWhite,

    #[error("KeepAlive error: {0}")]
    KeepAlive(String),

    #[error("Protocol error: {0}")]
    Protocol(String),
}

/// Result type alias for catprinter operations.
pub type Result<T> = std::result::Result<T, CatPrinterError>;
