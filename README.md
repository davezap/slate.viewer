# Slate Viewer

Slate Viewer is a Rust+Svelte+Tauri desktop app that integrates the Slate module to read and edit .md files.

## Requirements (Windows)

- [Rust](https://rustup.rs) (stable, MSVC toolchain) and the Visual Studio C++ Build Tools
- Node.js 20 or newer
- WebView2 (already installed on Windows 10/11)

See the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) if anything is missing.

## Run and build

```powershell
npm install
npm run tauri dev          # run with hot reload
npm run release            # installer in src-tauri\target\release\bundle\nsis\
```

## Making a release

1. Bump `version` in `package.json` (the app and installer read it from there).
2. Run `npm run release`.
3. Share `src-tauri\target\release\bundle\nsis\Slate Viewer_<version>_x64-setup.exe`.

Installing a newer version over an older one upgrades it in place; settings and recent files are kept.

## Installing (for colleagues)

1. Run `Slate Viewer_<version>_x64-setup.exe`. It installs for your Windows account only, so no admin
   rights are needed (to `%LOCALAPPDATA%\Programs\Slate Viewer`), and adds a Start menu shortcut.
2. The installer isn't code-signed yet, so Windows may show **"Windows protected your PC"**.
   Click **More info**, then **Run anyway**. Some company setups (Smart App Control, AppLocker)
   block unsigned apps entirely; IT would need to allow it.
3. To make Slate Viewer open `.md` files by default, either choose **File > Make Slate Viewer the
   Default for .md Files** (it opens Settings at Slate Viewer's Default apps page; set `.md` and
   `.markdown` there), or right-click any `.md` file, choose **Open with > Choose another app**,
   pick **Slate Viewer** and tick **Always**. Windows only lets you, not an installer, pick the default.

Uninstall from **Settings > Apps > Installed apps**. The app needs Microsoft Edge WebView2, which
Windows 10 and 11 already have; if it's missing, the installer downloads it.

## What works

### Title bar and find

