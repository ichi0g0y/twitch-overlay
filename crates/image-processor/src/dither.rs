//! Dithering algorithms for converting grayscale images to black-and-white.
//!
//! Provides Floyd-Steinberg error-diffusion dithering and simple threshold conversion.

use image::GrayImage;
use tracing::debug;

/// Default threshold value for binarization.
const THRESHOLD: u8 = 128;

/// Apply Floyd-Steinberg dithering to a grayscale image.
///
/// Converts a grayscale image to black-and-white using error-diffusion dithering.
/// Error distribution pattern:
/// - Right:        7/16
/// - Bottom-left:  3/16
/// - Bottom:       5/16
/// - Bottom-right: 1/16
pub fn floyd_steinberg_dither(img: &GrayImage) -> GrayImage {
    let (width, height) = img.dimensions();
    debug!(width, height, "Applying Floyd-Steinberg dithering");

    // Work with i16 buffer to handle error diffusion overflow
    let mut buffer: Vec<Vec<i16>> = (0..height)
        .map(|y| {
            (0..width)
                .map(|x| i16::from(img.get_pixel(x, y).0[0]))
                .collect()
        })
        .collect();

    for y in 0..height {
        for x in 0..width {
            let old_pixel = buffer[y as usize][x as usize];
            let new_pixel: i16 = if old_pixel >= i16::from(THRESHOLD) {
                255
            } else {
                0
            };
            let error = old_pixel - new_pixel;
            buffer[y as usize][x as usize] = new_pixel;

            distribute_error(&mut buffer, x, y, width, height, error);
        }
    }

    let mut output = GrayImage::new(width, height);
    for y in 0..height {
        for x in 0..width {
            let val = buffer[y as usize][x as usize].clamp(0, 255) as u8;
            output.put_pixel(x, y, image::Luma([val]));
        }
    }

    debug!("Floyd-Steinberg dithering complete");
    output
}

/// Distribute quantization error to neighboring pixels.
fn distribute_error(
    buffer: &mut [Vec<i16>],
    x: u32,
    y: u32,
    width: u32,
    height: u32,
    error: i16,
) {
    let xu = x as usize;
    let yu = y as usize;

    // Right: 7/16
    if x + 1 < width {
        buffer[yu][xu + 1] += error * 7 / 16;
    }
    // Bottom-left: 3/16
    if x > 0 && y + 1 < height {
        buffer[yu + 1][xu - 1] += error * 3 / 16;
    }
    // Bottom: 5/16
    if y + 1 < height {
        buffer[yu + 1][xu] += error * 5 / 16;
    }
    // Bottom-right: 1/16
    if x + 1 < width && y + 1 < height {
        buffer[yu + 1][xu + 1] += error / 16;
    }
}

/// Simple threshold conversion without dithering.
///
/// Pixels with values >= `threshold` become white (255), others become black (0).
pub fn threshold_convert(img: &GrayImage, threshold: u8) -> GrayImage {
    let (width, height) = img.dimensions();
    debug!(width, height, threshold, "Applying threshold conversion");

    let mut output = GrayImage::new(width, height);
    for y in 0..height {
        for x in 0..width {
            let val = img.get_pixel(x, y).0[0];
            let new_val = if val >= threshold { 255 } else { 0 };
            output.put_pixel(x, y, image::Luma([new_val]));
        }
    }

    output
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Create a small test image with a gradient pattern.
    fn create_gradient_image(width: u32, height: u32) -> GrayImage {
        let mut img = GrayImage::new(width, height);
        for y in 0..height {
            for x in 0..width {
                let val = ((x + y) * 255 / (width + height - 2)) as u8;
                img.put_pixel(x, y, image::Luma([val]));
            }
        }
        img
    }

    #[test]
    fn test_floyd_steinberg_output_is_binary() {
        let img = create_gradient_image(8, 8);
        let result = floyd_steinberg_dither(&img);

        // Every pixel must be either 0 or 255
        for y in 0..result.height() {
            for x in 0..result.width() {
                let val = result.get_pixel(x, y).0[0];
                assert!(
                    val == 0 || val == 255,
                    "Pixel ({x}, {y}) = {val}, expected 0 or 255"
                );
            }
        }
    }

    #[test]
    fn test_floyd_steinberg_preserves_dimensions() {
        let img = create_gradient_image(10, 5);
        let result = floyd_steinberg_dither(&img);
        assert_eq!(result.dimensions(), (10, 5));
    }

    #[test]
    fn test_floyd_steinberg_all_white_input() {
        let img = GrayImage::from_pixel(4, 4, image::Luma([255]));
        let result = floyd_steinberg_dither(&img);
        for y in 0..4 {
            for x in 0..4 {
                assert_eq!(result.get_pixel(x, y).0[0], 255);
            }
        }
    }

    #[test]
    fn test_floyd_steinberg_all_black_input() {
        let img = GrayImage::from_pixel(4, 4, image::Luma([0]));
        let result = floyd_steinberg_dither(&img);
        for y in 0..4 {
            for x in 0..4 {
                assert_eq!(result.get_pixel(x, y).0[0], 0);
            }
        }
    }

    #[test]
    fn test_floyd_steinberg_known_3x3() {
        // 3x3 image with specific values to verify error diffusion
        let mut img = GrayImage::new(3, 3);
        let pixels: [[u8; 3]; 3] = [
            [100, 150, 200],
            [50, 127, 250],
            [0, 80, 160],
        ];
        for (y, row) in pixels.iter().enumerate() {
            for (x, &val) in row.iter().enumerate() {
                img.put_pixel(x as u32, y as u32, image::Luma([val]));
            }
        }

        let result = floyd_steinberg_dither(&img);

        // Verify all output pixels are binary
        for y in 0..3u32 {
            for x in 0..3u32 {
                let val = result.get_pixel(x, y).0[0];
                assert!(val == 0 || val == 255);
            }
        }

        // Top-left pixel (100) is below threshold -> should be 0
        assert_eq!(result.get_pixel(0, 0).0[0], 0);
        // Top-right pixel (200) is above threshold -> should be 255
        assert_eq!(result.get_pixel(2, 0).0[0], 255);
    }

    #[test]
    fn test_threshold_convert_basic() {
        let mut img = GrayImage::new(4, 1);
        img.put_pixel(0, 0, image::Luma([0]));
        img.put_pixel(1, 0, image::Luma([127]));
        img.put_pixel(2, 0, image::Luma([128]));
        img.put_pixel(3, 0, image::Luma([255]));

        let result = threshold_convert(&img, 128);

        assert_eq!(result.get_pixel(0, 0).0[0], 0);
        assert_eq!(result.get_pixel(1, 0).0[0], 0);
        assert_eq!(result.get_pixel(2, 0).0[0], 255);
        assert_eq!(result.get_pixel(3, 0).0[0], 255);
    }

    #[test]
    fn test_threshold_convert_preserves_dimensions() {
        let img = GrayImage::new(7, 3);
        let result = threshold_convert(&img, 128);
        assert_eq!(result.dimensions(), (7, 3));
    }

    #[test]
    fn test_threshold_convert_custom_threshold() {
        let mut img = GrayImage::new(3, 1);
        img.put_pixel(0, 0, image::Luma([49]));
        img.put_pixel(1, 0, image::Luma([50]));
        img.put_pixel(2, 0, image::Luma([51]));

        let result = threshold_convert(&img, 50);

        assert_eq!(result.get_pixel(0, 0).0[0], 0);
        assert_eq!(result.get_pixel(1, 0).0[0], 255);
        assert_eq!(result.get_pixel(2, 0).0[0], 255);
    }
}
