//! Image processing utilities for thermal printer output.
//!
//! Provides dithering (Floyd-Steinberg), resizing (384px width),
//! and rotation operations optimized for thermal printer output.

pub mod dither;
pub mod resize;
pub mod rotate;

// Re-exports for convenience
pub use dither::{floyd_steinberg_dither, threshold_convert};
pub use resize::{resize_to_height, resize_to_width};
pub use rotate::{auto_rotate_portrait, rotate_180};

/// Standard thermal printer paper width in pixels.
pub const PAPER_WIDTH: u32 = 384;
