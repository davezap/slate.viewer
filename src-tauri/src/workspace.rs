//! Folder mode: listing a folder's Markdown files, searching them, and creating notes.
//!
//! The listing hides files that aren't notes: anything but Markdown (images, settings), a
//! folder's AGENTS.md (instructions for agents) and names starting with a dot. View > Show
//! Hidden Files lists them too. Images stay usable in documents either way.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Manager};

const MARKDOWN_EXTENSIONS: [&str; 4] = ["md", "markdown", "mdown", "mkd"];
/// Folders that never hold notes but can be huge. Not skipped in a space folder (one Metatrash
/// Sync keeps, with `.mtsync`): a space holds no build output, and `build/` there is a folder
/// like any other.
const SKIPPED_FOLDERS: [&str; 6] = ["node_modules", "target", "dist", "build", "bin", "obj"];
const MAX_FILES: usize = 5000;
const MAX_DEPTH: usize = 12;
const MAX_SEARCH_RESULTS: usize = 500;
const MAX_SEARCH_FILE_BYTES: u64 = 4 * 1024 * 1024;
/// A walk stops after this many folders or this long, so opening a drive or a home folder
/// (or a cloud folder that is slow to list) can't keep the app busy for minutes.
const MAX_FOLDERS: usize = 20_000;
const MAX_WALK_TIME: Duration = Duration::from_secs(8);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderListing {
    /// Markdown files (every file with hidden ones shown), relative to the root, using `/`.
    files: Vec<String>,
    /// Folders with nothing in them but hidden files, so a new folder shows before it has notes.
    empty_folders: Vec<String>,
    /// True when the listing stopped at MAX_FILES.
    truncated: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchMatch {
    path: String,
    line: usize,
    text: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResults {
    matches: Vec<SearchMatch>,
    truncated: bool,
}

pub fn is_markdown(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| MARKDOWN_EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()))
}

/// A file the listing hides unless hidden files are shown: not Markdown, a folder's
/// AGENTS.md, or a name starting with a dot (.metatrash.json, .gitignore).
pub fn is_hidden_file(path: &Path) -> bool {
    let name = path.file_name().map(|n| n.to_string_lossy()).unwrap_or_default();
    !is_markdown(path) || name.eq_ignore_ascii_case("AGENTS.md") || name.starts_with('.')
}

/// True when `root` is a folder Metatrash Sync keeps in step with a space.
fn is_space_folder(root: &Path) -> bool {
    root.join(".mtsync").is_dir()
}

/// True when a listing of a folder skips its subfolder `name`: hidden folders always, and the
/// usual build and package folders outside a space.
fn skip_folder(name: &str, in_space: bool) -> bool {
    name.starts_with('.') || (!in_space && SKIPPED_FOLDERS.iter().any(|s| s.eq_ignore_ascii_case(name)))
}

/// True when `path` is inside a folder the listing skips (.git, node_modules, target…) below `root`.
pub(crate) fn in_skipped_folder(root: &Path, path: &Path) -> bool {
    let Ok(inside) = path.strip_prefix(root) else { return false };
    let mut parts: Vec<_> = inside.components().collect();
    parts.pop(); // the file or folder itself
    let in_space = is_space_folder(root);
    parts.iter().any(|part| skip_folder(&part.as_os_str().to_string_lossy(), in_space))
}

fn relative(root: &Path, path: &Path) -> String {
    path.strip_prefix(root).unwrap_or(path).to_string_lossy().replace('\\', "/")
}

/// What a walk of a folder found.
struct Walk {
    /// Markdown files (every file with `hidden`), sorted folder by folder.
    files: Vec<PathBuf>,
    /// Folders below the root with nothing in them but hidden files.
    empty_folders: Vec<PathBuf>,
    /// The walk stopped early (too many files or folders, or too slow).
    stopped: bool,
}

