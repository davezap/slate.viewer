# Slate Viewer 0.49.0: new files need reading, dashboard cards that list files

Prepared 2026-11-27 by Claude (thread "Build the small ideas batch", slice 3),
released with Company 0.96.76 and Core 0.102.0. Tier: Core (public Viewer).
Slate is unchanged (0.26.2).

1. **New files need reading** (Metatrash 0.102.0 `newFiles`): Folder
   Properties, Publishing, "When to ask": When the folder publishes a
   version, or As soon as a new file arrives in the folder (only without a
   published version). `folderSettings.ts`: `AcknowledgeService.newFiles`,
   written only while the folder doesn't publish; `publishText` drops it, so
   publishing a version switches the folder to versions. "Who has read
   them" shows for such a folder too. `policies.ts`: `PolicyFolder.newFiles`;
   `policyFor` gives no bar for a file such a folder doesn't ask for.
   `PolicyBanner.svelte`: "New in (folder)" instead of the version line.
   Confirming sends version 0 (the desktop through `mtsync ack FILE 0`,
   which needs mtsync from Core 0.102.0).
2. **Pattern sources** for dashboard cards are the server's (Core 0.102.0);
   the Viewer passes the source on as before.
3. `docs/change-notes/changenotes_0.49.0.md`, published to the Collumii docs
   space at `tools/slate-viewer/change-logs/changenotes_0.49.0.md` after the
   release.

`svelte-check` passes (0 errors, 0 warnings). `npm run check` and the
builds run in release-laptop.ps1.
