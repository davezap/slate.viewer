//! Metatrash spaces through mtsync.
//!
//! The app never talks to metatrash.com itself: it runs the user's `mtsync` command line
//! (sign-in, list, register a folder, start the service) and then edits the synced folder
//! like any other. See "Integrating a desktop editor with Metatrash spaces through mtsync".
//! The `spaces` and `list` output is text meant for people (gaps G4/G5), so it is parsed
//! defensively here.

use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Serialize;
use tauri::{Emitter, EventTarget, State, WebviewWindow};

/// The oldest mtsync with everything the app relies on (windowless `mtsync start`).
const MIN_VERSION: (u32, u32, u32) = (0, 37, 2);
const DEFAULT_SERVER: &str = "https://metatrash.com";

#[derive(Default)]
pub struct Mtsync {
    login: Mutex<Option<Arc<Mutex<Child>>>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MtsyncInfo {
    /// Where mtsync was found, or None when it isn't installed.
    path: Option<String>,
    version: Option<String>,
    /// True when the version is new enough.
    supported: bool,
    min_version: String,
    /// Where to put mtsync.exe when it is missing.
    install_hint: String,
}

#[derive(Serialize, Debug, PartialEq)]
pub struct SpaceRow {
    space: String,
    /// "read and write" or "read only".
    access: String,
    name: String,
}

#[derive(Serialize, Debug, PartialEq)]
pub struct Registration {
    folder: String,
    space: String,
    /// "in sync, checked …", "starting", "error: …" or "service not running".
    state: String,
    /// Only set for servers other than metatrash.com.
    server: Option<String>,
}

#[derive(Serialize)]
pub struct Output {
    ok: bool,
    stdout: String,
    stderr: String,
}

impl Output {
    /// The last non-empty line of stderr (or stdout), which is where mtsync puts its message.
    fn message(&self) -> String {
        last_line(&self.stderr).or_else(|| last_line(&self.stdout)).unwrap_or_else(|| "mtsync failed.".into())
    }
}

fn last_line(text: &str) -> Option<String> {
    text.lines().rev().map(str::trim).find(|l| !l.is_empty()).map(String::from)
}

fn exe_name() -> &'static str {
    if cfg!(windows) { "mtsync.exe" } else { "mtsync" }
}

fn install_folder() -> Option<PathBuf> {
    if cfg!(windows) {
        std::env::var_os("LOCALAPPDATA").map(|d| PathBuf::from(d).join("Programs").join("mtsync"))
    } else {
        std::env::var_os("HOME").map(|d| PathBuf::from(d).join(".local").join("bin"))
    }
}

/// mtsync on PATH, then in the usual per-user install folder.
fn find_binary() -> Option<PathBuf> {
    let on_path = std::env::var_os("PATH")
        .map(|paths| std::env::split_paths(&paths).map(|dir| dir.join(exe_name())).collect::<Vec<_>>())
        .unwrap_or_default();
    on_path
        .into_iter()
        .chain(install_folder().map(|dir| dir.join(exe_name())))
        .find(|candidate| candidate.is_file())
}

fn command(binary: &Path, server: Option<&str>, args: &[&str]) -> Command {
    let mut cmd = Command::new(binary);
    if let Some(server) = server.filter(|s| !s.is_empty() && s.trim_end_matches('/') != DEFAULT_SERVER) {
        cmd.args(["-server", server]);
    }
    cmd.args(args).stdin(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

fn run_blocking(server: Option<&str>, args: &[&str]) -> Result<Output, String> {
    let binary = find_binary().ok_or("mtsync isn't installed on this computer.")?;
    let out = command(&binary, server, args)
        .output()
        .map_err(|e| format!("Could not run mtsync: {e}"))?;
    Ok(Output {
        ok: out.status.success(),
        stdout: String::from_utf8_lossy(&out.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&out.stderr).into_owned(),
    })
}

async fn run(server: Option<String>, args: Vec<String>) -> Result<Output, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let args: Vec<&str> = args.iter().map(String::as_str).collect();
        run_blocking(server.as_deref(), &args)
    })
    .await
    .map_err(|e| e.to_string())?
}

