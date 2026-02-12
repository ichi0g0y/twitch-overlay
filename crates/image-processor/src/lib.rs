//! Image processing utilities for thermal printer output.
//!
//! Provides dithering, resizing, rotation, text rendering,
//! QR code generation, image composition, and message-to-image
//! conversion for thermal printer output.

pub mod clock;
pub mod compose;
pub mod dither;
pub mod message;
pub mod qr;
pub mod resize;
pub mod rotate;
pub mod text;

// Re-exports for convenience
pub use dither::{floyd_steinberg_dither, threshold_convert};
pub use resize::{resize_to_height, resize_to_width};
pub use rotate::{auto_rotate_portrait, rotate_180};

/// Standard thermal printer paper width in pixels.
pub const PAPER_WIDTH: u32 = 384;
