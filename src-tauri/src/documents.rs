//! Reading and writing Markdown files and their attachments.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Manager};

const UTF8_BOM: &str = "\u{feff}";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadedDocument {
    path: String,
    text: String,
    has_bom: bool,
}

/// Lets the webview load images that sit beside (or below) the document.
pub(crate) fn allow_document_folder(app: &AppHandle, path: &Path) {
    if let Some(folder) = path.parent() {
        let _ = app.asset_protocol_scope().allow_directory(folder, true);
    }
}

#[tauri::command]
pub fn read_document(app: AppHandle, path: String) -> Result<LoadedDocument, String> {
    let path = PathBuf::from(path);
    let bytes = fs::read(&path).map_err(|e| format!("Could not read {}: {e}", path.display()))?;
    let text = String::from_utf8(bytes)
        .map_err(|_| format!("{} is not a UTF-8 text file.", path.display()))?;
    let (text, has_bom) = match text.strip_prefix(UTF8_BOM) {
        Some(rest) => (rest.to_string(), true),
        None => (text, false),
    };
    allow_document_folder(&app, &path);
    Ok(LoadedDocument { path: path.to_string_lossy().into_owned(), text, has_bom })
}

/// Writes via a temporary file in the same folder, then renames it into place,
/// so a failed save never leaves a half-written document.
#[tauri::command]
pub fn write_document(app: AppHandle, path: String, text: String, has_bom: bool) -> Result<(), String> {
    let path = PathBuf::from(path);
    let mut bytes = Vec::with_capacity(text.len() + 3);
    if has_bom {
        bytes.extend_from_slice(UTF8_BOM.as_bytes());
    }
    bytes.extend_from_slice(text.as_bytes());
    write_atomically(&path, &bytes).map_err(|e| format!("Could not save {}: {e}", path.display()))?;
    allow_document_folder(&app, &path);
    Ok(())
}

/// Copies a pasted or dropped file into `<document folder>/<folder>/` and returns
/// the Markdown-relative path it was saved under (forward slashes).
#[tauri::command]
pub fn save_attachment(document_path: String, folder: String, name: String, bytes: Vec<u8>) -> Result<String, String> {
    let document = PathBuf::from(document_path);
    let base = document.parent().ok_or("The document has no folder.")?;
    let target_dir = base.join(&folder);
    fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;

    let name = sanitise_file_name(&name);
    let target = unique_path(&target_dir, &name);
    write_atomically(&target, &bytes).map_err(|e| e.to_string())?;

    let file_name = target.file_name().unwrap().to_string_lossy();
    Ok(format!("{}/{}", folder.trim_matches(['/', '\\']), file_name))
}

fn write_atomically(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let folder = path.parent().unwrap_or(Path::new("."));
    let file_name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    // A *.tmp name, which sync tools such as mtsync ignore.
    let temp = folder.join(format!(".{file_name}.slate.tmp"));
    {
        let mut file = fs::File::create(&temp)?;
        file.write_all(bytes)?;
        file.sync_all()?;
    }
    fs::rename(&temp, path).inspect_err(|_| {
        let _ = fs::remove_file(&temp);
    })
}

fn sanitise_file_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| if c.is_control() || r#"<>:"/\|?*"#.contains(c) { '_' } else { c })
        .collect();
    let cleaned = cleaned.trim().trim_matches('.').to_string();
    if cleaned.is_empty() { "attachment".into() } else { cleaned }
}

fn unique_path(folder: &Path, name: &str) -> PathBuf {
    let candidate = folder.join(name);
    if !candidate.exists() {
        return candidate;
    }
    let (stem, ext) = match name.rfind('.') {
        Some(i) if i > 0 => (&name[..i], &name[i..]),
        _ => (name, ""),
    };
    (2..)
        .map(|n| folder.join(format!("{stem}-{n}{ext}")))
        .find(|p| !p.exists())
        .unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitises_windows_reserved_characters() {
        assert_eq!(sanitise_file_name("a:b?c.png"), "a_b_c.png");
        assert_eq!(sanitise_file_name("  ..  "), "attachment");
    }

    #[test]
    fn numbers_duplicate_names() {
        let dir = std::env::temp_dir().join(format!("slate-viewer-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("shot.png"), b"x").unwrap();
        assert_eq!(unique_path(&dir, "shot.png"), dir.join("shot-2.png"));
        fs::remove_dir_all(&dir).unwrap();
    }
}
