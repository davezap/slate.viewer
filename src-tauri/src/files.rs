//! Managing files from the Files section: delete (to the Recycle Bin / Trash), rename and move,
//! new folders and duplicates. The frontend decides what is allowed (read-only spaces, the space's
//! README) and which name to use; these commands only refuse what would lose or overwrite a file.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

/// Characters Windows doesn't allow in names (and `/`, which separates folders everywhere).
const BAD_CHARACTERS: [char; 9] = ['/', '\\', ':', '*', '?', '"', '<', '>', '|'];

/// Why `name` can't be used for a file or folder, or None when it can.
pub(crate) fn name_problem(name: &str) -> Option<String> {
    if name.trim().is_empty() {
        return Some("A name is needed.".into());
    }
    if name != name.trim() || name.ends_with('.') {
        return Some(format!("\"{name}\" can't start or end with a space, or end with a dot."));
    }
    if name.contains(BAD_CHARACTERS) || name.chars().any(char::is_control) {
        return Some(format!("\"{name}\" can't contain any of / \\ : * ? \" < > |"));
    }
    if name.starts_with('.') {
        return Some(format!("\"{name}\" starts with a dot, which hides it."));
    }
    None
}

fn same_path(a: &Path, b: &Path) -> bool {
    if cfg!(any(windows, target_os = "macos")) {
        a.to_string_lossy().to_lowercase() == b.to_string_lossy().to_lowercase()
    } else {
        a == b
    }
}

/// True when `path` is `folder` or inside it.
fn is_within(path: &Path, folder: &Path) -> bool {
    let path = path.to_string_lossy().replace('\\', "/");
    let folder = folder.to_string_lossy().replace('\\', "/");
    let folder = folder.trim_end_matches('/');
    let (path, folder) = if cfg!(any(windows, target_os = "macos")) {
        (path.to_lowercase(), folder.to_lowercase())
    } else {
        (path, folder.to_string())
    };
    path == folder || path.starts_with(&format!("{folder}/"))
}

/// Renames, trying again for up to two seconds: on Windows a rename fails with "Access is denied"
/// while another program (OneDrive, an antivirus scan, mtsync reading the file) has it open.
fn rename_retry(from: &Path, to: &Path) -> std::io::Result<()> {
    let started = Instant::now();
    loop {
        match fs::rename(from, to) {
            Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied && started.elapsed() < Duration::from_secs(2) => {
                std::thread::sleep(Duration::from_millis(100));
            }
            result => return result,
        }
    }
}

/// Moves a file or folder (and everything in it) to the Recycle Bin, or the Trash on macOS and Linux.
#[tauri::command(async)]
pub fn trash_path(path: String) -> Result<(), String> {
    let path = PathBuf::from(path);
    if !path.exists() {
        return Err(format!("{} is already gone.", path.display()));
    }
    trash::delete(&path).map_err(|e| format!("Could not delete {}: {e}", path.display()))
}

/// Renames or moves a file or folder. Never replaces something already at `to`, except the same
/// file under different capitals (renaming `plan.md` to `Plan.md` on Windows).
#[tauri::command(async)]
pub fn rename_path(from: String, to: String) -> Result<(), String> {
    let (from, to) = (PathBuf::from(from), PathBuf::from(to));
    if !from.exists() {
        return Err(format!("{} no longer exists.", from.display()));
    }
    if let Some(problem) = to.file_name().map(|n| n.to_string_lossy()).and_then(|n| name_problem(&n)) {
        return Err(problem);
    }
    if from.is_dir() && is_within(&to, &from) && !same_path(&from, &to) {
        return Err(format!("{} can't be moved into itself.", from.display()));
    }
    if to.exists() && !same_path(&from, &to) {
        return Err(format!("{} already exists.", to.display()));
    }
    let parent = to.parent().ok_or("The new place has no folder.")?;
    if !parent.is_dir() {
        return Err(format!("{} is not a folder.", parent.display()));
    }
    rename_retry(&from, &to).map_err(|e| format!("Could not move {} to {}: {e}", from.display(), to.display()))
}

/// Creates the folder `<parent>/<name>` and returns its path.
#[tauri::command(async)]
pub fn create_folder(parent: String, name: String) -> Result<String, String> {
    if let Some(problem) = name_problem(&name) {
        return Err(problem);
    }
    let path = PathBuf::from(parent).join(&name);
    if path.exists() {
        return Err(format!("{} already exists.", path.display()));
    }
    fs::create_dir(&path).map_err(|e| format!("Could not create {}: {e}", path.display()))?;
    Ok(path.to_string_lossy().into_owned())
}

