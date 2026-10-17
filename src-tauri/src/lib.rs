mod documents;
mod mtsync;
mod updates;
mod watcher;
mod workspace;

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};

use tauri::window::Color;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_window_state::StateFlags;

static WINDOW_COUNTER: AtomicUsize = AtomicUsize::new(0);

fn to_json(path: Option<PathBuf>) -> String {
    serde_json::to_string(&path.map(|p| p.to_string_lossy().into_owned())).unwrap_or_else(|_| "null".into())
}

/// Opens a new editor window, optionally loading `path` into it and showing `folder` in the sidebar.
/// `launched` is true when the path came from a command line (Explorer's Open / Open in Slate Viewer),
/// which opens it for reading: read only, with the sidebar sections closed.
pub(crate) fn open_document_window(app: &AppHandle, path: Option<PathBuf>, folder: Option<PathBuf>, launched: bool) -> tauri::Result<()> {
    if let Some(path) = &path {
        documents::allow_document_folder(app, path);
    }
    let label = format!("doc-{}", WINDOW_COUNTER.fetch_add(1, Ordering::SeqCst));
    let init = format!(
        "window.__SLATE_VIEWER_INITIAL_FILE__ = {}; window.__SLATE_VIEWER_INITIAL_FOLDER__ = {}; window.__SLATE_VIEWER_LAUNCHED__ = {};",
        to_json(path),
        to_json(folder),
        launched
    );
    WebviewWindowBuilder::new(app, label, WebviewUrl::App("index.html".into()))
        .title("Slate Viewer")
        .inner_size(1100.0, 800.0)
        .min_inner_size(480.0, 360.0)
        // The app draws its own title bar (menus, back/forward, window buttons) except on macOS.
        .decorations(cfg!(target_os = "macos"))
        // Let Slate receive HTML5 file drops (paste/drop attachments).
        .disable_drag_drop_handler()
        // Start hidden on a dark background; App.svelte shows the window once the saved theme
        // is applied, so it never flashes white on a dark desktop.
        .visible(false)
        .background_color(Color(0x17, 0x18, 0x1c, 0xff))
        .initialization_script(init)
        .build()?;
    Ok(())
}

/// Files or folders named on a command line (first launch or a second instance), resolved against `cwd`.
fn paths_from_args(args: &[String], cwd: &Path) -> Vec<PathBuf> {
    args.iter()
        .skip(1)
        .filter(|arg| !arg.starts_with('-'))
        // Explorer passes a drive root as "C:\" and Windows' quoting turns that into C:" .
        .map(|arg| arg.trim_end_matches('"'))
        .filter(|arg| !arg.is_empty())
        .map(|arg| {
            let arg = if arg.len() == 2 && arg.ends_with(':') { format!("{arg}\\") } else { arg.to_string() };
            let path = PathBuf::from(arg);
            if path.is_absolute() { path } else { cwd.join(path) }
        })
        .collect()
}

/// A folder argument opens folder mode; a file argument opens that file.
fn open_from_arg(app: &AppHandle, path: PathBuf) -> tauri::Result<()> {
    if path.is_dir() {
        open_document_window(app, None, Some(path), true)
    } else {
        open_document_window(app, Some(path), None, true)
    }
}

#[tauri::command]
fn open_window(app: AppHandle, path: Option<String>, folder: Option<String>) -> Result<(), String> {
    open_document_window(&app, path.map(PathBuf::from), folder.map(PathBuf::from), false).map_err(|e| e.to_string())
}

/// Opens Windows Settings at Slate Viewer's Default Apps page (the installer registers it there).
/// Windows 10/11 only let the user choose a default app, so this is as far as an app can go.
#[tauri::command]
fn open_default_apps_settings(app: AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_url("ms-settings:defaultapps?registeredAppUser=SlateViewer", None::<&str>)
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            let paths = paths_from_args(&args, Path::new(&cwd));
            if paths.is_empty() {
                if let Some(window) = app.webview_windows().values().next() {
                    let _ = window.set_focus();
                }
                return;
            }
            for path in paths {
                let _ = open_from_arg(app, path);
            }
        }))
        .plugin(
            tauri_plugin_window_state::Builder::default()
                // Decorations are decided by the app (see open_document_window), not remembered.
                // Visibility neither: windows start hidden until the theme is applied.
                .with_state_flags(StateFlags::all() & !StateFlags::DECORATIONS & !StateFlags::VISIBLE)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            open_window,
            open_default_apps_settings,
            documents::read_document,
            documents::write_document,
            documents::save_attachment,
            documents::delete_conflict_copy,
            watcher::watch_document,
            watcher::watch_folder,
            workspace::list_folder,
            workspace::search_folder,
            workspace::create_note,
            workspace::folder_descriptions,
            mtsync::mtsync_info,
            mtsync::mtsync_spaces,
            mtsync::mtsync_list,
            mtsync::mtsync_add,
            mtsync::mtsync_start,
            mtsync::mtsync_log,
            mtsync::mtsync_history,
            mtsync::mtsync_show,
            mtsync::mtsync_login,
            mtsync::mtsync_cancel_login,
            updates::mtsync_setup,
            updates::check_for_updates,
        ])
        .manage(watcher::DocumentWatchers::default())
        .manage(mtsync::Mtsync::default())
        .manage(updates::Updates::default())
        .on_window_event(|window, event| {
            if let WindowEvent::Destroyed = event {
                watcher::forget_window(window.app_handle(), window.label());
            }
        })
        .setup(|app| {
            updates::start(app.handle());
            let cwd = std::env::current_dir().unwrap_or_default();
            let args: Vec<String> = std::env::args().collect();
            let paths = paths_from_args(&args, &cwd);
            if paths.is_empty() {
                open_document_window(app.handle(), None, None, false)?;
            }
            for path in paths {
                open_from_arg(app.handle(), path)?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Slate Viewer");
}
