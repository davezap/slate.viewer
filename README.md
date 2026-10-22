# Slate Viewer

Slate Viewer is a Rust+Svelte+Tauri desktop app that integrates the Slate module to read and edit .md files.

## How Metatrash, Slate and Slate Viewer fit together

These three projects are parts of one whole, kept in sibling folders:

- **Metatrash** (`metatrash.com - 2026`) is the service: shared spaces of text files backed by Git,
  reached over MCP and REST, plus `mtsync`, which syncs a space with a local folder.
- **Slate** (`Slate`) is the Markdown editor component. Slate Viewer and other hosts embed its
  built `slate.js` and `slate.css`; fix editor bugs here, not in a host's copy.
- **Slate Viewer** (`Slate_Viewer`) is the desktop app. It vendors Slate in `public/slate/`. For now it
  is a handy Markdown editor that can also open Metatrash spaces (through `mtsync`). Over time it
  becomes the desktop companion for managing Metatrash spaces, and those features come later.

Metatrash's website still bundles an older Slate (0.9.2) for read-only viewing. It isn't
upgraded yet.

## Download

The latest release, for each computer (all [releases](https://github.com/davezap/slate.viewer/releases)):

| Computer | Installer |
| --- | --- |
| Windows 10/11 (also Windows on Arm) | [SlateViewer-windows-x64-setup.exe](https://github.com/davezap/slate.viewer/releases/latest/download/SlateViewer-windows-x64-setup.exe) |
| Mac (Apple silicon and Intel) | [SlateViewer-macos-universal.dmg](https://github.com/davezap/slate.viewer/releases/latest/download/SlateViewer-macos-universal.dmg) |
| Linux, any distribution | [SlateViewer-linux-x86_64.AppImage](https://github.com/davezap/slate.viewer/releases/latest/download/SlateViewer-linux-x86_64.AppImage) |
| Debian, Ubuntu, Mint | [SlateViewer-linux-amd64.deb](https://github.com/davezap/slate.viewer/releases/latest/download/SlateViewer-linux-amd64.deb) |
| Fedora, openSUSE | [SlateViewer-linux-x86_64.rpm](https://github.com/davezap/slate.viewer/releases/latest/download/SlateViewer-linux-x86_64.rpm) |

Checksums: [SHA256SUMS](https://github.com/davezap/slate.viewer/releases/latest/download/SHA256SUMS).
Nothing else is needed: the first time you open a Metatrash space, Slate Viewer offers to set up
Metatrash Sync (mtsync) for you. [Installing](#installing-for-colleagues) below covers the first-run warnings.

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

GitHub Actions builds and publishes the installers (`.github/workflows/release.yml`):

1. Bump `version` in `package.json` (the app and installers read it from there) and commit.
2. Tag and push: `git tag v0.2.0` then `git push origin v0.2.0`. The tag must match the version.
3. The workflow runs the checks, builds on Windows, macOS and Linux, and publishes a GitHub Release
   with the files below and `SHA256SUMS`. Its notes list the commits since the last release.

The Windows build signs the app, its uninstaller and the setup with Azure Artifact Signing
(formerly Trusted Signing; account `zaptronicssigning`, East US) through Tauri's `signCommand`
and Jsign, and checks the signatures before publishing. The signing config is added only in the
workflow, so `npm run release` on your machine stays unsigned. The build job runs in the GitHub
environment `release` and signs in to Azure with GitHub's OIDC token (no Azure secret in GitHub).
That environment needs the variables `AZURE_CLIENT_ID`, `AZURE_TENANT_ID` and
`AZURE_SIGNING_PROFILE` (the certificate profile's name); without them the release stops before
publishing. The Azure side (an app registration with a federated credential for
`repo:davezap/slate.viewer:environment:release`, holding the *Artifact Signing Certificate Profile
Signer* role) is shared with Metatrash; see Code signing in Metatrash's `docs/deployment.md`.

They are the files listed under [Download](#download). The names stay the same, so
`https://github.com/davezap/slate.viewer/releases/latest/download/<file>` always fetches the newest.
CI (`.github/workflows/ci.yml`) runs `svelte-check`, the front-end build and
`cargo test` on every push.

To build on your own machine instead: `npm run release` makes the Windows installer in
`src-tauri\target\release\bundle\nsis\`.

Installing a newer version over an older one upgrades it in place; settings and recent files are kept.
The Windows setup is code-signed; the Mac and Linux files are not yet, so those systems warn the
first time, as below.

## Installing (for colleagues)

Slate Viewer works on its own as a Markdown editor. Opening a Metatrash space the first time offers
**Set Up**, which installs Metatrash Sync (mtsync) for you; see [Updates and mtsync](#updates-and-mtsync).

### Windows

1. Run `SlateViewer-windows-x64-setup.exe`. It installs for your Windows account only, so no admin
   rights are needed (to `%LOCALAPPDATA%\Programs\Slate Viewer`), and adds a Start menu shortcut.
2. The installer is code-signed (publisher shown in its Properties → Digital Signatures). While
   the new certificate builds up reputation Windows may still show **"Windows protected your
   PC"**: click **More info**, then **Run anyway**.
3. To make Slate Viewer open `.md` files by default, either choose **File > Make Slate Viewer the
   Default for .md Files** (it opens Settings at Slate Viewer's Default apps page; set `.md` and
   `.markdown` there), or right-click any `.md` file, choose **Open with > Choose another app**,
   pick **Slate Viewer** and tick **Always**. Windows only lets you, not an installer, pick the default.
4. Right-click a folder (or the empty space inside one) or a `.md` file in Explorer and choose
   **Open in Slate Viewer**. On Windows 11 it is under **Show more options** (Shift+F10).

Running a newer setup over an installed Slate Viewer offers **Do not uninstall** (install over it,
keeping settings) as the default, with **Uninstall before installing** as the second choice. The same
version offers Add/Reinstall first and Uninstall second. That page comes from
`src-tauri/windows/installer.nsi`, our copy of Tauri's installer template (see its header).

Uninstall from **Settings > Apps > Installed apps**. The app needs Microsoft Edge WebView2, which
Windows 10 and 11 already have; if it's missing, the installer downloads it.

### macOS

1. Open `SlateViewer-macos-universal.dmg` and drag **Slate Viewer** to **Applications**.
2. The app isn't notarized by Apple yet, so the first open is refused ("Apple could not verify…").
   Click **Done**, then open **System Settings > Privacy & Security**, scroll down and click
   **Open Anyway** next to Slate Viewer. After that it opens normally.
3. To open `.md` files with it: select one in Finder, **File > Get Info**, choose Slate Viewer under
   **Open with**, then **Change All…**.

Uninstall by moving Slate Viewer from Applications to the Bin.

### Linux

- **AppImage** (any distribution): `chmod +x SlateViewer-linux-x86_64.AppImage`, then run it.
- **Debian/Ubuntu**: `sudo apt install ./SlateViewer-linux-amd64.deb`
- **Fedora/openSUSE**: `sudo dnf install ./SlateViewer-linux-x86_64.rpm`

The `.deb` and `.rpm` add Slate Viewer to the applications menu and to **Open with** for `.md` files,
and the package manager updates and removes it.

## Updates and mtsync

- **mtsync is set up on demand.** Open Space on a computer without mtsync (or with one older than
  Slate Viewer needs) shows **Set Up** (or **Update**). It downloads the build for this computer named in
  the latest Metatrash release's `mtsync.json`, checks its SHA-256 and size, puts it in
  `%LOCALAPPDATA%\Programs\mtsync` (Windows) or `~/.local/bin` (macOS, Linux), and runs `mtsync install`
  so the sync service starts at every login. No terminal and no admin rights. People who never open a
  space never get the service.
- **Update checks** run 15 seconds after launch and then every 12 hours, and from **Help > Check for Updates**:
  - mtsync, when installed, is updated quietly when the release has a newer one (stop, replace, start;
    sign-in and folders are kept).
  - **Help > Check for Updates** opens the update dialog at once ("Checking for updates…"); it then grows to
    show the change notes. The timer's check opens the same dialog only when there is a newer version.
  - The dialog shows the latest release's notes (its version comes from `slateviewer.json` on GitHub)
    from the Metatrash docs, `https://metatrash.com/docs/tools/slate-viewer/change-logs/changenotes_<version>.md`,
    in a read-only Slate (`public/notes.html`, in an iframe because Slate allows one editor per page).
    Older notes are listed down the side, taken from the docs' file tree. To publish notes for a release,
    write `docs/change-notes/changenotes_<version>.md` in this repository and copy it to
    `tools/slate-viewer/change-logs/` in the docs space (`dave-zap/metatrash-com`).
  - When there is a newer version, **Update** on Windows downloads the setup, checks it and runs it
    unattended (`/P /UPDATE /R`): just a progress bar, no questions, installed over the current version,
    and the new version starts when it's done. On macOS and Linux it opens the download. **Later** (or ×)
    skips that version until the next one.
- **Server changes.** The check also reads `https://metatrash.com/api/v1/tool-schema.json`. Its `clients`
  block names the oldest mtsync and Slate Viewer the server works with: a too-old mtsync is updated at
  once, and a too-old Slate Viewer asks to update even if that version was skipped.
- The code is `src-tauri/src/updates.rs`. Everything downloaded is checked against its SHA-256 first.

## What works

### Title bar and find

- On Windows (and Linux) the app draws its own title bar: the File / View / Go / Help menus
  (Alt+F, Alt+V… or click), **Back** and **Forward** (Alt+Left / Alt+Right, or the mouse's side buttons)
  which step through the documents opened in this window, the document name, Find, and the window
  buttons. Drag the empty part of the bar to move the window; double-click it to maximise.
  macOS keeps its native menu and title bar.
- **Find in Document** (Ctrl+F) searches only the open document: every match is highlighted,
  Enter / Shift+Enter (or F3 / Shift+F3) move between them, Escape closes it and leaves the cursor on the match.
  In Edit and Source every match is highlighted too, and the current one is selected.

### Sidebar

- A slim bar of icons on the left switches four sections on and off: **Files** (Ctrl+Shift+E),
  **Search** (Ctrl+Shift+F), **Document Nav** (Ctrl+Shift+O) and **History** (Ctrl+Shift+H). Any that are on stack in the panel
  next to it; drag the lines between them to share out the height, and the panel's edge to resize it.
- The **»** button at the bottom shows the section names next to the icons (View > Sidebar Labels).
- Document Nav lists the headings with checklist progress, follows along as you scroll and jumps
  to a heading when clicked.
- The pin in Document Nav's header (or View > Pin Document Navigation) moves it out of the stack to its own
  column just left of the document, with its own width. There the **‹** button (or the icon bar, or
  Ctrl+Shift+O) folds it to a thin strip and clicking the strip opens it again. Unpinning puts it back in the stack.
- History lists a space file's earlier versions (from `mtsync history`, which needs mtsync 0.41.0), each with who
  made it: `by dave` for a person, `by Claude (agent) for dave` for an agent (Metatrash and mtsync 0.47.0).
  Clicking one shows what changed since it (Slate's Show Changes, read only); Ctrl+clicking a second one shows what
  changed between the two. **Merge…** under the list compares the picked version with the document inline (Slate's
  Compare): take parts or all of it, press **Done**, then save to restore. Deleted entries have no text to compare.
- **Show Changes** (the **± Changes** toggle in the toolbar, View > Show Changes or Ctrl+Shift+D) shows a space file's
  changes read only: removed words struck through in red and added words in green in Preview, the Markdown the same way in
  Edit and Source. A draft shows its changes since the published version, a published text its changes since the version
  before, and any other file its changes since it was last saved to the space. The toggle shows in read-only documents
  too (the published text), so readers can use it.
- Which sections are on, their sizes, the labels setting and the pinned Document Nav are one setting for
  every window, whatever file or folder it shows.

### Picking up where you left off

- Starting Slate Viewer with nothing named (Start menu, taskbar) reopens the last session: its folder,
  with the file, mode (Edit, Preview or Source), scroll position and cursor it was left with, or the last
  file on its own if no folder was open.
- Reopening a folder (Open Folder, Open Recent, Explorer) does the same for that folder. The first time
  a folder opens, it shows its `README.md` (or its only note) in Preview.
- Up to 50 folders and files are remembered. New Window starts empty and doesn't change the session.

### Opening from Explorer

A file or folder opened from Explorer (double-click, **Open in Slate Viewer**, or a path on the command line)
takes the place of the last session. A file opens on its own, without any folder the last session had,
for reading: Read Only checklist mode in Preview (View > Read Only, Ctrl+Shift+R, switches to editing),
back at the scroll position it was left at. A folder opens where it was left, as above.

### Folder mode

- **File > Open Folder** (Ctrl+Alt+O), the Files section's **Open Folder** button, or a folder on the
  command line fills the Files section with every Markdown file in it (hidden folders, `node_modules`, `target`, `build` and similar are skipped).
  The tree updates as files are added, removed or renamed.
- **New File** (File > New File, Ctrl+Alt+N, or the first button in the Files header) asks for a name in the
  Files section and creates the note next to the open document (or at the top of the folder); **New File in Root**
  (File menu, or the second button) always creates it at the top of the folder. Right-click a folder in Files for
  **New File in** that folder, or a note for **New File in Root**, Open in New Window, Show in Explorer and Copy Path.
  The new note opens in Edit with the cursor under its heading. With no folder open, New File asks where to save it.
- **Managing files.** Right-click a note or folder in Files for **Rename** (F2), **Duplicate** (notes:
  `plan copy.md`, or `plan-copy.md` in a space), **Delete** (Del; asks first, then moves it to the Recycle Bin, or the
  Trash on macOS and Linux) and **New Folder** (also File > New Folder and the third Files button). Drag a note or
  folder onto a folder to move it, or onto empty space below the tree to move it to the top; resting on a closed folder
  opens it. Renaming keeps a note's extension unless you type one. The open note follows a rename or move, unsaved
  changes and all; deleting it shows the note before it. Empty folders show in the tree so they can be filled.
  None of this is offered in a read-only space, and a space's `AGENTS.md` and `.metatrash.json` files can't be
  renamed, moved or deleted (Metatrash keeps one of each in every folder).
- **View > Show Hidden Files** shows what Files normally leaves out: `AGENTS.md`, `.metatrash.json`, other dot files,
  and every file that isn't a note, images included. Images still show inside the notes that use them. Hidden files
  show dimmed; one that isn't a note opens in its own app.
- **Search** (Ctrl+Shift+F) searches every note; clicking a hit opens the note with Find showing,
  every match highlighted and the clicked line scrolled into view.
- **Go > Go to File** (Ctrl+T) jumps to a note by typing part of its name.
- **`[[wiki links]]`** open the matching note anywhere in the folder (`[[Note]]`, `[[folder/Note]]`,
  `[[Note|label]]`; the nearest match to the current note wins). A missing note is offered for creation.
  Without a folder open, they resolve next to the current document.
- In folder mode, opening another note while this one has unsaved changes asks to save first.
  Ctrl/Shift/middle-click opens a note in a new window with the same folder.
- File > Open Recent lists recent files and folders together, newest first, and the Files section (when no
  folder is open) lists recent folders. An icon marks each one as a file, a local folder or a Metatrash space
  (a cloud); the Files title shows the same icon for the open folder.

### Metatrash spaces

Slate Viewer edits a space's local copy and leaves the syncing to **mtsync** (Metatrash Sync), which has to
be installed already (`%LOCALAPPDATA%\Programs\mtsync\mtsync.exe` on Windows, `~/.local/bin/mtsync` on macOS
and Linux, or anywhere on PATH; version 0.37.2 or later). The mtsync installers put it there.
The app only runs `mtsync` commands; it never reads mtsync's settings, sign-in or `.mtsync` folder.

- **File > Open Metatrash Space** (Ctrl+Alt+M), or **Open Space** in the empty Files section. Paste a space's
  address (`https://metatrash.com/spaces/owner/space/notes/plan.md`) or type `owner/space`, or pick one of
  the spaces this computer is connected to. A space that isn't connected yet goes through **Connect**,
  which signs in in the browser (`mtsync login`).
- The first time, it asks where to keep the space (default `~\Metatrash\owner\space`; it warns about
  OneDrive or Dropbox folders), registers the whole space with `mtsync add` and starts the service if needed.
  A space this computer already syncs opens from its existing folder. Then the note or folder in the address opens.
- Opening a folder that mtsync already syncs (Open Folder, Recent) is recognised as that space too.
- The **status chip** in the title bar shows the sync state (and conflicts, and size when near the limit):
  green when synced, orange while a save is on its way to Metatrash (until mtsync finishes a pass after it),
  yellow when it needs a look (conflicts, a note near the size limit), red when sync isn't running or failed.
  Click it to start the service when it isn't running, sign in again when signed out, or see the recent sync log.
- Space rules are checked when saving: names with letters, digits, `.`, `-`, `_` only (a fixed name is offered),
  at most 8 folder levels, 64 KB per file, UTF-8 without BOM. New notes get a space-safe name (`My Idea` → `my-idea.md`)
  and `[[My Idea]]` finds `my-idea.md`. Read-only spaces open locked. `README.md` is an ordinary note; each folder's
  `AGENTS.md` (instructions for agents) and `.metatrash.json` (settings) can be edited but not renamed or deleted.
- Files a folder's `.metatrash.json` locks for everyone (`"readOnly": {"spec.md": "everyone"}`) open locked and
  can't be renamed, moved or deleted, until the lock is lifted there. Files locked only for agents stay editable here.
- Renames, moves and new folders in a space get space-safe names too, and are refused when a note would break the
  rules. mtsync sends a rename or move as a move, so the note keeps its history; a deleted note is deleted in the
  space. An empty folder stays on this computer until a note is put in it.
- Saving checks whether the file changed on disk since it was opened (for example synced in from
  another computer) and offers **Compare** or **Keep Mine**.
- Conflict copies that mtsync keeps (`plan.conflict-20261016-140211.md`) show with a ⚠ in Files.
  Opening the copy or its original offers to compare them: the original opens with your copy shown
  inline (Slate's Compare), you take or keep each difference, and **Done** asks to save the original
  and delete the copy (it is never deleted without asking).
- `.metatrash.json` descriptions show as tooltips on folders and files; folders that mirror GitHub show a badge.
- **Properties** (right-click a folder, or Alt+Enter on it; right-click empty space in Files for the top of the space)
  edits the folder's `.metatrash.json` as a guided dialog instead of raw JSON: **General** (use the parent folder's
  settings, the folder's AGENTS.md, a summary and descriptions of what's inside), **Security** (read-only files and
  patterns with a preview of the files they lock, and which settings are locked for agents or for everyone),
  **Connections** (the GitHub repository the folder mirrors, branch and push mode), **Automation** (triggers and actions,
  reserved until Metatrash has them) and **Settings File** (the exact JSON Save writes, and the settings the folder sees
  with inherited ones). It checks the same rules Metatrash does (lengths, names, patterns, no nested GitHub folders, locks
  for everyone, inherited ones included) before saving, so a change is never quietly refused by Sync. Keys left alone keep
  how they were written. Read-only spaces show the settings without Save. Logic: `src/lib/folderSettings.ts`.
- **Published versions and read tracking** (Metatrash 0.48.0 and mtsync 0.48.0). A folder whose `.metatrash.json` sets
  `"publishedVersion"` has an official version: its files as they were when the number was last raised. Publish a folder
  from its right-click menu (**Publish Version N…**) or its Properties (**Publishing**); unsaved edits are saved and synced
  first. Everyone opens a file's published text by default, read only, with a bar above it naming the version; files changed
  since show **Show Draft** (and **Show Published Version** to go back). History marks each published text **Published vN**.
  With **Ask everyone to confirm they've read the published files** (an `acknowledge` service), each published file a person
  hasn't confirmed shows a red dot in Files (folders holding one too), the bar asks them to read it and choose
  **I Have Read This**, the status chip says how many are left, and Slate Viewer's taskbar button shows the count as a red
  number. A new version asks again only for files whose text changed. The bar also offers **Changes in vN** (since the
  version before) and, when you confirmed an older version, **Changes Since You Read It**. Properties > Publishing also shows who has read what
  (read-write access). The app reads this with `mtsync policies`, `mtsync ack` and `mtsync readers` (`src/lib/policies.ts`,
  `PolicyBanner.svelte`; the taskbar number is drawn in `src-tauri/src/attention.rs`).

### Documents

- **File menu:** New Window (Ctrl+N), New File (Ctrl+Alt+N), New File in Root, New Folder, Open (Ctrl+O), Open Recent, Save (Ctrl+S), Save As (Ctrl+Shift+S),
  Print (Ctrl+P, includes Microsoft Print to PDF), Close Window (Ctrl+W).
- **View menu:** Edit / Preview / Source (Ctrl+1/2/3), Read Only checklist mode (Ctrl+Shift+R:
  text locked, task boxes still tick), Show Changes (Ctrl+Shift+D), Files / Search / Document Navigation / Version History, Theme (system, light, dark, paper), Zoom In / Zoom Out / Reset Zoom (Ctrl+= / Ctrl+- / Ctrl+0, or Ctrl+mouse wheel;
  Reset Zoom shows the current size).
- **Go menu:** Back / Forward (Alt+Left / Alt+Right), Find in Document (Ctrl+F).
- A `•` in the title while there are unsaved changes; closing a changed window asks to save.
- Changes made by other programs: the document reloads automatically if you have no unsaved
  changes, otherwise you choose **Compare**, **Use Theirs** or **Keep Mine**. Compare shows the other
  version inline in Source: red is only in theirs, green only in yours, and each difference has
  **Keep this** / **Use …** buttons, with **Use all of …** and **Done** above. A deleted file is marked in the title.
- Files keep their line endings (CRLF or LF), UTF-8 BOM and missing final newline when saved.
- Relative images (`![](img/a.png)`) load from the document's folder.
- Diagrams: a ` ```mermaid ` code block is drawn as a flowchart, sequence diagram, Gantt chart and so on
  (Slate's Mermaid support). Mermaid loads only when a document has a diagram. In Edit, click a diagram to
  change its source and see it redrawn as you type.
- Links: web links open in your browser and have a ↗ after them; bare addresses (`https://…`, `www.…`)
  are links too. Links to other `.md` files open in this window
  (or a new one with Ctrl/Shift/middle-click, or when this one has unsaved changes);
  other local files open in their default app (common document and media types only)
  or are shown in Explorer. In Edit mode a plain click on a link (in the text or in a table) puts the cursor in it to edit it;
  use Ctrl+click to follow it, or click the ↗ of a web link.
  A link ending in `#heading` (as Metatrash's website writes them) or `#L12` goes to that heading or line,
  and links in diagrams (Mermaid `click … href`) work the same way.
- Right-click selected text for Copy (and Cut / Paste in Edit and Source), **Find in Folder** (puts it in Search
  and opens that section) and **Find in Document**. Right-click a link for Open, Open in New Window,
  Copy Link Address and **Find Other Uses of This Link**, which searches the folder for the link's address
  (for a note, its file name; for a wiki link, `[[Name`). Elsewhere the usual menu shows.
- Pasted or dropped files are copied into an `assets` folder next to the document and linked relatively.
  The document has to be saved first.
- Window size and position, theme, zoom and the last editor mode are remembered. A window stays hidden until its theme is applied, so it doesn't flash white on start.
- `.md` / `.markdown` file association in the installer; opening a second file reuses the running app.

## When something goes wrong

- **Fault log:** Help > Open Log Folder. `slate-viewer.log` records each start, panics in the Rust side
  (release builds stop at once on a panic, so this is the only trace one leaves), uncaught script errors,
  error messages shown to the user, and folders that were slow to list or watch. On Windows it is in
  `%LOCALAPPDATA%\davezap.slateviewer\logs\`; past 1 MB it moves to `slate-viewer.old.log`.
- **Developer Tools:** Help > Developer Tools opens Chromium's DevTools for the window (WebView2 on Windows:
  console, elements, sources with breakpoints, network). It works in installed builds too (Tauri's
  `devtools` feature). In `npm run tauri dev` right-click > Inspect works as well, and Rust output prints in the terminal.
- WebView2 keeps crash reports of the page itself under `%LOCALAPPDATA%\davezap.slateviewer\EBWebView\Crashpad\reports\`,
  and Windows logs app crashes in Event Viewer > Windows Logs > Application ("Application Error").

## Layout

```
docs/change-notes/   changenotes_<version>.md per release, also published to the docs space (see Updates)
public/slate/        Slate 0.16.0, vendored unchanged (slate.js, slate.css, mermaid/, themes, .d.ts)
src/App.svelte       menu, file handling, link handling, Slate mount
src/lib/             icon bar and sidebar sections, folder Properties (FolderProperties.svelte, folderSettings.ts), Go to File, wiki-link resolving, paths, line endings, recent lists, preferences
src-tauri/src/       Rust: windows, single instance, file read/write, attachments, file and folder
                     watching, folder listing and search, rename/move/delete/new folder (files.rs),
                     mtsync commands (mtsync.rs), taskbar count (attention.rs), fault log (applog.rs)
```

To update Slate, run `npm run build` in the Slate repository, then copy its `slate.js`, `slate.css`, `slate-editor.d.ts`,
`CHANGELOG.md`, `themes/` and `mermaid/` into `public/slate/` (replace `mermaid/` whole: its chunk names change between builds).
