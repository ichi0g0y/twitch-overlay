//! Image rotation utilities for thermal printer output.
//!
//! Provides 180-degree rotation and automatic portrait orientation.

use image::DynamicImage;
use tracing::debug;

/// Rotate an image 180 degrees.
///
/// This is equivalent to flipping both horizontally and vertically.
pub fn rotate_180(img: &DynamicImage) -> DynamicImage {
    let (w, h) = (img.width(), img.height());
    debug!(w, h, "Rotating image 180 degrees");
    img.rotate180()
}

/// Automatically rotate a landscape image to portrait orientation.
///
/// If the image is wider than it is tall (landscape), rotates it 90 degrees
/// clockwise to make it portrait. Portrait or square images are returned unchanged.
pub fn auto_rotate_portrait(img: &DynamicImage) -> DynamicImage {
    let (w, h) = (img.width(), img.height());

    if w > h {
        debug!(w, h, "Landscape image detected, rotating to portrait");
        img.rotate90()
    } else {
        debug!(
            w,
            h, "Image is already portrait or square, no rotation needed"
        );
        img.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{GenericImageView, GrayImage, Luma, Pixel};

    /// Create a test image with unique pixel values at corners.
    /// Top-left=10, Top-right=20, Bottom-left=30, Bottom-right=40
    fn create_corner_image(width: u32, height: u32) -> DynamicImage {
        let mut img = GrayImage::from_pixel(width, height, Luma([128]));
        img.put_pixel(0, 0, Luma([10])); // top-left
        img.put_pixel(width - 1, 0, Luma([20])); // top-right
        img.put_pixel(0, height - 1, Luma([30])); // bottom-left
        img.put_pixel(width - 1, height - 1, Luma([40])); // bottom-right
        DynamicImage::ImageLuma8(img)
    }

    fn pixel_value(img: &DynamicImage, x: u32, y: u32) -> u8 {
        img.to_luma8().get_pixel(x, y).channels()[0]
    }

    #[test]
    fn test_rotate_180_corner_values() {
        let img = create_corner_image(4, 4);
        let rotated = rotate_180(&img);

        assert_eq!(rotated.dimensions(), (4, 4));

        // After 180 rotation, corners swap diagonally
        assert_eq!(pixel_value(&rotated, 0, 0), 40); // was bottom-right
        assert_eq!(pixel_value(&rotated, 3, 0), 30); // was bottom-left
        assert_eq!(pixel_value(&rotated, 0, 3), 20); // was top-right
        assert_eq!(pixel_value(&rotated, 3, 3), 10); // was top-left
    }

    #[test]
    fn test_rotate_180_preserves_dimensions() {
        let img = create_corner_image(10, 20);
        let rotated = rotate_180(&img);
        assert_eq!(rotated.dimensions(), (10, 20));
    }

    #[test]
    fn test_rotate_180_is_involution() {
        let img = create_corner_image(5, 7);
        let double_rotated = rotate_180(&rotate_180(&img));

        // Rotating 180 twice should return to the original
        for y in 0..7 {
            for x in 0..5 {
                assert_eq!(
                    pixel_value(&img, x, y),
                    pixel_value(&double_rotated, x, y),
                    "Mismatch at ({x}, {y})"
                );
            }
        }
    }

    #[test]
    fn test_auto_rotate_landscape_to_portrait() {
        let img = create_corner_image(8, 4); // landscape: width > height
        let result = auto_rotate_portrait(&img);

        // Should be rotated: width and height swap
        assert_eq!(result.width(), 4);
        assert_eq!(result.height(), 8);
    }

    #[test]
    fn test_auto_rotate_portrait_unchanged() {
        let img = create_corner_image(4, 8); // portrait: height > width
        let result = auto_rotate_portrait(&img);

        // Should remain unchanged
        assert_eq!(result.dimensions(), (4, 8));
        assert_eq!(pixel_value(&result, 0, 0), 10);
    }

    #[test]
    fn test_auto_rotate_square_unchanged() {
        let img = create_corner_image(5, 5); // square
        let result = auto_rotate_portrait(&img);

        // Square images should remain unchanged
        assert_eq!(result.dimensions(), (5, 5));
        assert_eq!(pixel_value(&result, 0, 0), 10);
    }

    #[test]
    fn test_auto_rotate_landscape_corner_values() {
        let img = create_corner_image(6, 3); // landscape
        let result = auto_rotate_portrait(&img);

        assert_eq!(result.dimensions(), (3, 6));

        // After 90-degree clockwise rotation:
        // Original top-left (0,0)=10 -> new (height-1, 0) = (2, 0)
        // Original top-right (5,0)=20 -> new (2, 5)
        // Original bottom-left (0,2)=30 -> new (0, 0)
        // Original bottom-right (5,2)=40 -> new (0, 5)
        assert_eq!(pixel_value(&result, 2, 0), 10);
        assert_eq!(pixel_value(&result, 2, 5), 20);
        assert_eq!(pixel_value(&result, 0, 0), 30);
        assert_eq!(pixel_value(&result, 0, 5), 40);
    }
}
