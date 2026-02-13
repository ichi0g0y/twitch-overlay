//! Printer protocol definitions.
//!
//! Supports two protocol variants:
//! - GB series (magic bytes: 0x51, 0x78) - most common cat printers
//! - MXW01 series (magic bytes: 0x22, 0x21) - newer model variant

pub mod gb;
pub mod mxw01;

pub use gb::GbProtocol;
pub use mxw01::Mxw01Protocol;

/// Trait defining the interface for printer protocol implementations.
///
/// Each protocol variant (GB, MXW01) implements this trait to provide
/// device-specific BLE service UUIDs, command encoding, and print sequences.
pub trait PrinterProtocol: Send + Sync {
    /// Human-readable protocol name (e.g. "GB", "MXW01").
    fn name(&self) -> &str;

    /// BLE service UUID used to discover the printer.
    fn service_uuid(&self) -> uuid::Uuid;

    /// BLE TX characteristic UUID for writing data.
    fn tx_characteristic(&self) -> uuid::Uuid;

    /// Build the initialization command sequence sent before printing.
    fn build_init_sequence(&self) -> Vec<Vec<u8>>;

    /// Build a single print-row command for the given encoded row data.
    fn build_print_command(&self, row_data: &[u8]) -> Vec<u8>;

    /// Build a paper feed command for the specified number of lines.
    fn build_feed_command(&self, lines: u16) -> Vec<u8>;

    /// Build the finalization command sequence sent after printing.
    fn build_finish_sequence(&self) -> Vec<Vec<u8>>;

    /// Encode a raw pixel row (1 byte per pixel, 0=white, 1=black)
    /// into the protocol's wire format.
    fn encode_row(&self, row: &[u8], width: u16) -> Vec<u8>;
}
