# Slate Viewer 0.44.0: dashboards, a space's home page, forms with no review

Prepared 2026-11-18 by Claude (thread on Collumii dashboards, phase 1), at
Dave's request, for Company 0.96.56. Needs Core 0.99.0 (the `query` and
`notices` resources, `review: none`, the `home` folder setting) and, on the
desktop, mtsync 0.99.0; with older ones cards say what they need and nothing
else changes.

Tier: Core (public Viewer). Collumii's chart colours are Company CSS.

## What changed

1. **Card host** (`src/lib/cards.ts`): Slate 0.24.0 asks the host for each
   card's data. `cardHost()` resolves a card's `source` against the open
   dashboard (a leading `/` is the top of the space, and nothing outside the
   open folder is read), and answers `query`, `read`, `notices`,
   `acknowledge`, `submit` (refusals by field go back to the card) and `open`
   (a row's file opens here). `App.svelte` passes it at mount, learns who is
   looking (`formPerson()`) when a page with cards opens, and asks the cards
   again after a change in the folder (at once on the website, after 4
   seconds on the desktop so mtsync has sent it).
2. **Backends**: `Backend.sync.query`, `notices` and `notice`. The website
   posts to `/api/v1/site/spaces/<space>/query` with the dashboard as `base`
   and uses `notices` (GET `?paths=`, POST `{path, blob}`); signed out or in
   the public space a notice card says to sign in. The desktop runs
   `mtsync -json query DASHBOARD -`, `mtsync -json notices FILE...` and
   `mtsync -json notice FILE BLOB` through the new Tauri commands
   `mtsync_query`, `mtsync_notices`, `mtsync_notice` (`src-tauri/src/mtsync.rs`,
   registered in `lib.rs`; each checks for mtsync 0.99.0 first).
3. **Home page**: `types.ts` `homeNote()`; opening a space (`enterFolder`,
   Open Space) without a remembered place opens the top folder's `home`
   setting when that file exists, else `dashboard.md`, else `README.md`.
   `folderSettings.ts` knows `home` (never inherited, lockable, checked as
   Core checks it) and Properties → General has **Opens on** for the top
   folder.
4. **`complete` copies** (`review: none`): `forms.ts` reads the status and
   says "Done"; My Submissions ticks them; the review banner offers no
   buttons on them.
5. **Slate 0.24.0** vendored in `public/slate/`: `slate.js`, `slate.css`,
   `slate-editor.d.ts`, `CHANGELOG.md` and the new `charts/charts.js`.

Files: `src/lib/cards.ts` (new), `src/lib/backend/types.ts`, `web.ts`,
`desktop.ts`, `src/App.svelte`, `src/lib/types.ts`, `src/lib/folderSettings.ts`,
`src/lib/FolderProperties.svelte`, `src/lib/forms.ts`,
`src/lib/ReviewBanner.svelte`, `src/lib/SubmissionsDialog.svelte`,
`src-tauri/src/mtsync.rs`, `src-tauri/src/lib.rs`, `public/slate/`,
`package.json`, `package-lock.json`, `docs/change-notes/changenotes_0.44.0.md`,
this file.

Checked in the cloud: `svelte-check` 0 errors, 0 warnings; `vite build --mode
web` builds; Slate 0.24.0's own browser checks pass. Not checked: the Tauri
build and `cargo test` (no WebKit in the cloud), and cards against a real
server.

## Release

Part of Company `docs/release-0.96.56.md`: version 0.44.0, tag **v0.44.0**,
and publish `docs/change-notes/changenotes_0.44.0.md` to the connected
`dave-zap/metatrash-com` space at
`tools/slate-viewer/change-logs/changenotes_0.44.0.md`, then read it back to
check it.

## Check after release

1. Write `dashboard.md` at the top of a test space with the example from the
   Dashboards guide (a count, a pie by a field, a table, a notice). Open the
   space: it opens on the dashboard, the cards draw, the pie's colours follow
   the theme.
2. Change a row's field in Files; within seconds (desktop: a few more) the
   count and the chart change.
3. Acknowledge the notice: "✓ Acknowledged", and it stays so after a reload.
   Edit the notice's text: it asks again.
4. A form card with `review: none` in its form: Send files a copy marked
   Done in My Submissions, and the card hides with `show-if: !@done`.
5. Properties → General → Opens on: set `README.md`; reopen the space (on a
   browser with no remembered place): it opens README.md.
