//! A small fault log in the app's log folder: panics, script errors and slow or failed folder work,
//! so a crash or a hang leaves something to look at. Help > Open Log Folder shows it.
//!
//! Windows: %LOCALAPPDATA%\davezap.slateviewer\logs\slate-viewer.log (the previous one beside it as
//! slate-viewer.old.log once it passes 1 MB).

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager};

const MAX_BYTES: u64 = 1024 * 1024;
const MAX_MESSAGE: usize = 4000;

static LOG_FILE: OnceLock<PathBuf> = OnceLock::new();
/// One writer at a time, so lines from different threads don't interleave.
static WRITING: Mutex<()> = Mutex::new(());

/// Finds the log folder and records panics there (release builds abort on a panic, so this hook
/// is the only trace one leaves).
pub fn init(app: &AppHandle) {
    let Ok(dir) = app.path().app_log_dir() else { return };
    let _ = fs::create_dir_all(&dir);
    let _ = LOG_FILE.set(dir.join("slate-viewer.log"));
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        write("panic", &info.to_string());
        previous(info);
    }));
    write("start", &format!("Slate Viewer {} on {} {}", app.package_info().version, std::env::consts::OS, std::env::consts::ARCH));
}

pub fn folder() -> Option<PathBuf> {
    LOG_FILE.get().and_then(|file| file.parent()).map(PathBuf::from)
}

/// Appends one entry. Never fails: a log that can't be written is skipped.
pub fn write(kind: &str, message: &str) {
    let Some(file) = LOG_FILE.get() else { return };
    let _guard = WRITING.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    if fs::metadata(file).is_ok_and(|m| m.len() > MAX_BYTES) {
        let _ = fs::rename(file, file.with_extension("old.log"));
    }
    let mut message = message.trim().to_string();
    if let Some((cut, _)) = message.char_indices().nth(MAX_MESSAGE) {
        message.truncate(cut);
        message.push('…');
    }
    if let Ok(mut out) = OpenOptions::new().create(true).append(true).open(file) {
        let _ = writeln!(out, "{} [{kind}] {}", timestamp(), message.replace('\n', "\n    "));
    }
}

/// An error or warning from the window's script (uncaught errors, failed actions).
#[tauri::command(async)]
pub fn log_fault(kind: String, message: String) {
    let kind: String = kind.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-').take(20).collect();
    write(if kind.is_empty() { "script" } else { &kind }, &message);
}

#[tauri::command(async)]
pub fn open_log_folder(app: AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let dir = folder().ok_or("Slate Viewer has no log folder.")?;
    app.opener().open_path(dir.to_string_lossy(), None::<&str>).map_err(|e| e.to_string())
}

/// Shows or hides the Chromium (WebView2) developer tools for the window.
#[tauri::command(async)]
pub fn toggle_devtools(window: tauri::WebviewWindow) {
    if window.is_devtools_open() {
        window.close_devtools();
    } else {
        window.open_devtools();
    }
}

/// UTC, like 2026-10-20 09:15:02Z.
fn timestamp() -> String {
    let secs = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    let (days, rest) = (secs / 86_400, secs % 86_400);
    let (y, m, d) = civil_from_days(days as i64);
    format!("{y:04}-{m:02}-{d:02} {:02}:{:02}:{:02}Z", rest / 3600, rest % 3600 / 60, rest % 60)
}

/// Days since 1970-01-01 to a calendar date (Howard Hinnant's algorithm).
fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (yoe + era * 400 + i64::from(m <= 2), m, d)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_days_to_dates() {
        assert_eq!(civil_from_days(0), (1970, 1, 1));
        assert_eq!(civil_from_days(20_746), (2026, 10, 20));
        assert_eq!(civil_from_days(11_016), (2000, 2, 29));
    }
}
