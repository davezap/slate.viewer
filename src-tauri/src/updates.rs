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
//!
//! A newer Slate Viewer is offered in the update dialog (UpdateDialog.svelte), which shows the
//! release's change notes from the Metatrash docs (`/docs/tools/slate-viewer/change-logs/changenotes_<version>.md`).
//! The docs pages are plain web pages: the list comes from the page's file tree and each note's
//! Markdown from its `<pre id="document-source">`.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, EventTarget, Manager};
use tauri_plugin_opener::OpenerExt;

use crate::mtsync::{self, DEFAULT_SERVER};

const MTSYNC_MANIFEST: &str = "https://github.com/davezap/metatrash/releases/latest/download/mtsync.json";
const VIEWER_MANIFEST: &str = "https://github.com/davezap/slate.viewer/releases/latest/download/slateviewer.json";
const SCHEMA_PATH: &str = "/api/v1/tool-schema.json";
/// The docs folder of Slate Viewer change notes, one `changenotes_<version>.md` per release.
const CHANGE_NOTES_PATH: &str = "/docs/tools/slate-viewer/change-logs/";
const NOTES_PREFIX: &str = "changenotes_";
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

#[derive(Default)]
pub struct Updates {
    /// One check at a time: the timer's skips while another runs, a manual one waits for it.
    checking: tauri::async_runtime::Mutex<()>,
    /// The installer the last check offered, for Update in the dialog.
    offer: Mutex<Option<Asset>>,
}

/// What a check found, for the update dialog.
#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct CheckResult {
    current: String,
    /// The latest release's version, when the release could be read.
    latest: Option<String>,
    /// A newer Slate Viewer with an installer for this computer.
    available: bool,
    /// The server needs a newer Slate Viewer than this one.
    required: bool,
    /// The version mtsync was just updated to, if it was.
    mtsync_updated: Option<String>,
    problems: Vec<String>,
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

