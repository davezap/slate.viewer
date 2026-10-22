//! The red number on Slate Viewer's taskbar button: how many published files the person still
//! has to read in the window's space (see policies.ts). Windows has no badge count, so the number
//! is drawn into a small overlay icon; macOS and Linux take the count itself.

use tauri::WebviewWindow;

#[tauri::command]
pub fn set_attention_badge(window: WebviewWindow, count: u32) -> Result<(), String> {
    #[cfg(windows)]
    {
        let icon = (count > 0).then(|| tauri::image::Image::new_owned(badge_pixels(count), SIZE, SIZE));
        window.set_overlay_icon(icon).map_err(|e| e.to_string())
    }
    #[cfg(not(windows))]
    {
        window.set_badge_count((count > 0).then_some(i64::from(count))).map_err(|e| e.to_string())
    }
}

/// The overlay is drawn at 32×32; Windows scales it to the taskbar's small icon size.
#[cfg_attr(not(windows), allow(dead_code))]
const SIZE: u32 = 32;

/// 5×7 glyphs, one row per byte, the five low bits left to right.
#[cfg_attr(not(windows), allow(dead_code))]
fn glyph(c: char) -> [u8; 7] {
    match c {
        '0' => [0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e],
        '1' => [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
        '2' => [0x0e, 0x11, 0x01, 0x02, 0x04, 0x08, 0x1f],
        '3' => [0x1f, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0e],
        '4' => [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02],
        '5' => [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e],
        '6' => [0x06, 0x08, 0x10, 0x1e, 0x11, 0x11, 0x0e],
        '7' => [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
        '8' => [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e],
        '9' => [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x02, 0x0c],
        _ => [0x00, 0x04, 0x04, 0x1f, 0x04, 0x04, 0x00], // '+'
    }
}

/// RGBA pixels of a red disc with a white ring and `count` in white ("99+" above 99).
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn badge_pixels(count: u32) -> Vec<u8> {
    let size = SIZE as usize;
    let mut rgba = vec![0u8; size * size * 4];
    let centre = SIZE as f32 / 2.0;
    const RED: [f32; 3] = [217.0, 48.0, 37.0];
    for y in 0..size {
        for x in 0..size {
            let d = ((x as f32 + 0.5 - centre).powi(2) + (y as f32 + 0.5 - centre).powi(2)).sqrt();
            let outer = (centre - d).clamp(0.0, 1.0);
            let inner = (centre - 1.5 - d).clamp(0.0, 1.0);
            let i = (y * size + x) * 4;
            for c in 0..3 {
                rgba[i + c] = (255.0 + (RED[c] - 255.0) * inner).round() as u8;
            }
            rgba[i + 3] = (outer * 255.0).round() as u8;
        }
    }

    let text = if count > 99 { "99+".to_string() } else { count.to_string() };
    let chars: Vec<char> = text.chars().collect();
    let width = chars.len() * 6 - 1;
    let scale = if width * 2 <= 24 { 2 } else { 1 };
    let left = (size - width * scale) / 2;
    let top = (size - 7 * scale) / 2;
    for (n, c) in chars.iter().enumerate() {
        for (row, bits) in glyph(*c).iter().enumerate() {
            for col in 0..5 {
                if bits & (0x10 >> col) == 0 {
                    continue;
                }
                for dy in 0..scale {
                    for dx in 0..scale {
                        let x = left + (n * 6 + col) * scale + dx;
                        let y = top + row * scale + dy;
                        let i = (y * size + x) * 4;
                        rgba[i..i + 4].copy_from_slice(&[255, 255, 255, 255]);
                    }
                }
            }
        }
    }
    rgba
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pixel(rgba: &[u8], x: usize, y: usize) -> [u8; 4] {
        let i = (y * SIZE as usize + x) * 4;
        [rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]]
    }

    #[test]
    fn draws_a_red_disc_with_a_white_number() {
        let rgba = badge_pixels(7);
        assert_eq!(rgba.len(), 32 * 32 * 4);
        assert_eq!(pixel(&rgba, 0, 0)[3], 0, "corners are transparent");
        assert_eq!(pixel(&rgba, 4, 16), [217, 48, 37, 255], "inside is red");
        // The ring is white too, so count only the middle, well inside it.
        let white = (8..24).flat_map(|y| (8..24).map(move |x| (x, y))).filter(|&(x, y)| pixel(&rgba, x, y) == [255, 255, 255, 255]).count();
        assert!(white > 20, "the digit is drawn");
        assert!(white < 16 * 16 / 2, "and the rest is red");
    }

    #[test]
    fn fits_larger_counts() {
        for count in [10, 99, 100, 5000] {
            assert_eq!(badge_pixels(count).len(), 32 * 32 * 4);
        }
    }
}
