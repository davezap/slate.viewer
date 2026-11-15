# Slate Viewer 0.40.0: footer marks from the edition; Best matches in Search

Prepared 2026-11-15 by Claude at David's request (the docs space wants a
Collumii wordmark beside `:metatrash:`). `footer.ts` and `edition.ts` pass
`tsc --noEmit`; the Svelte files were not checked or built here. David's
`npm run check` and the release helper are the check.

Tier: public. The hook is generic, so any edition can add its own marks; the
Collumii wordmark itself is Company code (viewer/src/edition.ts, 0.96.50).

- `src/lib/editionTypes.ts`: `Brand.footerMarks`, a map of name to
  `{ label, render }` (`FooterMark`). `render` returns a fresh node each time.
- `src/lib/footer.ts`: a `:name:` token (lowercase letter, then letters,
  digits or `-`, up to 32) becomes `:metatrash:`'s wordmark or the edition's
  mark of that name; an unknown name stays text, as before. `footerMarks()`
  lists the marks for the hint.
- `src/lib/FolderProperties.svelte`: the Page footer hint lists every mark
  (`:metatrash:` shows the Metatrash wordmark, `:collumii:` the Collumii
  wordmark on collumii.com).
- `src/lib/folderSettings.ts`: the "no < or >" message mentions other marks.
- `README.md`: editions and footer sections.

The public edition adds no marks, so the desktop app and a self-hosted
Metatrash behave as before. Core's server checks are unchanged (a footer is
still Markdown with no < or >), so no Core release is needed for the token;
Core picks up this Viewer in its embedded site bundle at its next release.

## Best matches in Search (added 2026-11-15, thread "Plan search and indexing")

Search has two modes, switched under the search box and remembered per
machine: **Best matches** (default; the notes that best match the words, in
any order, with their best lines; the website uses Core 0.97.0's
`search?rank=true`, the desktop app a new Tauri command `rank_folder` in
`src-tauri/src/rank.rs`, with unit tests) and **Exact text** (line search as
before; Find in Folder uses it). The website needs Core 0.97.0 or later for
Best matches.

Checked in the cloud: `npm run check` and `build:web`, and the web build in
Chromium against a local Core 0.97.0. Not checked: `cargo test` and the
Tauri build.

Files: `src/lib/editionTypes.ts`, `src/lib/footer.ts`,
`src/lib/FolderProperties.svelte`, `src/lib/folderSettings.ts`, `README.md`,
`package.json`, `package-lock.json`, `src/App.svelte`,
`src/lib/SearchSection.svelte`, `src/lib/prefs.ts`,
`src/lib/backend/types.ts`, `src/lib/backend/web.ts`,
`src/lib/backend/desktop.ts`, `src-tauri/src/lib.rs`,
`src-tauri/src/workspace.rs`, `src-tauri/src/rank.rs`,
`docs/change-notes/changenotes_0.40.0.md`, this file.

Change note: publish `changenotes_0.40.0.md` to the docs space's
`tools/slate-viewer/change-logs/` once v0.40.0 is tagged.
