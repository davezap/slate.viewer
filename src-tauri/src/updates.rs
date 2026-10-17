//! Keeping Slate Viewer and mtsync up to date, and setting mtsync up when it is missing.
//!
//! Three small JSON files drive it, all public:
//! - `mtsync.json` in the latest Metatrash release: mtsync's version and, per platform, its URL,
//!   SHA-256 and size. Slate Viewer installs mtsync from it (the first time a space is opened)
//!   and updates it.
//! - `slateviewer.json` in the latest Slate Viewer release: the same for the app's installers.
//! - The server's `/api/v1/tool-schema.json`: its `schemaVersion`, and in `clients` the oldest
//!   mtsync and Slate Viewer it works with. A server that needs a newer mtsync gets it at once;
//!   one that needs a newer Slate Viewer asks to update.
//!
//! The check runs shortly after launch and then twice a day, and from Help > Check for Updates.
//! Everything downloaded is checked against its SHA-256 before use.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_opener::OpenerExt;

use crate::mtsync::{self, DEFAULT_SERVER};

const MTSYNC_MANIFEST: &str = "https://github.com/davezap/metatrash/releases/latest/download/mtsync.json";
const VIEWER_MANIFEST: &str = "https://github.com/davezap/slate.viewer/releases/latest/download/slateviewer.json";
const SCHEMA_PATH: &str = "/api/v1/tool-schema.json";
const FIRST_CHECK: Duration = Duration::from_secs(15);
const CHECK_EVERY: Duration = Duration::from_secs(12 * 60 * 60);

type Version = (u32, u32, u32);

#[derive(Deserialize)]
struct Manifest {
    version: String,
    files: HashMap<String, Asset>,
}

#[derive(Deserialize, Clone)]
struct Asset {
    url: String,
    sha256: String,
    size: u64,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct Schema {
    schema_version: Option<String>,
    #[serde(default)]
    clients: Clients,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct Clients {
    mtsync: Option<ClientNeeds>,
    slate_viewer: Option<ClientNeeds>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClientNeeds {
    min_version: String,
}

/// What the app remembers between runs (`updates.json` in its config folder).
#[derive(Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct Saved {
    /// The Slate Viewer version the user chose "Later" for; not asked again unless required.
    skipped_version: Option<String>,
    /// The server's schemaVersion at the last check.
    schema_version: Option<String>,
}

/// One check at a time, so a manual check doesn't overlap the timer's.
#[derive(Default)]
pub struct Updates {
    busy: Mutex<bool>,
}

fn version(text: &str) -> Option<Version> {
    mtsync::parse_version(text)
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(concat!("SlateViewer/", env!("CARGO_PKG_VERSION")))
        .timeout(Duration::from_secs(300))
        .build()
        .map_err(|e| e.to_string())
}

async fn get_json<T: for<'de> Deserialize<'de>>(url: &str) -> Result<T, String> {
    let response = client()?.get(url).send().await.map_err(|e| format!("Could not reach {url}: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("{url} answered {}", response.status()));
    }
    response.json().await.map_err(|e| format!("Unexpected answer from {url}: {e}"))
}

/// Downloads `asset` and checks its size and SHA-256.
async fn download(asset: &Asset) -> Result<Vec<u8>, String> {
    let response = client()?.get(&asset.url).send().await.map_err(|e| format!("Download failed: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("Download failed: {} answered {}", asset.url, response.status()));
    }
    let bytes = response.bytes().await.map_err(|e| format!("Download failed: {e}"))?.to_vec();
    if bytes.len() as u64 != asset.size || !sha256_matches(&bytes, &asset.sha256) {
        return Err("The download didn't match its checksum, so nothing was installed.".into());
    }
    Ok(bytes)
}

fn sha256_matches(bytes: &[u8], want: &str) -> bool {
    let got: String = Sha256::digest(bytes).iter().map(|b| format!("{b:02x}")).collect();
    got.eq_ignore_ascii_case(want.trim())
}

/// The key of this computer's build in `mtsync.json` (`windows-amd64`, `macos-arm64`, ...).
fn mtsync_platform() -> Option<String> {
    let os = match std::env::consts::OS {
        "windows" => "windows",
        "macos" => "macos",
        "linux" => "linux",
        _ => return None,
    };
    let arch = match std::env::consts::ARCH {
        "x86_64" => "amd64",
        "aarch64" => "arm64",
        _ => return None,
    };
    Some(format!("{os}-{arch}"))
}

/// The key of this computer's installer in `slateviewer.json`.
fn viewer_platform() -> &'static str {
    if cfg!(windows) {
        "windows-x64"
    } else if cfg!(target_os = "macos") {
        "macos-universal"
    } else if std::env::var_os("APPIMAGE").is_some() {
        "linux-appimage"
    } else if PathBuf::from("/var/lib/dpkg").is_dir() {
        "linux-deb"
    } else {
        "linux-rpm"
    }
}

fn run_mtsync(args: &'static [&'static str]) -> Result<(), String> {
    let out = mtsync::run_blocking(None, args)?;
    if out.ok { Ok(()) } else { Err(out.message()) }
}

fn installed_mtsync() -> Option<Version> {
    let out = mtsync::run_blocking(None, &["version"]).ok().filter(|o| o.ok)?;
    version(&out.stdout)
}

/// Installs mtsync from the latest Metatrash release, or replaces the one this computer has, and
/// makes sure its service runs. Returns the version now installed.
async fn install_mtsync() -> Result<String, String> {
    let manifest: Manifest = get_json(MTSYNC_MANIFEST).await?;
    let platform = mtsync_platform().ok_or("There's no mtsync build for this computer.")?;
    let asset = manifest.files.get(&platform).ok_or_else(|| format!("The mtsync release has no {platform} build."))?;
    let bytes = download(asset).await?;
    tauri::async_runtime::spawn_blocking(move || place_mtsync(&bytes))
        .await
        .map_err(|e| e.to_string())??;
    Ok(manifest.version)
}

fn place_mtsync(bytes: &[u8]) -> Result<(), String> {
    // Replace the copy that runs (it may be on PATH), else use the usual per-user folder.
    let existing = mtsync::find_binary();
    let target = match &existing {
        Some(path) => path.clone(),
        None => mtsync::install_folder().ok_or("No folder to install mtsync in.")?.join(mtsync::exe_name()),
    };
    let dir = target.parent().ok_or("No folder to install mtsync in.")?;
    std::fs::create_dir_all(dir).map_err(|e| format!("Could not create {}: {e}", dir.display()))?;
    let temp = dir.join(format!("{}.download", mtsync::exe_name()));
    std::fs::write(&temp, bytes).map_err(|e| format!("Could not write {}: {e}", temp.display()))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&temp, std::fs::Permissions::from_mode(0o755));
    }
    if existing.is_some() {
        // The running service holds the program on Windows; stop it first.
        let _ = run_mtsync(&["stop"]);
    }
    let mut result = Ok(());
    for _ in 0..20 {
        result = std::fs::rename(&temp, &target);
        if result.is_ok() {
            break;
        }
        std::thread::sleep(Duration::from_millis(250));
    }
    if let Err(e) = result {
        let _ = std::fs::remove_file(&temp);
        if existing.is_some() {
            let _ = run_mtsync(&["start"]);
        }
        return Err(format!("Could not replace {}: {e}", target.display()));
    }
    // install sets up the login service once (and starts it); after that start is enough.
    if existing.is_some() { run_mtsync(&["start"]) } else { run_mtsync(&["install"]) }
}