async fn get_text(url: &str) -> Result<String, String> {
    let response = client()?.get(url).send().await.map_err(|e| format!("Could not reach {url}: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("{url} answered {}", response.status()));
    }
    response.text().await.map_err(|e| format!("Unexpected answer from {url}: {e}"))
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
    let want = manifest.version.clone();
    tauri::async_runtime::spawn_blocking(move || place_mtsync(&bytes, &want))
        .await
        .map_err(|e| e.to_string())??;
    Ok(manifest.version)
}

/// One install or update at a time (Open Space's Set Up and the update check can meet).
static PLACING: Mutex<()> = Mutex::new(());

/// Runs a particular mtsync program (not whichever one PATH finds first).
fn run_at(binary: &Path, args: &[&str]) -> Result<mtsync::Output, String> {
    let out = mtsync::command(binary, None, args).output().map_err(|e| format!("Could not run {}: {e}", binary.display()))?;
    Ok(mtsync::Output::from(out))
}

fn version_of(binary: &Path) -> Option<Version> {
    run_at(binary, &["version"]).ok().filter(|o| o.ok).and_then(|o| version(&o.stdout))
}

/// Puts the checked download in place of the mtsync this computer uses, in this order, stopping
/// at the first problem with the old mtsync left as it was:
/// 1. Write the new program next to the old one and run `version` on it: it must run here and be
///    the version the release names.
/// 2. Stop the old service and take it off the login items (`mtsync uninstall`, which waits for
///    the service to exit; `mtsync stop` for versions without it).
/// 3. Keep the old program as a backup and move the new one into its place (same path).
/// 4. `mtsync install` with the new program: the login item (Run key, systemd unit or
///    LaunchAgent) is rewritten to this path, so the service can't keep starting another copy,
///    and it returns once the service runs.
/// 5. Check the program at that path is the new version, then delete the backup.
///
/// If 4 or 5 fails, the backup goes back and its service is started again.
fn place_mtsync(bytes: &[u8], want: &str) -> Result<(), String> {
    let _one = PLACING.lock().unwrap_or_else(|e| e.into_inner());
    let want_version = version(want).ok_or("The release names no version.")?;
    // Replace the copy that runs (it may be on PATH), else use the usual per-user folder.
    let existing = mtsync::find_binary();
    let target = match &existing {
        Some(path) => path.clone(),
        None => mtsync::install_folder().ok_or("No folder to install mtsync in.")?.join(mtsync::exe_name()),
    };
    let dir = target.parent().ok_or("No folder to install mtsync in.")?.to_path_buf();
    std::fs::create_dir_all(&dir).map_err(|e| format!("Could not create {}: {e}", dir.display()))?;
    let (new_name, old_name) = if cfg!(windows) { ("mtsync-new.exe", "mtsync-old.exe") } else { ("mtsync.new", "mtsync.old") };
    let fresh = dir.join(new_name);
    let backup = dir.join(old_name);

    // 1. The new program runs and is what the release says.
    std::fs::write(&fresh, bytes).map_err(|e| format!("Could not write {}: {e}", fresh.display()))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&fresh, std::fs::Permissions::from_mode(0o755));
    }
    if version_of(&fresh) != Some(want_version) {
        let _ = std::fs::remove_file(&fresh);
        return Err(format!("The downloaded mtsync doesn't run on this computer as version {want}, so nothing was changed."));
    }

    // 2. Stop the old service.
    if let Some(old) = &existing {
        let stopped = run_at(old, &["uninstall"]).ok().filter(|o| o.ok).is_some()
            || run_at(old, &["stop"]).map(|o| if o.ok { Ok(()) } else { Err(o.message()) }).and_then(|r| r).is_ok();
        if !stopped {
            let _ = std::fs::remove_file(&fresh);
            let _ = run_at(old, &["install"]);
            return Err("The running Metatrash Sync didn't stop, so it wasn't updated. Try again in a moment.".into());
        }
    }

    // 3. Old program aside, new one in its place. Windows may hold the file for a moment after the
    // service exits, hence the retries.
    let retry = |from: &Path, to: &Path| {
        let mut result = std::fs::rename(from, to);
        for _ in 0..20 {
            if result.is_ok() {
                break;
            }
            std::thread::sleep(Duration::from_millis(250));
            result = std::fs::rename(from, to);
        }
        result
    };
    if existing.is_some() {
        let _ = std::fs::remove_file(&backup);
        if let Err(e) = retry(&target, &backup) {
            let _ = std::fs::remove_file(&fresh);
            let _ = run_at(&target, &["install"]);
            return Err(format!("Could not move the old mtsync aside ({e}), so it wasn't updated."));
        }
    }
    if let Err(e) = retry(&fresh, &target) {
        let _ = std::fs::remove_file(&fresh);
        return Err(restore(&target, &backup, existing.is_some(), format!("Could not put mtsync in {}: {e}", target.display())));
    }

    // 4. Login item pointing here, service running.
    let installed = run_at(&target, &["install"]).map(|o| if o.ok { Ok(()) } else { Err(o.message()) }).and_then(|r| r);
    // 5. The program at that path is the new one.
    let result = installed.and_then(|()| {
        if version_of(&target) == Some(want_version) { Ok(()) } else { Err(format!("{} isn't version {want} after the update.", target.display())) }
    });
    match result {
        Ok(()) => {
            let _ = std::fs::remove_file(&backup);
            Ok(())
        }
        Err(e) => Err(restore(&target, &backup, existing.is_some(), format!("The new mtsync didn't start: {e}"))),
    }
}