fn parse_version(text: &str) -> Option<(u32, u32, u32)> {
    let word = text
        .split_whitespace()
        .map(|w| w.trim_start_matches('v'))
        .find(|w| w.chars().next().is_some_and(|c| c.is_ascii_digit()))?;
    let mut parts = word.split('.').map(|p| p.trim_matches(|c: char| !c.is_ascii_digit()).parse::<u32>().ok());
    Some((parts.next()??, parts.next().flatten().unwrap_or(0), parts.next().flatten().unwrap_or(0)))
}

/// Splits a line into columns separated by runs of two or more spaces.
fn columns(line: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut current = String::new();
    let mut spaces = 0;
    for c in line.trim().chars() {
        if c == ' ' {
            spaces += 1;
            continue;
        }
        if spaces >= 2 && !current.is_empty() {
            out.push(std::mem::take(&mut current));
        } else if spaces == 1 {
            current.push(' ');
        }
        spaces = 0;
        current.push(c);
    }
    if !current.is_empty() {
        out.push(current);
    }
    out
}

fn parse_spaces(text: &str) -> Vec<SpaceRow> {
    text.lines()
        .filter_map(|line| {
            let cols = columns(line);
            let space = cols.first()?.clone();
            let access = cols.get(1)?.clone();
            if !access.starts_with("read") {
                return None;
            }
            Some(SpaceRow { space, access, name: cols.get(2).cloned().unwrap_or_default() })
        })
        .collect()
}

fn parse_list(text: &str) -> Vec<Registration> {
    let mut out: Vec<Registration> = Vec::new();
    for line in text.lines() {
        if line.trim().is_empty() {
            continue;
        }
        let indented = line.starts_with(' ') || line.starts_with('\t');
        if !indented {
            out.push(Registration { folder: line.trim().to_string(), space: String::new(), state: String::new(), server: None });
            continue;
        }
        let Some(last) = out.last_mut() else { continue };
        let trimmed = line.trim();
        if let Some(server) = trimmed.strip_prefix("on ") {
            last.server = Some(server.trim().to_string());
        } else if last.space.is_empty() {
            let cols = columns(trimmed);
            last.space = cols.first().cloned().unwrap_or_default();
            last.state = cols[1.min(cols.len())..].join("  ");
        }
    }
    out.retain(|r| !r.space.is_empty());
    out
}

#[tauri::command]
pub async fn mtsync_info() -> MtsyncInfo {
    let min_version = format!("{}.{}.{}", MIN_VERSION.0, MIN_VERSION.1, MIN_VERSION.2);
    let install_hint = install_folder()
        .map(|d| d.join(exe_name()).to_string_lossy().into_owned())
        .unwrap_or_else(|| exe_name().into());
    let path = find_binary().map(|p| p.to_string_lossy().into_owned());
    let version = match path {
        Some(_) => run(None, vec!["version".into()]).await.ok().filter(|o| o.ok).map(|o| o.stdout.trim().to_string()),
        None => None,
    };
    let supported = version.as_deref().and_then(parse_version).is_some_and(|v| v >= MIN_VERSION);
    MtsyncInfo { path, version, supported, min_version, install_hint }
}

#[tauri::command]
pub async fn mtsync_spaces(server: Option<String>) -> Result<Vec<SpaceRow>, String> {
    let out = run(server, vec!["spaces".into()]).await?;
    if !out.ok {
        return Err(out.message());
    }
    Ok(parse_spaces(&out.stdout))
}

#[tauri::command]
pub async fn mtsync_list() -> Result<Vec<Registration>, String> {
    let out = run(None, vec!["list".into()]).await?;
    if !out.ok {
        return Err(out.message());
    }
    Ok(parse_list(&out.stdout))
}

/// Registers `folder` for `space`. The result's stdout says what happened ("Added …",
/// "already syncs …", or that the service isn't running); failures come back as Err.
#[tauri::command]
pub async fn mtsync_add(space: String, folder: String, server: Option<String>) -> Result<Output, String> {
    let out = run(server, vec!["add".into(), space, folder]).await?;
    if !out.ok {
        return Err(out.message());
    }
    Ok(out)
}