/// Copies a file beside itself as `name copy.md` (`name-copy.md` with `space_names`, as spaces
/// allow no spaces in names), numbering further copies. Returns the copy's path.
#[tauri::command(async)]
pub fn duplicate_file(path: String, space_names: bool) -> Result<String, String> {
    let path = PathBuf::from(path);
    if !path.is_file() {
        return Err(format!("{} is not a file.", path.display()));
    }
    let target = copy_name(&path, space_names);
    fs::copy(&path, &target).map_err(|e| format!("Could not copy {}: {e}", path.display()))?;
    Ok(target.to_string_lossy().into_owned())
}

fn copy_name(path: &Path, space_names: bool) -> PathBuf {
    let folder = path.parent().unwrap_or(Path::new("."));
    let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let (stem, ext) = match name.rfind('.') {
        Some(i) if i > 0 => (&name[..i], &name[i..]),
        _ => (name.as_str(), ""),
    };
    let gap = if space_names { "-" } else { " " };
    (1..)
        .map(|n| {
            let number = if n == 1 { String::new() } else { format!("{gap}{n}") };
            folder.join(format!("{stem}{gap}copy{number}{ext}"))
        })
        .find(|p| !p.exists())
        .unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("slate-viewer-files-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn checks_names() {
        assert!(name_problem("plan").is_none());
        assert!(name_problem("plan v2.md").is_none());
        assert!(name_problem("").is_some());
        assert!(name_problem("a/b").is_some());
        assert!(name_problem("what?").is_some());
        assert!(name_problem(".hidden").is_some());
        assert!(name_problem("trailing.").is_some());
        assert!(name_problem(" padded").is_some());
    }

    #[test]
    fn renames_moves_and_refuses_overwrites() {
        let dir = scratch("rename");
        fs::create_dir_all(dir.join("notes/sub")).unwrap();
        fs::write(dir.join("a.md"), "a").unwrap();
        fs::write(dir.join("b.md"), "b").unwrap();
        let s = |p: &str| dir.join(p).to_string_lossy().into_owned();

        assert!(rename_path(s("a.md"), s("b.md")).is_err());
        rename_path(s("a.md"), s("c.md")).unwrap();
        assert_eq!(fs::read_to_string(dir.join("c.md")).unwrap(), "a");
        rename_path(s("c.md"), s("notes/c.md")).unwrap();
        assert!(dir.join("notes/c.md").is_file());
        assert!(rename_path(s("notes"), s("notes/sub/notes")).is_err());
        rename_path(s("notes"), s("archive")).unwrap();
        assert!(dir.join("archive/sub").is_dir());
        assert!(rename_path(s("missing.md"), s("x.md")).is_err());
        assert!(rename_path(s("b.md"), s("bad?.md")).is_err());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn creates_folders_and_copies() {
        let dir = scratch("create");
        let s = |p: &str| dir.join(p).to_string_lossy().into_owned();
        create_folder(s(""), "ideas".into()).unwrap();
        assert!(dir.join("ideas").is_dir());
        assert!(create_folder(s(""), "ideas".into()).is_err());
        assert!(create_folder(s(""), "a:b".into()).is_err());

        fs::write(dir.join("plan.md"), "# Plan\n").unwrap();
        assert!(duplicate_file(s("plan.md"), false).unwrap().ends_with("plan copy.md"));
        assert!(duplicate_file(s("plan.md"), false).unwrap().ends_with("plan copy 2.md"));
        assert!(duplicate_file(s("plan.md"), true).unwrap().ends_with("plan-copy.md"));
        assert!(duplicate_file(s("plan.md"), true).unwrap().ends_with("plan-copy-2.md"));
        assert_eq!(fs::read_to_string(dir.join("plan copy.md")).unwrap(), "# Plan\n");
        assert!(duplicate_file(s("ideas"), false).is_err());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn knows_what_is_inside_what() {
        assert!(is_within(Path::new("/a/b/c.md"), Path::new("/a/b")));
        assert!(is_within(Path::new("/a/b"), Path::new("/a/b/")));
        assert!(!is_within(Path::new("/a/bc/d.md"), Path::new("/a/b")));
    }
}