/// Puts the old mtsync back after a failed update and starts its service again.
fn restore(target: &Path, backup: &Path, had_old: bool, problem: String) -> String {
    if !had_old {
        return problem;
    }
    let _ = run_at(target, &["uninstall"]);
    let _ = std::fs::remove_file(target);
    if std::fs::rename(backup, target).is_err() {
        return format!("{problem}\nThe old mtsync couldn't be put back; it is at {}.", backup.display());
    }
    let _ = run_at(target, &["install"]);
    format!("{problem}\nThe previous mtsync was put back.")
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

/// Checks for updates: updates mtsync at once when it is out of date, and notes a newer Slate
/// Viewer (and its installer) for the dialog to offer. `offer_now` is false when the user chose
/// not to be asked about this version again and it isn't required.
async fn check(app: &AppHandle) -> (CheckResult, bool) {
    let current = app.package_info().version.to_string();
    let mut found = CheckResult { current: current.clone(), ..Default::default() };
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
    let have = version(&current).unwrap_or_default();
    found.required = schema.clients.slate_viewer.as_ref().and_then(|c| version(&c.min_version)).is_some_and(|n| n > have);
    let mut offer = None;
    let mut skipped = false;
    match get_json::<Manifest>(VIEWER_MANIFEST).await {
        Ok(manifest) => {
            if version(&manifest.version).is_some_and(|latest| latest > have) {
                offer = manifest.files.get(viewer_platform()).cloned();
                skipped = saved.skipped_version.as_deref() == Some(manifest.version.as_str());
            }
            found.latest = Some(manifest.version);
        }
        Err(e) => found.problems.push(e),
    }
    found.available = offer.is_some();
    *app.state::<Updates>().offer.lock().unwrap() = offer;
    let offer_now = found.available && (found.required || !skipped);
    (found, offer_now)
}

/// Windows: downloads the setup, checks it, runs it unattended and quits so it can replace the app.
/// macOS and Linux: opens the download in the browser (a .dmg to drag in, or a package).
async fn install_viewer(app: &AppHandle, asset: Asset) -> Result<(), String> {
    if !cfg!(windows) {
        return app.opener().open_url(&asset.url, None::<&str>).map_err(|e| e.to_string());
    }
    let bytes = download(&asset).await?;
    let setup = std::env::temp_dir().join("SlateViewer-setup.exe");
    std::fs::write(&setup, bytes).map_err(|e| format!("Could not save the setup: {e}"))?;
    // Unattended: /P shows only a progress bar (no questions; it closes Slate Viewer if it is still
    // running), /UPDATE installs over this version where it is and leaves the shortcuts alone, and
    // /R starts the new version when it is done.
    std::process::Command::new(&setup)
        .args(["/P", "/UPDATE", "/R"])
        .spawn()
        .map_err(|e| format!("Could not start the setup: {e}"))?;
    app.exit(0);
    Ok(())
}

/// The timer's check: when there is a Slate Viewer to offer, the focused window (or any) opens the
/// update dialog with it. Skipped while another check runs.
async fn run_check(app: &AppHandle) {
    let state = app.state::<Updates>();
    let Ok(_one) = state.checking.try_lock() else { return };
    let (found, offer_now) = check(app).await;
    for problem in &found.problems {
        crate::applog::write("update", problem);
    }
    if !offer_now {
        return;
    }
    let windows = app.webview_windows();
    let target = windows.values().find(|w| w.is_focused().unwrap_or(false)).or_else(|| windows.values().next());
    if let Some(window) = target {
        let _ = app.emit_to(EventTarget::webview_window(window.label()), "update-available", found);
    }
}

/// Help > Check for Updates, from the update dialog while it shows "Checking…".
#[tauri::command]
pub async fn check_for_updates(app: AppHandle) -> CheckResult {
    let state = app.state::<Updates>();
    let _one = state.checking.lock().await;
    check(&app).await.0
}

/// Update in the dialog: installs what the last check offered (see `install_viewer`).
#[tauri::command]
pub async fn install_update(app: AppHandle) -> Result<(), String> {
    let asset = app.state::<Updates>().offer.lock().unwrap().clone();
    install_viewer(&app, asset.ok_or("There's no update to install. Check for updates again.")?).await
}

/// Closing the dialog the timer opened: don't offer this version again (unless it is required).
#[tauri::command]
pub fn skip_update(app: AppHandle, version: String) {
    let mut saved = load_saved(&app);
    saved.skipped_version = Some(version);
    store_saved(&app, &saved);
}

/// A release version we will ask the docs for (`0.6.0`, `v1.2.3-beta`): no folders or odd characters.
fn note_version_ok(v: &str) -> bool {
    !v.is_empty() && v.len() <= 40 && v.starts_with(|c: char| c.is_ascii_alphanumeric()) && v.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-'))
}

/// The versions with change notes linked from a docs page's file tree, newest first.
fn notes_in_page(html: &str) -> Vec<String> {
    let link = format!("href=\"{CHANGE_NOTES_PATH}{NOTES_PREFIX}");
    let mut found: Vec<String> = Vec::new();
    for part in html.split(&link).skip(1) {
        let name = part.split('"').next().unwrap_or_default();
        if let Some(v) = name.strip_suffix(".md").filter(|v| note_version_ok(v) && version(v).is_some()) {
            if !found.iter().any(|f| f == v) {
                found.push(v.to_string());
            }
        }
    }
    found.sort_by_key(|v| std::cmp::Reverse(version(v)));
    found
}

/// A docs page's file text: the contents of `<pre id="document-source"><code>`, unescaped.
fn source_in_page(html: &str) -> Option<String> {
    let start = html.find("id=\"document-source\"")?;
    let rest = &html[start..];
    let rest = &rest[rest.find("<code>")? + "<code>".len()..];
    let text = &rest[..rest.find("</code>")?];
    Some(
        text.replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&#34;", "\"")
            .replace("&#39;", "'")
            .replace("&quot;", "\"")
            .replace("&amp;", "&"),
    )
}

/// The versions that have change notes in the docs, newest first (for reading older notes).
#[tauri::command]
pub async fn change_notes() -> Result<Vec<String>, String> {
    // Any docs page carries the whole file tree.
    let html = get_text(&format!("{DEFAULT_SERVER}/docs/")).await?;
    Ok(notes_in_page(&html))
}

/// The change notes of one version (the latest release's version comes from GitHub), as Markdown.
#[tauri::command]
pub async fn change_note(version: String) -> Result<String, String> {
    if !note_version_ok(&version) {
        return Err(format!("{version} isn't a version."));
    }
    let html = get_text(&format!("{DEFAULT_SERVER}{CHANGE_NOTES_PATH}{NOTES_PREFIX}{version}.md")).await?;
    source_in_page(&html).ok_or_else(|| format!("The notes for {version} came back in a form Slate Viewer doesn't recognise."))
}

/// Checks shortly after launch, then twice a day while the app runs.
pub fn start(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(FIRST_CHECK);
        loop {
            tauri::async_runtime::block_on(run_check(&app));
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
    fn note_versions() {
        assert!(note_version_ok("0.6.0") && note_version_ok("v1.2.3-beta"));
        for bad in ["../x", "a/b", ".0", "0.6 0", "x%2F", ""] {
            assert!(!note_version_ok(bad), "{bad}");
        }
    }

    #[test]
    fn docs_pages() {
        let tree = r#"<ul class="tree"><li><a href="/docs/README.md">README.md</a></li><li><details><summary>change-logs</summary><ul>
            <li><a href="/docs/tools/slate-viewer/change-logs/changenotes_0.5.0.md"><span>≡</span>changenotes_0.5.0.md</a></li>
            <li><a href="/docs/tools/slate-viewer/change-logs/README.md">README.md</a></li>
            <li><a href="/docs/tools/slate-viewer/change-logs/changenotes_0.10.0.md">x</a></li>
            <li><a href="/docs/tools/slate-viewer/change-logs/changenotes_0.6.0.md" aria-current="page">changenotes_0.6.0.md</a></li></ul></details></li></ul>"#;
        assert_eq!(notes_in_page(tree), ["0.10.0", "0.6.0", "0.5.0"]);
        let page = r#"<pre id="document-source" tabindex="0" aria-label="File contents"><code># 0.6.0 &amp; more
- &lt;b&gt; &#34;quoted&#34; it&#39;s</code></pre>"#;
        assert_eq!(source_in_page(page).as_deref(), Some("# 0.6.0 & more\n- <b> \"quoted\" it's"));
        assert_eq!(source_in_page("<html>not found</html>"), None);
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
