//! Folder mode: listing a folder's Markdown files, searching them, and creating notes.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Manager};

const MARKDOWN_EXTENSIONS: [&str; 4] = ["md", "markdown", "mdown", "mkd"];
/// Folders that never hold notes but can be huge.
const SKIPPED_FOLDERS: [&str; 6] = ["node_modules", "target", "dist", "build", "bin", "obj"];
const MAX_FILES: usize = 5000;
const MAX_DEPTH: usize = 12;
const MAX_SEARCH_RESULTS: usize = 500;
const MAX_SEARCH_FILE_BYTES: u64 = 4 * 1024 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderListing {
    /// Markdown files, relative to the root, using `/`.
    files: Vec<String>,
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

fn skip_folder(name: &str) -> bool {
    name.starts_with('.') || SKIPPED_FOLDERS.iter().any(|s| s.eq_ignore_ascii_case(name))
}

fn relative(root: &Path, path: &Path) -> String {
    path.strip_prefix(root).unwrap_or(path).to_string_lossy().replace('\\', "/")
}

/// Walks `root` for Markdown files, sorted folder by folder, without following links.
fn markdown_files(root: &Path) -> (Vec<PathBuf>, bool) {
    let mut found = Vec::new();
    let mut stack = vec![(root.to_path_buf(), 0usize)];
    while let Some((dir, depth)) = stack.pop() {
        let Ok(entries) = fs::read_dir(&dir) else { continue };
        let mut entries: Vec<_> = entries.flatten().collect();
        entries.sort_by_key(|e| e.file_name().to_string_lossy().to_lowercase());
        let mut subfolders = Vec::new();
        for entry in entries {
            let Ok(kind) = entry.file_type() else { continue };
            let path = entry.path();
            if kind.is_dir() {
                if depth < MAX_DEPTH && !skip_folder(&entry.file_name().to_string_lossy()) {
                    subfolders.push((path, depth + 1));
                }
            } else if kind.is_file() && is_markdown(&path) {
                if found.len() >= MAX_FILES {
                    return (found, true);
                }
                found.push(path);
            }
        }
        // Reverse so the stack pops subfolders in alphabetical order.
        stack.extend(subfolders.into_iter().rev());
    }
    (found, false)
}

#[tauri::command]
pub fn list_folder(app: AppHandle, root: String) -> Result<FolderListing, String> {
    let root = PathBuf::from(root);
    if !root.is_dir() {
        return Err(format!("{} is not a folder.", root.display()));
    }
    // Images anywhere in the folder can then be shown.
    let _ = app.asset_protocol_scope().allow_directory(&root, true);
    let (files, truncated) = markdown_files(&root);
    let mut files: Vec<String> = files.iter().map(|p| relative(&root, p)).collect();
    files.sort_by_key(|f| f.to_lowercase());
    Ok(FolderListing { files, truncated })
}

/// Case-insensitive plain-text search through every Markdown file under `root`.
#[tauri::command]
pub async fn search_folder(root: String, query: String) -> Result<SearchResults, String> {
    let needle = query.trim().to_lowercase();
    if needle.is_empty() {
        return Ok(SearchResults { matches: Vec::new(), truncated: false });
    }
    let root = PathBuf::from(root);
    tauri::async_runtime::spawn_blocking(move || {
        let (files, _) = markdown_files(&root);
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
#[tauri::command]
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
}

/// The `.metatrash.json` descriptions in a Metatrash space folder (any folder may have one).
#[tauri::command]
pub async fn folder_descriptions(root: String) -> Result<Vec<FolderDescription>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = PathBuf::from(root);
        let mut found = Vec::new();
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
                    let github = value["services"]
                        .as_array()
                        .is_some_and(|list| list.iter().any(|s| s["type"].as_str() == Some("github")));
                    found.push(FolderDescription {
                        folder,
                        purpose: value["purpose"].as_str().map(String::from),
                        children,
                        github,
                    });
                }
            }
            if depth >= MAX_DEPTH {
                continue;
            }
            let Ok(entries) = fs::read_dir(&dir) else { continue };
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().into_owned();
                if entry.file_type().is_ok_and(|t| t.is_dir()) && !skip_folder(&name) {
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
        for dir in ["notes/sub", ".git", "node_modules/pkg"] {
            fs::create_dir_all(root.join(dir)).unwrap();
        }
        for file in ["b.md", "a.MD", "notes/c.markdown", "notes/sub/d.md", "notes/x.txt", ".git/e.md", "node_modules/pkg/f.md"] {
            fs::write(root.join(file), "# hello world\n").unwrap();
        }
        let (files, truncated) = markdown_files(&root);
        let mut names: Vec<String> = files.iter().map(|p| relative(&root, p)).collect();
        names.sort();
        assert_eq!(names, ["a.MD", "b.md", "notes/c.markdown", "notes/sub/d.md"]);
        assert!(!truncated);

        let results = tauri::async_runtime::block_on(search_folder(root.to_string_lossy().into(), "WORLD".into())).unwrap();
        assert_eq!(results.matches.len(), 4);
        assert_eq!(results.matches[0].line, 1);

        let created = create_note(root.join("notes").to_string_lossy().into(), "New idea".into(), None).unwrap();
        assert!(created.ends_with("New idea.md"));
        assert!(create_note(root.to_string_lossy().into(), "a/b".into(), None).is_err());
        fs::remove_dir_all(&root).unwrap();
    }
}
