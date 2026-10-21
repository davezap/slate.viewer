//! Tells a window when its document changes on disk (edited elsewhere, replaced or deleted).
//!
//! The folder is watched rather than the file, because many editors (and our own
//! save) write a temporary file and rename it over the original. The frontend
//! re-reads the file and compares contents, so our own saves are ignored there.
//!
//! Watches are set up on a worker thread (`async` commands): starting one can wait on the disk
//! (a OneDrive folder, a network drive), and on the main thread that would freeze every window.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use notify::event::ModifyKind;
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter, EventTarget, Manager, WebviewWindow};

/// The watchers by key (a window label, or label#folder). Each key also counts its requests, so
/// a slow watch that finishes after a newer request for the same key is thrown away.
#[derive(Default)]
pub struct DocumentWatchers(Mutex<HashMap<String, Slot>>);

#[derive(Default)]
struct Slot {
    request: u64,
    watcher: Option<RecommendedWatcher>,
}

impl DocumentWatchers {
    /// Starts a new request for `key`, dropping its current watcher. Returns the request number.
    fn begin(&self, key: &str) -> u64 {
        let mut slots = self.0.lock().unwrap_or_else(|p| p.into_inner());
        let slot = slots.entry(key.to_string()).or_default();
        slot.request += 1;
        let request = slot.request;
        let old = slot.watcher.take();
        drop(slots);
        drop(old);
        request
    }

    /// Keeps `watcher` for `key` unless a newer request came in while it was being set up.
    fn finish(&self, key: &str, request: u64, watcher: RecommendedWatcher) {
        let mut slots = self.0.lock().unwrap_or_else(|p| p.into_inner());
        if let Some(slot) = slots.get_mut(key) {
            if slot.request == request {
                slot.watcher = Some(watcher);
                return;
            }
        }
        drop(slots);
        drop(watcher);
    }

    fn forget(&self, key: &str) {
        let removed = self.0.lock().unwrap_or_else(|p| p.into_inner()).remove(key);
        drop(removed);
    }
}

fn same_path(a: &Path, b: &Path) -> bool {
    if cfg!(windows) {
        a.to_string_lossy().to_lowercase() == b.to_string_lossy().to_lowercase()
    } else {
        a == b
    }
}

/// Starts watching `path` for this window, replacing any earlier watch. `None` stops watching.
#[tauri::command(async)]
pub fn watch_document(window: WebviewWindow, path: Option<String>) -> Result<(), String> {
    let label = window.label().to_string();
    let watchers = window.state::<DocumentWatchers>();
    let request = watchers.begin(&label);

    let Some(path) = path.map(PathBuf::from) else { return Ok(()) };
    let folder = path.parent().ok_or("The document has no folder.")?.to_path_buf();

    let app = window.app_handle().clone();
    let target_label = label.clone();
    let mut watcher = notify::recommended_watcher(move |result: notify::Result<notify::Event>| {
        let Ok(event) = result else { return };
        if matches!(event.kind, EventKind::Access(_)) {
            return;
        }
        if event.paths.iter().any(|changed| same_path(changed, &path)) {
            let _ = app.emit_to(EventTarget::webview_window(&target_label), "document-changed", ());
        }
    })
    .map_err(|e| e.to_string())?;
    watcher.watch(&folder, RecursiveMode::NonRecursive).map_err(|e| e.to_string())?;
    watchers.finish(&label, request, watcher);
    Ok(())
}

/// Starts watching a folder-mode root for files being added, removed or renamed. `None` stops.
#[tauri::command(async)]
pub fn watch_folder(window: WebviewWindow, root: Option<String>) -> Result<(), String> {
    let label = window.label().to_string();
    let key = folder_key(&label);
    let watchers = window.state::<DocumentWatchers>();
    let request = watchers.begin(&key);

    let Some(root) = root.map(PathBuf::from) else { return Ok(()) };
    let app = window.app_handle().clone();
    let watched = root.clone();
    let mut watcher = notify::recommended_watcher(move |result: notify::Result<notify::Event>| {
        let Ok(event) = result else { return };
        let structural = matches!(
            event.kind,
            EventKind::Create(_) | EventKind::Remove(_) | EventKind::Modify(ModifyKind::Name(_)) | EventKind::Any
        );
        // Builds and git (node_modules, target, .git…) change thousands of files the listing
        // never shows; re-listing for each burst kept the app busy. Other files count too:
        // the listing shows them when hidden files are shown.
        let relevant = event.paths.iter().any(|p| !crate::workspace::in_skipped_folder(&watched, p));
        if structural && relevant {
            let _ = app.emit_to(EventTarget::webview_window(&label), "folder-changed", ());
        }
    })
    .map_err(|e| e.to_string())?;
    if let Err(error) = watcher.watch(&root, RecursiveMode::Recursive) {
        crate::applog::write("watch", &format!("Could not watch {}: {error}", root.display()));
        return Err(error.to_string());
    }
    watchers.finish(&key, request, watcher);
    Ok(())
}

fn folder_key(label: &str) -> String {
    format!("{label}#folder")
}

pub fn forget_window(app: &AppHandle, label: &str) {
    let watchers = app.state::<DocumentWatchers>();
    watchers.forget(label);
    watchers.forget(&folder_key(label));
}
