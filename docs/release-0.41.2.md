# Slate Viewer 0.41.2: folder Properties opens at once

Prepared 2026-11-16 by Claude at David's request (folder Properties took
several seconds to open on the website).

Properties waited for a full list of the space's files before it showed
anything. On the website that list comes 100 files per request, one request
after another (dave-zap/metatrash has about 750 files, so 8 requests), and
then the folder's AGENTS.md was read too. The dialog now opens as soon as the
folder's settings are read; the file list and the AGENTS.md excerpt (used
for pattern suggestions, read-only matches and the General page's excerpt)
fill in behind it.

It also no longer fetches the whole space (David asked, 2026-11-16): every
use of that list is about the folder and the folders inside it, so it asks
for the files under the folder only (`prefix=`), at most 100 of them, in one
request. When a folder holds more, match counts say so ("100+ files match
now (among its first 100 files)"). `Backend.files.list` gained an optional
`{ prefix, limit }`; the desktop app filters its local list the same way.

Checked in the cloud: `npm run check` (0 errors); in Chromium against a
mocked site API whose file list takes 3 seconds, the dialog was ready in
0.9 s (0.41.1: 3.7 s); `email_inbox/` Properties made one request,
`?prefix=email_inbox%2F&limit=100`, and a folder of more than 100 files showed
"100+ files match now (among its first 100 files)". Not checked: the Tauri build (the desktop list is a
local folder read, so it was never slow there).

Files: `src/lib/FolderProperties.svelte`, `src/lib/backend/types.ts`,
`src/lib/backend/web.ts`, `src/lib/backend/desktop.ts`, `package.json`,
`package-lock.json`, `docs/change-notes/changenotes_0.41.2.md`, this file.