- On Windows (and Linux) the app draws its own title bar: the File / View / Go / Help menus
  (Alt+F, Alt+V… or click), **Back** and **Forward** (Alt+Left / Alt+Right, or the mouse's side buttons)
  which step through the documents opened in this window, the document name, Find, and the window
  buttons. Drag the empty part of the bar to move the window; double-click it to maximise.
  macOS keeps its native menu and title bar.
- **Find in Document** (Ctrl+F) searches only the open document: every match is highlighted,
  Enter / Shift+Enter (or F3 / Shift+F3) move between them, Escape closes it and leaves the cursor on the match.
  In Source mode the matches are counted and selected one at a time instead of all highlighted.

### Sidebar

- A slim bar of icons on the left switches three sections on and off: **Files** (Ctrl+Shift+E),
  **Search** (Ctrl+Shift+F) and **Document Nav** (Ctrl+Shift+O). Any that are on stack in the panel
  next to it; drag the lines between them to share out the height, and the panel's edge to resize it.
- The **»** button at the bottom shows the section names next to the icons (View > Sidebar Labels).
- Document Nav lists the headings with checklist progress, follows along as you scroll and jumps
  to a heading when clicked.
- Which sections are on, their sizes and the labels setting are remembered.

### Folder mode

- **File > Open Folder** (Ctrl+Alt+O), the Files section's **Open Folder** button, or a folder on the
  command line fills the Files section with every Markdown file in it (hidden folders, `node_modules`, `target`, `build` and similar are skipped).
  The tree updates as files are added, removed or renamed.
- **+** in the sidebar creates a note next to the open document (or at the top of the folder).
- **Search** (Ctrl+Shift+F) searches every note; clicking a hit opens the note with Find showing,
  every match highlighted and the clicked line scrolled into view.
- **Go > Go to File** (Ctrl+T) jumps to a note by typing part of its name.
- **`[[wiki links]]`** open the matching note anywhere in the folder (`[[Note]]`, `[[folder/Note]]`,
  `[[Note|label]]`; the nearest match to the current note wins). A missing note is offered for creation.
  Without a folder open, they resolve next to the current document.
- In folder mode, opening another note while this one has unsaved changes asks to save first.
  Ctrl/Shift/middle-click opens a note in a new window with the same folder.
- File > Open Recent and the Files section (when no folder is open) list recent folders.

### Metatrash spaces

Slate Viewer edits a space's local copy and leaves the syncing to **mtsync** (Metatrash Sync), which has to
be installed already (`%LOCALAPPDATA%\Programs\mtsync\mtsync.exe` or anywhere on PATH, version 0.37.2 or later).
The app only runs `mtsync` commands; it never reads mtsync's settings, sign-in or `.mtsync` folder.

- **File > Open Metatrash Space** (Ctrl+Alt+M), or **Open Space** in the empty Files section. Paste a space's
  address (`https://metatrash.com/spaces/owner/space/notes/plan.md`) or type `owner/space`, or pick one of
  the spaces this computer is connected to. A space that isn't connected yet goes through **Connect**,
  which signs in in the browser (`mtsync login`).
- The first time, it asks where to keep the space (default `~\Metatrash\owner\space`; it warns about
  OneDrive or Dropbox folders), registers the whole space with `mtsync add` and starts the service if needed.
  A space this computer already syncs opens from its existing folder. Then the note or folder in the address opens.
- Opening a folder that mtsync already syncs (Open Folder, Recent) is recognised as that space too.
- The **status chip** in the title bar shows the sync state (and conflicts, and size when near the limit).
  Click it to start the service when it isn't running, sign in again when signed out, or see the recent sync log.
- Space rules are checked when saving: names with letters, digits, `.`, `-`, `_` only (a fixed name is offered),
  at most 8 folder levels, 64 KB per file, UTF-8 without BOM. New notes get a space-safe name (`My Idea` → `my-idea.md`)
  and `[[My Idea]]` finds `my-idea.md`. Read-only spaces and the space's root `README.md` open locked.
- Saving checks whether the file changed on disk since it was opened (for example synced in from
  another computer) and asks whether to keep yours or use theirs.
- Conflict copies that mtsync keeps (`plan.conflict-20261016-140211.md`) show with a ⚠ in Files.
  Compare them with the original and delete them yourself when done; a side-by-side compare is coming next.
- `.metatrash.json` descriptions show as tooltips on folders and files; folders that mirror GitHub show a badge.

### Documents

- **File menu:** New Window (Ctrl+N), Open (Ctrl+O), Open Recent, Save (Ctrl+S), Save As (Ctrl+Shift+S),
  Print (Ctrl+P, includes Microsoft Print to PDF), Close Window (Ctrl+W).
- **View menu:** Edit / Preview / Source (Ctrl+1/2/3), Read Only checklist mode (Ctrl+Shift+R:
  text locked, task boxes still tick), Files / Search / Document Navigation, Theme (system, light, dark), Zoom (Ctrl+= / Ctrl+- / Ctrl+0).
- **Go menu:** Back / Forward (Alt+Left / Alt+Right), Find in Document (Ctrl+F).
- A `•` in the title while there are unsaved changes; closing a changed window asks to save.
- Changes made by other programs: the document reloads automatically if you have no unsaved
  changes, otherwise you are asked whether to reload or keep yours. A deleted file is marked in the title.
- Files keep their line endings (CRLF or LF), UTF-8 BOM and missing final newline when saved.
- Relative images (`![](img/a.png)`) load from the document's folder.
- Links: web links open in your browser; links to other `.md` files open in this window
  (or a new one with Ctrl/Shift/middle-click, or when this one has unsaved changes);
  other local files open in their default app (common document and media types only)
  or are shown in Explorer. In Edit mode use Ctrl+click to follow a link.
- Pasted or dropped files are copied into an `assets` folder next to the document and linked relatively.
  The document has to be saved first.
- Window size and position, theme, zoom and the last editor mode are remembered.
- `.md` / `.markdown` file association in the installer; opening a second file reuses the running app.

## Layout

```
public/slate/        Slate 0.9.4, vendored unchanged (slate.js, slate.css, themes, .d.ts)
src/App.svelte       menu, file handling, link handling, Slate mount
src/lib/             icon bar and sidebar sections, Go to File, wiki-link resolving, paths, line endings, recent lists, preferences
src-tauri/src/       Rust: windows, single instance, file read/write, attachments, file and folder
                     watching, folder listing and search, mtsync commands (mtsync.rs)
```

To update Slate, copy a new release's `slate.js`, `slate.css`, `slate-editor.d.ts` and `themes/` into `public/slate/`.
