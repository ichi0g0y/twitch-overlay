//! Image composition utilities — overlay, concatenate, and merge images.

use image::{DynamicImage, RgbaImage};

/// Overlay `top` image onto `base` at the given position.
///
/// The `top` image is alpha-composited over the base.
pub fn overlay(base: &mut RgbaImage, top: &DynamicImage, x: u32, y: u32) {
    let top_rgba = top.to_rgba8();
    for (dx, dy, pixel) in top_rgba.enumerate_pixels() {
        let target_x = x + dx;
        let target_y = y + dy;
        if target_x < base.width() && target_y < base.height() {
            let alpha = pixel[3] as f32 / 255.0;
            if alpha > 0.99 {
                base.put_pixel(target_x, target_y, *pixel);
            } else if alpha > 0.01 {
                let bg = base.get_pixel(target_x, target_y);
                let blended = blend_pixel(bg, pixel, alpha);
                base.put_pixel(target_x, target_y, blended);
            }
        }
    }
}

/// Concatenate images vertically (top to bottom).
///
/// All images are left-aligned. The output width equals the maximum width.
pub fn concat_vertical(images: &[DynamicImage]) -> DynamicImage {
    if images.is_empty() {
        return DynamicImage::ImageRgba8(RgbaImage::new(1, 1));
    }

    let max_width = images.iter().map(|i| i.width()).max().unwrap_or(1);
    let total_height: u32 = images.iter().map(|i| i.height()).sum();

    let mut result =
        RgbaImage::from_pixel(max_width, total_height, image::Rgba([255, 255, 255, 255]));

    let mut y_offset = 0u32;
    for img in images {
        let rgba = img.to_rgba8();
        for (x, y, pixel) in rgba.enumerate_pixels() {
            if x < max_width && y_offset + y < total_height {
                result.put_pixel(x, y_offset + y, *pixel);
            }
        }
        y_offset += img.height();
    }

    DynamicImage::ImageRgba8(result)
}

fn blend_pixel(bg: &image::Rgba<u8>, fg: &image::Rgba<u8>, alpha: f32) -> image::Rgba<u8> {
    let inv = 1.0 - alpha;
    image::Rgba([
        (fg[0] as f32 * alpha + bg[0] as f32 * inv) as u8,
        (fg[1] as f32 * alpha + bg[1] as f32 * inv) as u8,
        (fg[2] as f32 * alpha + bg[2] as f32 * inv) as u8,
        255,
    ])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn concat_vertical_sums_heights() {
        let img1 = DynamicImage::ImageRgba8(RgbaImage::new(100, 50));
        let img2 = DynamicImage::ImageRgba8(RgbaImage::new(100, 30));
        let result = concat_vertical(&[img1, img2]);
        assert_eq!(result.width(), 100);
        assert_eq!(result.height(), 80);
    }

    #[test]
    fn concat_vertical_uses_max_width() {
        let img1 = DynamicImage::ImageRgba8(RgbaImage::new(200, 50));
        let img2 = DynamicImage::ImageRgba8(RgbaImage::new(100, 30));
        let result = concat_vertical(&[img1, img2]);
        assert_eq!(result.width(), 200);
    }

    #[test]
    fn overlay_does_not_panic_on_out_of_bounds() {
        let mut base = RgbaImage::new(100, 100);
        let top = DynamicImage::ImageRgba8(RgbaImage::new(50, 50));
        overlay(&mut base, &top, 80, 80); // partially out of bounds
    }
}