/// Sets up mtsync (Open Space, when it is missing or too old). Returns the version installed.
#[tauri::command]
pub async fn mtsync_setup() -> Result<String, String> {
    install_mtsync().await
}

fn saved_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("updates.json"))
}

fn load_saved(app: &AppHandle) -> Saved {
    saved_path(app)
        .and_then(|p| std::fs::read(p).ok())
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default()
}

fn store_saved(app: &AppHandle, saved: &Saved) {
    if let (Some(path), Ok(json)) = (saved_path(app), serde_json::to_vec_pretty(saved)) {
        if let Some(dir) = path.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        let _ = std::fs::write(path, json);
    }
}

/// What one check found, for the manual check's answer.
struct Found {
    viewer_offered: bool,
    mtsync_updated: Option<String>,
    problems: Vec<String>,
}

async fn check(app: &AppHandle, manual: bool) -> Found {
    let mut found = Found { viewer_offered: false, mtsync_updated: None, problems: Vec::new() };
    let mut saved = load_saved(app);

    // The server says which clients it works with. Unreachable is fine: try again next time.
    let schema: Schema = get_json(&format!("{DEFAULT_SERVER}{SCHEMA_PATH}")).await.unwrap_or_default();
    if schema.schema_version.is_some() && schema.schema_version != saved.schema_version {
        saved.schema_version = schema.schema_version.clone();
        store_saved(app, &saved);
    }

    // mtsync: only when it's installed (Open Space installs it the first time).
    let installed = tauri::async_runtime::spawn_blocking(installed_mtsync).await.ok().flatten();
    if let Some(have) = installed {
        let needed = schema.clients.mtsync.as_ref().and_then(|c| version(&c.min_version));
        match get_json::<Manifest>(MTSYNC_MANIFEST).await {
            Ok(manifest) => {
                let newer = version(&manifest.version).is_some_and(|latest| latest > have);
                if newer || needed.is_some_and(|n| n > have) {
                    match install_mtsync().await {
                        Ok(v) => found.mtsync_updated = Some(v),
                        Err(e) => found.problems.push(format!("Updating Metatrash Sync failed: {e}")),
                    }
                }
            }
            Err(e) => found.problems.push(e),
        }
    }

    // Slate Viewer itself.
    let current = app.package_info().version.to_string();
    let have = version(&current).unwrap_or_default();
    let required = schema.clients.slate_viewer.as_ref().and_then(|c| version(&c.min_version)).is_some_and(|n| n > have);
    match get_json::<Manifest>(VIEWER_MANIFEST).await {
        Ok(manifest) => {
            let newer = version(&manifest.version).is_some_and(|latest| latest > have);
            let skipped = saved.skipped_version.as_deref() == Some(manifest.version.as_str());
            if newer && (manual || required || !skipped) {
                if let Some(asset) = manifest.files.get(viewer_platform()).cloned() {
                    found.viewer_offered = true;
                    offer_viewer_update(app, &current, &manifest.version, asset, required);
                }
            }
        }
        Err(e) => found.problems.push(e),
    }
    found
}

