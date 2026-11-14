# Slate Viewer 0.39.1: collumii.com as the default server

Prepared 2026-11-14 by Claude, after David's desktop app stopped syncing
once mtsync (Metatrash 0.95.29) moved to https://collumii.com. Not
type-checked or built here; David's `npm run check` and the release helper
(Company 0.96.46 manifest) are the check.

Tier: public.

- `src/lib/space.ts`: `DEFAULT_SERVER` is https://collumii.com;
  `currentServer()` maps https://metatrash.com to it. `parseSpaceRef`,
  `serverArg` and `findRegistration` compare current addresses, so a
  metatrash.com address or registration matches collumii.com.
- `src-tauri/src/mtsync.rs`: `DEFAULT_SERVER` is https://collumii.com, and
  `command()` passes no `-server` for either address.
- `src/lib/OpenSpace.svelte` (address placeholder) and
  `src/lib/FolderProperties.svelte` (help links) name collumii.com.
- The update check and change notes are read from collumii.com
  (`updates.rs` uses `DEFAULT_SERVER`).

- `public/slate/`: Slate 0.23.0 (named embeds), copied in by the release
  helper after Slate's tag. The public edition has no embeds, so the desktop
  app shows an `embed` block as code, as before; no change note needed.

Needs mtsync from Metatrash 0.95.30 for folders whose `.mtsync/state.json`
still names metatrash.com.

Files: `src/lib/space.ts`, `src-tauri/src/mtsync.rs`,
`src/lib/OpenSpace.svelte`, `src/lib/FolderProperties.svelte`,
`package.json`, `package-lock.json`,
`docs/change-notes/changenotes_0.39.1.md`, this file, and the helper's copy
of Slate in `public/slate/` (`slate.js`, `slate.css`, `slate-editor.d.ts`).

Change note: publish `changenotes_0.39.1.md` to the docs space's
`tools/slate-viewer/change-logs/` once v0.39.1 is tagged.
