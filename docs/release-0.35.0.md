# Slate Viewer 0.35.0: guided forms (defaults, show-if, auto flow, photos)

Prepared 2026-11-09 by Claude. `npm run check` (0 errors, 0 warnings),
`npm run test:polling`, `npm run build` and `npm run build:web` passed in a
scratch copy. Pending David: the release helper, review, commit, tag, push and
publishing the change note.

Changes:

- `public/slate/`: Slate 0.22.0 (`slate.js`, `slate-editor.d.ts`, and
  `slate.css` with the photo picker's styles): defaults, show-if, auto flow and
  photo fields. This also brings Slate 0.21.2's script to the desktop app, which
  had only its CSS until now.
- `src-tauri/src/mtsync.rs`: a form sent with photos needs mtsync 0.95.19 (an
  older one reads at most 1 MB of answers) and says so.
- `src/App.svelte`: fill mode passes `person: { name, email }` from `whoami`
  (the site session on the website, `mtsync -json whoami` for the space's server
  on the desktop, asked once per server) so `@name` and `@email` defaults are
  filled in. If it can't say, those fields are left for the server to fill in.
- `src/lib/backend/web.ts`: the site's `whoami` passes the session's `email`;
  sending a form on the site sends the person's local `today` and `now` (the
  desktop's mtsync already sends them).

Files: `public/slate/slate.js`, `public/slate/slate.css`,
`public/slate/slate-editor.d.ts`, `src/App.svelte`, `src/lib/backend/web.ts`,
`src-tauri/src/mtsync.rs`,
`package.json`, `package-lock.json`, `docs/change-notes/changenotes_0.35.0.md`,
this file.

Released with Company 0.96.27; follow its `docs/release-0.96.27.md`. Publish
`changenotes_0.35.0.md` to `dave-zap/metatrash-com`
`tools/slate-viewer/change-logs/` after the tag.

Rollback: install Slate Viewer 0.34.3. Forms with the new attributes then show
as template mistakes in the Viewer; the server still accepts their answers.
