//! Tells a window when its document changes on disk (edited elsewhere, replaced or deleted).
//!
//! The folder is watched rather than the file, because many editors (and our own
//! save) write a temporary file and rename it over the original. The frontend
//! re-reads the file and compares contents, so our own saves are ignored there.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use notify::event::ModifyKind;
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter, EventTarget, Manager, WebviewWindow};

#[derive(Default)]
pub struct DocumentWatchers(Mutex<HashMap<String, RecommendedWatcher>>);

fn same_path(a: &Path, b: &Path) -> bool {
    if cfg!(windows) {
        a.to_string_lossy().to_lowercase() == b.to_string_lossy().to_lowercase()
    } else {
        a == b
    }
}

/// Starts watching `path` for this window, replacing any earlier watch. `None` stops watching.
#[tauri::command]
pub fn watch_document(window: WebviewWindow, path: Option<String>) -> Result<(), String> {
    let label = window.label().to_string();
    let watchers = window.state::<DocumentWatchers>();
    let mut watchers = watchers.0.lock().unwrap();
    watchers.remove(&label);

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
    watchers.insert(label, watcher);
    Ok(())
}

/// Starts watching a folder-mode root for files being added, removed or renamed. `None` stops.
#[tauri::command]
pub fn watch_folder(window: WebviewWindow, root: Option<String>) -> Result<(), String> {
    let label = window.label().to_string();
    let key = folder_key(&label);
    let watchers = window.state::<DocumentWatchers>();
    let mut watchers = watchers.0.lock().unwrap();
    watchers.remove(&key);

    let Some(root) = root.map(PathBuf::from) else { return Ok(()) };
    let app = window.app_handle().clone();
    let mut watcher = notify::recommended_watcher(move |result: notify::Result<notify::Event>| {
        let Ok(event) = result else { return };
        let structural = matches!(
            event.kind,
            EventKind::Create(_) | EventKind::Remove(_) | EventKind::Modify(ModifyKind::Name(_)) | EventKind::Any
        );
        let relevant = event.paths.iter().any(|p| crate::workspace::is_markdown(p) || p.extension().is_none());
        if structural && relevant {
            let _ = app.emit_to(EventTarget::webview_window(&label), "folder-changed", ());
        }
    })
    .map_err(|e| e.to_string())?;
    watcher.watch(&root, RecursiveMode::Recursive).map_err(|e| e.to_string())?;
    watchers.insert(key, watcher);
    Ok(())
}

fn folder_key(label: &str) -> String {
    format!("{label}#folder")
}

pub fn forget_window(app: &AppHandle, label: &str) {
    let watchers = app.state::<DocumentWatchers>();
    let mut watchers = watchers.0.lock().unwrap();
    watchers.remove(label);
    watchers.remove(&folder_key(label));
}
