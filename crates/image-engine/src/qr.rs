//! QR code generation for thermal printer images.

use image::{DynamicImage, GrayImage, Luma};
use qrcode::QrCode;

/// Generate a QR code image from a URL or text string.
///
/// Returns a grayscale image sized to `target_width` pixels.
pub fn generate_qr(data: &str, target_width: u32) -> Result<DynamicImage, String> {
    let code = QrCode::new(data.as_bytes()).map_err(|e| format!("QR encode error: {e}"))?;
    let modules = code.to_colors();
    let module_count = code.width() as u32;

    let scale = target_width / module_count;
    let scale = scale.max(1);
    let img_size = module_count * scale;

    let mut img = GrayImage::from_pixel(img_size, img_size, Luma([255u8]));

    for (i, color) in modules.iter().enumerate() {
        let x = (i as u32) % module_count;
        let y = (i as u32) / module_count;

        if *color == qrcode::Color::Dark {
            for dx in 0..scale {
                for dy in 0..scale {
                    img.put_pixel(x * scale + dx, y * scale + dy, Luma([0u8]));
                }
            }
        }
    }

    Ok(DynamicImage::ImageLuma8(img))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generate_qr_produces_image() {
        let img = generate_qr("https://example.com", 200).unwrap();
        assert!(img.width() > 0);
        assert_eq!(img.width(), img.height());
    }

    #[test]
    fn generate_qr_empty_string_still_works() {
        let img = generate_qr("test", 100).unwrap();
        assert!(img.width() > 0);
    }
}