fn offer_viewer_update(app: &AppHandle, current: &str, latest: &str, asset: Asset, required: bool) {
    let text = if required {
        format!("Metatrash now needs a newer Slate Viewer for spaces to keep working.\n\nUpdate from {current} to {latest} now?")
    } else {
        format!("Slate Viewer {latest} is available. You have {current}.\n\nUpdate now?")
    };
    let app = app.clone();
    let latest = latest.to_string();
    app.dialog()
        .message(text)
        .title("Slate Viewer update")
        .kind(if required { MessageDialogKind::Warning } else { MessageDialogKind::Info })
        .buttons(MessageDialogButtons::OkCancelCustom("Update".into(), "Later".into()))
        .show(move |update| {
            if update {
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = install_viewer(&app, asset).await {
                        app.dialog().message(e).title("Slate Viewer update").kind(MessageDialogKind::Error).show(|_| {});
                    }
                });
            } else {
                let mut saved = load_saved(&app);
                saved.skipped_version = Some(latest);
                store_saved(&app, &saved);
            }
        });
}

/// Windows: downloads the setup, checks it, runs it and quits so it can replace the app.
/// macOS and Linux: opens the download in the browser (a .dmg to drag in, or a package).
async fn install_viewer(app: &AppHandle, asset: Asset) -> Result<(), String> {
    if !cfg!(windows) {
        return app.opener().open_url(&asset.url, None::<&str>).map_err(|e| e.to_string());
    }
    let bytes = download(&asset).await?;
    let setup = std::env::temp_dir().join("SlateViewer-setup.exe");
    std::fs::write(&setup, bytes).map_err(|e| format!("Could not save the setup: {e}"))?;
    std::process::Command::new(&setup).spawn().map_err(|e| format!("Could not start the setup: {e}"))?;
    app.exit(0);
    Ok(())
}

async fn run_check(app: &AppHandle, manual: bool) {
    {
        let state = app.state::<Updates>();
        let mut busy = state.busy.lock().unwrap();
        if *busy {
            return;
        }
        *busy = true;
    }
    let found = check(app, manual).await;
    *app.state::<Updates>().busy.lock().unwrap() = false;
    for problem in &found.problems {
        eprintln!("update check: {problem}");
    }
    if manual && !found.viewer_offered {
        let mut text = match &found.mtsync_updated {
            Some(v) => format!("Metatrash Sync was updated to {v}. Slate Viewer is up to date."),
            None => "Slate Viewer and Metatrash Sync are up to date.".to_string(),
        };
        if !found.problems.is_empty() {
            text = format!("Couldn't check for updates.\n\n{}", found.problems.join("\n"));
        }
        app.dialog().message(text).title("Check for Updates").show(|_| {});
    }
}

/// Help > Check for Updates.
#[tauri::command]
pub async fn check_for_updates(app: AppHandle) {
    run_check(&app, true).await;
}

/// Checks shortly after launch, then twice a day while the app runs.
pub fn start(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(FIRST_CHECK);
        loop {
            tauri::async_runtime::block_on(run_check(&app, false));
            std::thread::sleep(CHECK_EVERY);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn checksum() {
        assert!(sha256_matches(b"abc", "BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD"));
        assert!(!sha256_matches(b"abd", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"));
    }

    #[test]
    fn manifests_and_schema_parse() {
        let m: Manifest = serde_json::from_str(
            r#"{"version":"0.41.1","tag":"v0.41.1","files":{"linux-amd64":{"name":"mtsync-linux-amd64","url":"https://x/y","sha256":"ab","size":3}}}"#,
        )
        .unwrap();
        assert_eq!(m.version, "0.41.1");
        assert_eq!(m.files["linux-amd64"].size, 3);

        let s: Schema = serde_json::from_str(
            r#"{"schemaVersion":"0.9.0","clients":{"mtsync":{"minVersion":"0.37.2"},"slateViewer":{"minVersion":"0.2.0"}},"tools":[]}"#,
        )
        .unwrap();
        assert_eq!(s.schema_version.as_deref(), Some("0.9.0"));
        assert_eq!(version(&s.clients.mtsync.unwrap().min_version), Some((0, 37, 2)));
        assert_eq!(version(&s.clients.slate_viewer.unwrap().min_version), Some((0, 2, 0)));

        // Servers from before `clients` still parse.
        let old: Schema = serde_json::from_str(r#"{"schemaVersion":"0.8.0"}"#).unwrap();
        assert!(old.clients.mtsync.is_none());
    }

    #[test]
    fn platform_keys() {
        let key = mtsync_platform();
        if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
            assert_eq!(key.as_deref(), Some("linux-amd64"));
        }
        assert!(["windows-x64", "macos-universal", "linux-appimage", "linux-deb", "linux-rpm"].contains(&viewer_platform()));
    }
}