/// Walks `root` for Markdown files (with `hidden`, every file), sorted folder by folder,
/// without following links.
fn markdown_files(root: &Path, hidden: bool) -> Walk {
    let started = Instant::now();
    let mut found = Vec::new();
    let mut empty_folders = Vec::new();
    let mut folders = 0usize;
    let in_space = is_space_folder(root);
    let mut stack = vec![(root.to_path_buf(), 0usize)];
    while let Some((dir, depth)) = stack.pop() {
        folders += 1;
        if folders > MAX_FOLDERS || started.elapsed() > MAX_WALK_TIME {
            crate::applog::write(
                "slow",
                &format!("Stopped listing {} after {folders} folders and {:.1} s.", root.display(), started.elapsed().as_secs_f32()),
            );
            return Walk { files: found, empty_folders, stopped: true };
        }
        let Ok(entries) = fs::read_dir(&dir) else { continue };
        let mut entries: Vec<_> = entries.flatten().collect();
        let shown = |e: &fs::DirEntry| {
            let is_dir = e.file_type().is_ok_and(|t| t.is_dir());
            if is_dir { !e.file_name().to_string_lossy().starts_with('.') } else { hidden || !is_hidden_file(&e.path()) }
        };
        if dir != root && !entries.iter().any(shown) {
            empty_folders.push(dir.clone());
        }
        entries.sort_by_key(|e| e.file_name().to_string_lossy().to_lowercase());
        let mut subfolders = Vec::new();
        for entry in entries {
            let Ok(kind) = entry.file_type() else { continue };
            let path = entry.path();
            if kind.is_dir() {
                if depth < MAX_DEPTH && !skip_folder(&entry.file_name().to_string_lossy(), in_space) {
                    subfolders.push((path, depth + 1));
                }
            } else if kind.is_file() && (hidden || !is_hidden_file(&path)) {
                if found.len() >= MAX_FILES {
                    return Walk { files: found, empty_folders, stopped: true };
                }
                found.push(path);
            }
        }
        // Reverse so the stack pops subfolders in alphabetical order.
        stack.extend(subfolders.into_iter().rev());
    }
    Walk { files: found, empty_folders, stopped: false }
}

