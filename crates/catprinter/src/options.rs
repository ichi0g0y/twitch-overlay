//! Printer configuration options.
//!
//! These options control print quality, image orientation, and thresholding.
//! Note: Actual dithering is handled by the image-engine crate;
//! the `dither` flag here signals whether dithering should be applied upstream.

/// Configuration options for thermal printer output.
#[derive(Debug, Clone)]
pub struct PrinterOptions {
    /// Use high-quality mode (slower, darker print with more energy).
    pub best_quality: bool,

    /// Whether to apply dithering (actual algorithm is in image-engine crate).
    pub dither: bool,

    /// Automatically rotate landscape images to portrait for better resolution.
    pub auto_rotate: bool,

    /// Black point threshold (0.0..=1.0). Pixels darker than this are printed
    /// as black when dithering is disabled.
    pub black_point: f32,

    /// Rotate the image 180 degrees before printing (for upside-down printers).
    pub rotate_print: bool,
}

impl Default for PrinterOptions {
    fn default() -> Self {
        Self {
            best_quality: true,
            dither: true,
            auto_rotate: false,
            black_point: 0.5,
            rotate_print: false,
        }
    }
}

impl PrinterOptions {
    /// Create options with sensible defaults.
    pub fn new() -> Self {
        Self::default()
    }

    /// Builder: set best quality mode.
    pub fn with_best_quality(mut self, val: bool) -> Self {
        self.best_quality = val;
        self
    }

    /// Builder: set dither flag.
    pub fn with_dither(mut self, val: bool) -> Self {
        self.dither = val;
        self
    }

    /// Builder: set auto-rotate flag.
    pub fn with_auto_rotate(mut self, val: bool) -> Self {
        self.auto_rotate = val;
        self
    }

    /// Builder: set black point threshold.
    ///
    /// # Panics
    /// Panics if value is not in 0.0..=1.0 range.
    pub fn with_black_point(mut self, val: f32) -> Self {
        assert!(
            (0.0..=1.0).contains(&val),
            "Black point must be between 0.0 and 1.0, got {val}"
        );
        self.black_point = val;
        self
    }

    /// Builder: set rotate-print flag.
    pub fn with_rotate_print(mut self, val: bool) -> Self {
        self.rotate_print = val;
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_options() {
        let opts = PrinterOptions::default();
        assert!(opts.best_quality);
        assert!(opts.dither);
        assert!(!opts.auto_rotate);
        assert!((opts.black_point - 0.5).abs() < f32::EPSILON);
        assert!(!opts.rotate_print);
    }

    #[test]
    fn test_builder_chain() {
        let opts = PrinterOptions::new()
            .with_best_quality(false)
            .with_dither(false)
            .with_auto_rotate(true)
            .with_black_point(0.7)
            .with_rotate_print(true);

        assert!(!opts.best_quality);
        assert!(!opts.dither);
        assert!(opts.auto_rotate);
        assert!((opts.black_point - 0.7).abs() < f32::EPSILON);
        assert!(opts.rotate_print);
    }

    #[test]
    #[should_panic(expected = "Black point must be between 0.0 and 1.0")]
    fn test_invalid_black_point() {
        PrinterOptions::new().with_black_point(1.5);
    }
}
