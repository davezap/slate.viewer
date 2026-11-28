# Slate Viewer 0.51.0: small bugs batch, slice 1

Prepared 2026-11-28 by Claude (thread "Fix the small bugs batch"), released
with Company 0.96.80 and Core 0.104.0. Tier: Core (public Viewer). Slate is
unchanged (0.26.2).

1. **New File/Folder name box** (bug 1): Enter locks the box
   (`createBusy`: read-only, "Making folder…", more Enters and blur ignored)
   until the file or folder is made, so a second Enter can't make it again
   and answer "already exists". The new entry shows at once (`showMade` in
   `App.svelte`) instead of after a full listing (3.1 s for 2,787 files in
   dave-zap/metatrash); `justMade` keeps it until a listing has it, so a
   listing that started earlier doesn't take it away. `FilesSection.svelte`
   (`finishCreate`, `makeEntry`), `App.svelte` (`createFolder`,
   `createNote`, `listFolderAgain`).
2. **What failed** (bug 3): the activity line says it in words
   (`failedLabel`: "N files couldn't be converted", "N folder actions
   failed", "N uploads didn't finish", else "N problems") as a button; the
   list it opens gives each file and the server's reason, and opens the
   file. Closed folders with a failed item show a red mark. `activity.ts`,
   `FilesSection.svelte`, `tests/activity.test.mjs`
   (`npm run test:activity`).
3. **Sync conflicts panel** (bug 4): with conflict copies
   (`name.conflict-YYYYMMDD-HHMMSS.ext`) in the space, the chip opens
   `ConflictsMenu.svelte`: what a conflict is, then each copy with Compare
   and merge (the existing `resolveConflict`), Open copy, and Keep the
   space's version (deletes the copy after a confirm). On the desktop the
   sync menu is one more click ("Sync status and recent activity…"). The
   website's `deleteConflictCopy` now deletes (only names Metatrash Sync
   gives its copies); before, it refused, so merging on the site couldn't
   remove the copy.
4. **The space stays open** (bug 5): a failed listing used to close the
   folder at once. Connecting Metatrash Sync from Slate Viewer renews the
   site sign-in, and the open tab's next listing failed and closed the space
   (its dashboard cards then said "Open the dashboard from its space").
   Now only "gone" (404, or the desktop's not found) twice in a row closes
   it; anything else keeps it and lists again after 3 s, doubling to 60 s.
   `App.svelte` (`listFolderAgain`, `listFailures`).
5. `docs/change-notes/changenotes_0.51.0.md`, published to the Collumii docs
   space at `tools/slate-viewer/change-logs/changenotes_0.51.0.md` after the
   release.

`svelte-check` passes (0 errors, 0 warnings, cloud copy); `npm run
test:activity`, `test:templates` and `test:polling` pass; `npm run
build:web` builds. `npm run check` and the builds run in release-laptop.ps1.
