# Slate Viewer 0.43.0: a plan offer instead of a refused form; no "Untitled" tab; a "…" for folder Properties; one New File/Folder

Prepared 2026-11-17 by Claude (thread "Fix first-visit problems from Adam's
feedback"), at Dave's request, for Company 0.96.55. Needs Core 0.98.1 for
`createNeeds`; with an older server nothing changes.

Tier: Core (public Viewer). The offer's words come from the edition
(`Brand.spaceOffer`), so the public build shows the server's own message and
Collumii shows its trial.

## Why

A visitor's feedback: Settings → Spaces showed "Your spaces 0 of 1" and a
Create space form, then refused the space for want of a membership. And the
browser tab read "Untitled", then "about.md - collumii", on the home page.

## What changed

1. **Settings → Spaces without a plan.** When the account answer has
   `createNeeds` (Core 0.98.1), the page drops the "N of M" count (when there
   are no spaces of one's own), the "You have no spaces of your own yet" row
   and the form. It shows the edition's `spaceOffer` (heading, text and a
   button link) or, without one, the server's message. Spaces already owned
   are still listed. `siteAccount.ts` `createNeeds`, `editionTypes.ts`
   `SpaceOffer`, `SettingsDialog.svelte`.
2. **Tab title on the website.** `site.ts` `siteTitle()` keeps the page's own
   `<title>` (as Metatrash wrote it) while no document is open, so the tab
   never says "Untitled", and on the home page's own file (the address `/`),
   so collumii.com keeps "Collumii — make room for every mind". Other pages
   are named after their file as before. The desktop app is unchanged.
3. **"…" on folder rows** (Dave, 2026-11-17). In Files, pointing at a folder
   (or keyboard focus on it) shows a "…" button at the far right of its row
   that opens the folder's Properties (`onProperties`), where Properties is
   offered (spaces). The right-click Properties and Alt+Enter stay.
   `FilesSection.svelte` `.folder-line`, `.more`.
4. **One New File / New Folder / Upload Files** on the Files right-click
   menu (Dave, 2026-11-17): in the clicked folder, beside the clicked file, or
   in the root when the click is on empty space. The "…in Root" duplicates
   are gone; the Files header buttons still make files in the root.
5. **Bartco clean-up** (thread "Remove Bartco references from the code"): the
   Settings hint says "Acme Notes" becomes …/acme-notes; a mtsync.rs test,
   docs/release-0.27.3.md and docs/release-0.34.3.md use other names.
6. **Slate 0.23.1** vendored in `public/slate/` (Company 0.96.55 releases it
   with this one): its green example theme `themes/green.css` replaces
   `bartco.css`, with its CHANGELOG and the built `slate.js`, `slate.css` and
   `slate-editor.d.ts`.

Files: `src/lib/SettingsDialog.svelte`, `src/lib/FilesSection.svelte`, `src/lib/siteAccount.ts`,
`src/lib/editionTypes.ts`, `src/lib/site.ts`, `src/App.svelte`,
`package.json`, `package-lock.json`, `docs/change-notes/changenotes_0.43.0.md`,
this file; Bartco: `src-tauri/src/mtsync.rs`, `docs/release-0.27.3.md`,
`docs/release-0.34.3.md`; Slate 0.23.1: `public/slate/` (CHANGELOG.md,
themes/bartco.css removed, themes/green.css, slate.js, slate.css,
slate-editor.d.ts).

Checked in the cloud: `svelte-check` 0 errors, 0 warnings; `vite build --mode
web` builds. Not checked: the offer, the tab title, the "…" and the menu in a browser, the Tauri
build, and mtsync.rs's tests (`cargo test`).

## Check after release

1. collumii.com, signed in without a plan: Settings → Spaces shows "Make
   spaces of your own" and Start your 30-day free trial, no "0 of 1" and no
   form. The button opens /pricing.
2. Signed in with a plan: the count and Create space are there as before.
3. Files: point at a folder; a "…" appears at the right and opens its
   Properties. Right-click a folder: one New File… / New Folder… / Upload
   Files… (in that folder), no "in Root" items. Right-click empty space:
   New File… / New Folder… make them at the top.
4. Open collumii.com in a new tab: the tab reads "Collumii — make room for
   every mind" throughout, never "Untitled". Open a guide: its tab names the
   guide's file.
