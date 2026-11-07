# Slate Viewer 0.29.0 — upload files by dragging them in

Prepared 2026-11-07 by Claude. Not yet released.

- **Drop files from outside** (Explorer, Finder, the desktop) onto the Files
  list: they go into the folder row they land on, the folder of a file row, or
  the top. The row or the list shows the drop target as for a move.
- **Right-click > Upload Files to <folder>… / Upload Files to Root…** opens the
  system's file picker (the browser's on the website).
- A name already in the folder gets ` (2)`, ` (3)`…; nothing is replaced.
  Names a space can't hold are refused with the reason.
- **Desktop:** the new `upload_file` command writes the file into the folder
  (bytes as the raw request body, the path as hex in a header, never replacing
  a file); mtsync uploads it.
- **Website:** small `.md`/`.txt` files are written as ordinary files; anything
  else goes to `PUT /api/v1/site/spaces/…/content` (needs Core 0.95.8), up to
  100 MB.
- The repo copy of `changenotes_0.28.0.md` now has the wording published in
  the docs space.

Changed: src/App.svelte (uploadFiles), src/lib/FilesSection.svelte (drop,
menu, picker), src/lib/backend/{types,desktop,web}.ts,
src-tauri/src/{documents,lib}.rs, package.json, package-lock.json,
README.md, docs/change-notes/changenotes_0.28.0.md and _0.29.0.md.

Claude ran `npm run check` (0 errors, 0 warnings), `npm run build` and
`npm run build:web`, `cargo check` and the new Rust test (Linux). Dragging
and dropping was not tried in a real window or browser: the checks below are
the first time.

## Release

With Core 0.95.8 and Company 0.96.15 (`scripts/release-laptop.ps1 -Version
0.96.15`). After v0.29.0's Release workflow, publish
`docs/change-notes/changenotes_0.29.0.md` to the docs space at
`tools/slate-viewer/change-logs/changenotes_0.29.0.md` (Claude does this when
asked).

## Checks

Desktop (a synced space) and website (signed in, a space you can write):

1. Drag two files from Explorer onto a folder row: both appear in that folder.
2. Drag one onto a file row in another folder: it goes into that file's folder.
3. Drag one onto empty space below the list: it goes into the top.
4. Drop a file whose name is taken: the copy is `name (2).ext`.
5. Right-click a folder > Upload Files to <folder>…, pick files: they appear.
6. Website: drop a `.md` file: it opens as an ordinary note. Drop a PDF: it
   shows as virtual, and a few minutes later becomes `name.md` with
   `assets/name.pdf` (Core 0.95.8 with Docling).
7. A read-only space: no Upload Files on the menu, and dropping does nothing.
8. Moving files inside the list by dragging still works.
