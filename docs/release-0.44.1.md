# Slate Viewer 0.44.1: New File keeps .csv, Opens on without .md

Prepared 2026-11-18 by Claude (thread on Collumii dashboards) from Dave's
0.96.56 checks, for Company 0.96.57 with Core 0.99.1.

Tier: Core (public Viewer).

## What changed

1. **Typed extensions** (`src/lib/types.ts`, Dave: any type, `.md` only by
   default): `hasOwnExtension()` (an extension of up to 16 letters, digits,
   `_` or `-`, not digits only, or a leading dot), `withOwnExtension()` and
   `isMarkdownName()`. `isHiddenFile` lists `.csv` files (a dashboard's
   source); home-page and only-note picks stay Markdown-only
   (`firstNote`, `App.svelte` `enterFolder`).
2. **New File** (`App.svelte` `createNote`, web `createNote`, desktop
   `create_note` in `src-tauri/src/workspace.rs`, `has_own_extension`): a
   name that gives its own extension keeps it; a non-Markdown file starts
   empty instead of with a `# title`. Rust test added (`jobs.csv` empty,
   `report.final` kept, `v1.2` still gets `.md`).
   The desktop listing (`is_hidden_file`) also lists `.csv`.
3. **Rename** (`renameEntry`): a typed extension (any) replaces the file's
   own, so `jobs.csv.md` can become `jobs.csv`; without one it keeps its own.
4. **Opens on** (`folderSettings.ts`): a name without an extension is saved
   with `.md` (Core accepts only a `.md` file there).
5. **FormBanner**: a `submitTo` with a leading `/` (`/owner/space/folder/`)
   names that space; any other path is the form's own space ("filed in this
   space"), as Core 0.99.1 reads it.
6. **Plain text** (Dave): `setDocument()` calls Slate 0.24.1's
   `setPlainText(!isMarkdownName(path))` for every file loaded, and
   `setPlainText(false)` when the document is closed, so a .txt, .csv or C
   file shows and edits as in Source, without Markdown.
7. **Slate 0.24.1** vendored (`public/slate/slate.js`, `slate.css`,
   `slate-editor.d.ts`, `CHANGELOG.md`): plain text, and its "submitTo is
   missing" message gives `done/` and `/owner/hr-review/leave/`.

## Checked in the cloud

`npm run check` (svelte-check: 0 errors); the `types.ts` helpers by hand
with Node. The Rust test was not run in the cloud (no GTK there): run
`cargo test --lib workspace` in `src-tauri` on the laptop.

## Checks for Dave

1. Files → New File → `test.csv`: an empty `test.csv` opens, listed with its
   full name. Rename it to `test2.txt` and back. New File → `Plan v1.2`
   gives `Plan v1.2.md`.
2. Properties → General → Opens on: `dashboard` → Save: the settings file
   says `"home": "dashboard.md"`.
3. Open a .txt or .csv (or a .c file) in Preview and in Edit: it shows as
   written, in the editor's font, with no headings, bold or formatting
   buttons. Open a Markdown note afterwards: it renders as usual.