/// Runs on a worker thread: a folder can take a while to list (a big tree, a OneDrive folder
/// whose contents are fetched on demand), and a command without `async` would run on the main
/// thread and freeze every window until it finished.
#[tauri::command]
pub async fn list_folder(app: AppHandle, root: String, hidden: Option<bool>) -> Result<FolderListing, String> {
    let hidden = hidden.unwrap_or(false);
    tauri::async_runtime::spawn_blocking(move || {
        let root = PathBuf::from(root);
        if !root.is_dir() {
            return Err(format!("{} is not a folder.", root.display()));
        }
        // Images anywhere in the folder can then be shown.
        let _ = app.asset_protocol_scope().allow_directory(&root, true);
        let walk = markdown_files(&root, hidden);
        let mut files: Vec<String> = walk.files.iter().map(|p| relative(&root, p)).collect();
        files.sort_by_key(|f| f.to_lowercase());
        let empty_folders = walk.empty_folders.iter().map(|p| relative(&root, p)).collect();
        Ok(FolderListing { files, empty_folders, truncated: walk.stopped })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Case-insensitive plain-text search through every Markdown file under `root` (with
/// `hidden`, AGENTS.md and the other hidden text files too).
#[tauri::command]
pub async fn search_folder(root: String, query: String, hidden: Option<bool>) -> Result<SearchResults, String> {
    let hidden = hidden.unwrap_or(false);
    let needle = query.trim().to_lowercase();
    if needle.is_empty() {
        return Ok(SearchResults { matches: Vec::new(), truncated: false });
    }
    let root = PathBuf::from(root);
    tauri::async_runtime::spawn_blocking(move || {
        let files = markdown_files(&root, hidden).files;
        let mut matches = Vec::new();
        for file in files {
            if fs::metadata(&file).map(|m| m.len()).unwrap_or(0) > MAX_SEARCH_FILE_BYTES {
                continue;
            }
            let Ok(text) = fs::read_to_string(&file) else { continue };
            let rel = relative(&root, &file);
            let name_hit = rel.to_lowercase().contains(&needle);
            let mut file_hit = false;
            for (i, line) in text.lines().enumerate() {
                if line.to_lowercase().contains(&needle) {
                    file_hit = true;
                    matches.push(SearchMatch { path: rel.clone(), line: i + 1, text: trim_line(line) });
                    if matches.len() >= MAX_SEARCH_RESULTS {
                        return SearchResults { matches, truncated: true };
                    }
                }
            }
            if name_hit && !file_hit {
                matches.push(SearchMatch { path: rel, line: 0, text: String::new() });
            }
        }
        SearchResults { matches, truncated: false }
    })
    .await
    .map_err(|e| e.to_string())
}

fn trim_line(line: &str) -> String {
    let line = line.trim();
    match line.char_indices().nth(200) {
        Some((cut, _)) => format!("{}…", &line[..cut]),
        None => line.to_string(),
    }
}

/// Creates `<folder>/<name>.md` with a heading, unless it already exists. Returns its path.
#[tauri::command(async)]
pub fn create_note(folder: String, name: String, title: Option<String>) -> Result<String, String> {
    let name = name.trim().trim_end_matches(".md");
    if name.is_empty() || name.contains(['/', '\\', ':', '*', '?', '"', '<', '>', '|']) || name.starts_with('.') {
        return Err(format!("\"{name}\" can't be used as a note name."));
    }
    let path = PathBuf::from(folder).join(format!("{name}.md"));
    if path.exists() {
        return Err(format!("{} already exists.", path.display()));
    }
    let title = title.filter(|t| !t.trim().is_empty()).unwrap_or_else(|| name.to_string());
    fs::write(&path, format!("# {}\n", title.trim())).map_err(|e| format!("Could not create {}: {e}", path.display()))?;
    Ok(path.to_string_lossy().into_owned())
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct FolderDescription {
    /// Relative folder path with a trailing `/`, or "" for the root.
    folder: String,
    purpose: Option<String>,
    /// Descriptions of child folders and files, keyed as written (e.g. "notes/").
    children: std::collections::BTreeMap<String, String>,
    /// The folder mirrors a GitHub repository.
    github: bool,
    /// Locked files: name, pattern or `subfolder/` to "agents" or "everyone".
    read_only: std::collections::BTreeMap<String, String>,
    /// The folder's published version (`publishedVersion`, Metatrash 0.48.0), if it publishes.
    published_version: Option<u64>,
    /// People are asked to confirm they read the published files (an acknowledge service).
    acknowledge: bool,
}

/// The `.metatrash.json` descriptions in a Metatrash space folder (any folder may have one).
#[tauri::command]
pub async fn folder_descriptions(root: String) -> Result<Vec<FolderDescription>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = PathBuf::from(root);
        let mut found = Vec::new();
        let in_space = is_space_folder(&root);
        let mut stack = vec![(root.clone(), 0usize)];
        while let Some((dir, depth)) = stack.pop() {
            if let Ok(text) = fs::read_to_string(dir.join(".metatrash.json")) {
                if let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) {
                    let mut folder = relative(&root, &dir);
                    if !folder.is_empty() {
                        folder.push('/');
                    }
                    let children = value["children"]
                        .as_object()
                        .map(|map| map.iter().filter_map(|(k, v)| Some((k.clone(), v.as_str()?.to_string()))).collect())
                        .unwrap_or_default();
                    let has_service = |kind: &str| {
                        value["services"].as_array().is_some_and(|list| list.iter().any(|s| s["type"].as_str() == Some(kind)))
                    };
                    let github = has_service("github");
                    let acknowledge = has_service("acknowledge");
                    // A list locks each name for agents, as a map with "agents" does.
                    let read_only = match &value["readOnly"] {
                        serde_json::Value::Array(list) => {
                            list.iter().filter_map(|v| Some((v.as_str()?.to_string(), "agents".to_string()))).collect()
                        }
                        serde_json::Value::Object(map) => {
                            map.iter().filter_map(|(k, v)| Some((k.clone(), v.as_str()?.to_string()))).collect()
                        }
                        _ => Default::default(),
                    };
                    found.push(FolderDescription {
                        folder,
                        purpose: value["purpose"].as_str().map(String::from),
                        children,
                        github,
                        read_only,
                        published_version: value["publishedVersion"].as_u64(),
                        acknowledge,
                    });
                }
            }
            if depth >= MAX_DEPTH {
                continue;
            }
            let Ok(entries) = fs::read_dir(&dir) else { continue };
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().into_owned();
                if entry.file_type().is_ok_and(|t| t.is_dir()) && !skip_folder(&name, in_space) {
                    stack.push((entry.path(), depth + 1));
                }
            }
        }
        found
    })
    .await
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_markdown_and_skips_noise() {
        let root = std::env::temp_dir().join(format!("slate-viewer-ws-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        for dir in ["notes/sub", ".git", "node_modules/pkg", "empty", "hidden-only"] {
            fs::create_dir_all(root.join(dir)).unwrap();
        }
        for file in ["b.md", "a.MD", "notes/c.markdown", "notes/sub/d.md", "notes/x.txt", ".git/e.md", "node_modules/pkg/f.md", "notes/AGENTS.md"] {
            fs::write(root.join(file), "# hello world\n").unwrap();
        }
        fs::write(root.join("hidden-only/.metatrash.json"), "{}").unwrap();
        fs::write(root.join("hidden-only/agents.md"), "# agents\n").unwrap();
        let walk = markdown_files(&root, false);
        let mut names: Vec<String> = walk.files.iter().map(|p| relative(&root, p)).collect();
        names.sort();
        assert_eq!(names, ["a.MD", "b.md", "notes/c.markdown", "notes/sub/d.md"]);
        let mut empty: Vec<String> = walk.empty_folders.iter().map(|p| relative(&root, p)).collect();
        empty.sort();
        assert_eq!(empty, ["empty", "hidden-only"]);
        assert!(!walk.stopped);

        // Shown hidden files: everything but skipped folders.
        let walk = markdown_files(&root, true);
        let mut names: Vec<String> = walk.files.iter().map(|p| relative(&root, p)).collect();
        names.sort();
        assert_eq!(names, ["a.MD", "b.md", "hidden-only/.metatrash.json", "hidden-only/agents.md", "notes/AGENTS.md", "notes/c.markdown", "notes/sub/d.md", "notes/x.txt"]);
        let empty: Vec<String> = walk.empty_folders.iter().map(|p| relative(&root, p)).collect();
        assert_eq!(empty, ["empty"]);

        let results = tauri::async_runtime::block_on(search_folder(root.to_string_lossy().into(), "WORLD".into(), None)).unwrap();
        assert_eq!(results.matches.len(), 4);
        let results = tauri::async_runtime::block_on(search_folder(root.to_string_lossy().into(), "WORLD".into(), Some(true))).unwrap();
        assert_eq!(results.matches.len(), 6);
        assert_eq!(results.matches[0].line, 1);

        let created = create_note(root.join("notes").to_string_lossy().into(), "New idea".into(), None).unwrap();
        assert!(created.ends_with("New idea.md"));
        assert!(create_note(root.to_string_lossy().into(), "a/b".into(), None).is_err());

        assert!(in_skipped_folder(&root, &root.join(".git").join("index")));
        assert!(in_skipped_folder(&root, &root.join("notes").join("node_modules").join("x")));
        assert!(!in_skipped_folder(&root, &root.join(".git")));
        assert!(!in_skipped_folder(&root, &root.join("notes").join("a.md")));
        assert!(in_skipped_folder(&root, &root.join("build").join("plan.md")));
        // In a space folder only hidden folders are skipped: build/ is an ordinary folder there.
        fs::create_dir_all(root.join(".mtsync")).unwrap();
        fs::create_dir_all(root.join("build")).unwrap();
        fs::write(root.join("build").join("plan.md"), "# Plan\n").unwrap();
        assert!(!in_skipped_folder(&root, &root.join("build").join("plan.md")));
        assert!(in_skipped_folder(&root, &root.join(".mtsync").join("state.json")));
        assert!(markdown_files(&root, false).files.iter().any(|f| f.ends_with("build/plan.md") || f.ends_with("build\\plan.md")));
        fs::remove_dir_all(&root).unwrap();
    }
}
