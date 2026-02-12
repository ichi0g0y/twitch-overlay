//! Image resizing utilities for thermal printer output.
//!
//! Provides aspect-ratio-preserving resize operations using Lanczos3 filtering.

use image::DynamicImage;
use image::imageops::FilterType;
use tracing::debug;

/// Resize an image to a target width while maintaining aspect ratio.
///
/// Uses Lanczos3 filtering for high-quality downsampling.
/// Returns the original image unchanged if it already matches the target width.
pub fn resize_to_width(img: &DynamicImage, width: u32) -> DynamicImage {
    let (orig_w, orig_h) = (img.width(), img.height());

    if orig_w == width {
        debug!(width, "Image already at target width, skipping resize");
        return img.clone();
    }

    let ratio = f64::from(width) / f64::from(orig_w);
    let new_height = (f64::from(orig_h) * ratio).round() as u32;
    let new_height = new_height.max(1);

    debug!(
        orig_w,
        orig_h,
        new_width = width,
        new_height,
        "Resizing image to target width"
    );

    img.resize_exact(width, new_height, FilterType::Lanczos3)
}

/// Resize an image to a target height while maintaining aspect ratio.
///
/// Uses Lanczos3 filtering for high-quality downsampling.
/// Returns the original image unchanged if it already matches the target height.
pub fn resize_to_height(img: &DynamicImage, height: u32) -> DynamicImage {
    let (orig_w, orig_h) = (img.width(), img.height());

    if orig_h == height {
        debug!(height, "Image already at target height, skipping resize");
        return img.clone();
    }

    let ratio = f64::from(height) / f64::from(orig_h);
    let new_width = (f64::from(orig_w) * ratio).round() as u32;
    let new_width = new_width.max(1);

    debug!(
        orig_w,
        orig_h,
        new_width,
        new_height = height,
        "Resizing image to target height"
    );

    img.resize_exact(new_width, height, FilterType::Lanczos3)
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{GrayImage, Luma};

    /// Create a test DynamicImage with given dimensions.
    fn create_test_image(width: u32, height: u32) -> DynamicImage {
        let gray = GrayImage::from_pixel(width, height, Luma([128]));
        DynamicImage::ImageLuma8(gray)
    }

    #[test]
    fn test_resize_to_width_downscale() {
        let img = create_test_image(800, 600);
        let result = resize_to_width(&img, 400);
        assert_eq!(result.width(), 400);
        assert_eq!(result.height(), 300);
    }

    #[test]
    fn test_resize_to_width_upscale() {
        let img = create_test_image(200, 100);
        let result = resize_to_width(&img, 400);
        assert_eq!(result.width(), 400);
        assert_eq!(result.height(), 200);
    }

    #[test]
    fn test_resize_to_width_same_width() {
        let img = create_test_image(384, 500);
        let result = resize_to_width(&img, 384);
        assert_eq!(result.width(), 384);
        assert_eq!(result.height(), 500);
    }

    #[test]
    fn test_resize_to_width_paper_width() {
        let img = create_test_image(1920, 1080);
        let result = resize_to_width(&img, crate::PAPER_WIDTH);
        assert_eq!(result.width(), 384);
        // 1080 * (384/1920) = 216
        assert_eq!(result.height(), 216);
    }

    #[test]
    fn test_resize_to_height_downscale() {
        let img = create_test_image(800, 600);
        let result = resize_to_height(&img, 300);
        assert_eq!(result.height(), 300);
        assert_eq!(result.width(), 400);
    }

    #[test]
    fn test_resize_to_height_upscale() {
        let img = create_test_image(200, 100);
        let result = resize_to_height(&img, 400);
        assert_eq!(result.height(), 400);
        assert_eq!(result.width(), 800);
    }

    #[test]
    fn test_resize_to_height_same_height() {
        let img = create_test_image(384, 500);
        let result = resize_to_height(&img, 500);
        assert_eq!(result.height(), 500);
        assert_eq!(result.width(), 384);
    }

    #[test]
    fn test_resize_preserves_non_zero_dimensions() {
        // Very wide, very short image
        let img = create_test_image(1000, 1);
        let result = resize_to_width(&img, 10);
        assert_eq!(result.width(), 10);
        assert!(result.height() >= 1, "Height should be at least 1");
    }

    #[test]
    fn test_resize_to_height_preserves_non_zero_dimensions() {
        // Very tall, very narrow image
        let img = create_test_image(1, 1000);
        let result = resize_to_height(&img, 10);
        assert_eq!(result.height(), 10);
        assert!(result.width() >= 1, "Width should be at least 1");
    }
}