#[tauri::command]
pub async fn mtsync_start() -> Result<(), String> {
    let out = run(None, vec!["start".into()]).await?;
    if out.ok { Ok(()) } else { Err(out.message()) }
}

#[tauri::command]
pub async fn mtsync_log(lines: u32) -> Result<String, String> {
    let out = run(None, vec!["log".into(), lines.to_string()]).await?;
    Ok(format!("{}{}", out.stdout, out.stderr))
}

/// Runs `mtsync login` (a browser sign-in) until it finishes or is cancelled. The sign-in
/// URL it prints is sent to the window as `mtsync-login-url`, as a fallback link.
#[tauri::command]
pub async fn mtsync_login(window: WebviewWindow, state: State<'_, Mtsync>, server: Option<String>) -> Result<(), String> {
    let binary = find_binary().ok_or("mtsync isn't installed on this computer.")?;
    let mut child = command(&binary, server.as_deref(), &["login"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Could not run mtsync: {e}"))?;

    let collected = Arc::new(Mutex::new(String::new()));
    let mut readers = Vec::new();
    let pipes: Vec<Box<dyn Read + Send>> = vec![
        Box::new(child.stdout.take().unwrap()),
        Box::new(child.stderr.take().unwrap()),
    ];
    for pipe in pipes {
        let collected = collected.clone();
        let window = window.clone();
        readers.push(std::thread::spawn(move || {
            for line in BufReader::new(pipe).lines().map_while(Result::ok) {
                if let Some(url) = line.split_whitespace().find(|w| w.starts_with("https://") || w.starts_with("http://")) {
                    let _ = window.emit_to(EventTarget::webview_window(window.label()), "mtsync-login-url", url.to_string());
                }
                let mut all = collected.lock().unwrap();
                all.push_str(&line);
                all.push('\n');
            }
        }));
    }

    let child = Arc::new(Mutex::new(child));
    *state.login.lock().unwrap() = Some(child.clone());
    let status = tauri::async_runtime::spawn_blocking(move || loop {
        if let Ok(Some(status)) = child.lock().unwrap().try_wait() {
            return status;
        }
        std::thread::sleep(Duration::from_millis(200));
    })
    .await
    .map_err(|e| e.to_string())?;
    *state.login.lock().unwrap() = None;
    for reader in readers {
        let _ = reader.join();
    }

    if status.success() {
        Ok(())
    } else {
        let text = collected.lock().unwrap().clone();
        Err(last_line(&text).unwrap_or_else(|| "Sign-in was cancelled.".into()))
    }
}

#[tauri::command]
pub fn mtsync_cancel_login(state: State<'_, Mtsync>) {
    if let Some(child) = state.login.lock().unwrap().as_ref() {
        let _ = child.lock().unwrap().kill();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_spaces() {
        let text = "dave-zap/notes                           read and write  Notes\n\
                    dave-zap/bartco                          read only       Bartco site\n\
                    public                                   read and write  Public\n";
        let rows = parse_spaces(text);
        assert_eq!(rows.len(), 3);
        assert_eq!(rows[1], SpaceRow { space: "dave-zap/bartco".into(), access: "read only".into(), name: "Bartco site".into() });
    }

    #[test]
    fn parses_list() {
        let text = "C:\\Users\\Dave\\Metatrash\\dave-zap\\notes\n  dave-zap/notes  in sync, checked Oct 16 14:02:11\n\
                    /home/d/Metatrash/x/y\n  x/y  error: signed out\n  on https://example.org\n";
        let rows = parse_list(text);
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].space, "dave-zap/notes");
        assert_eq!(rows[0].state, "in sync, checked Oct 16 14:02:11");
        assert_eq!(rows[1].server.as_deref(), Some("https://example.org"));
        assert_eq!(rows[1].state, "error: signed out");
    }

    #[test]
    fn compares_versions() {
        assert_eq!(parse_version("mtsync 0.39.0"), Some((0, 39, 0)));
        assert!(parse_version("mtsync 0.37.1").unwrap() < MIN_VERSION);
        assert!(parse_version("mtsync v0.37.2").unwrap() >= MIN_VERSION);
    }
}
