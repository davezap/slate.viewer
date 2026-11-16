# Slate Viewer 0.42.0: tidier folder Properties, Receive email as actions, folders and hidden files on the website

Prepared 2026-11-16 by Claude (thread "Tidy folder properties and hidden
files"), at Dave's request, for Company 0.96.53. Includes 0.41.2 (folder
Properties opens at once, docs/release-0.41.2.md), which was never released
alone. Needs Core 0.97.2 for more than one Receive email per folder.

Tier: Core (public Viewer). Every self-hosted instance uses the same dialog,
Files and Search.

## What changed

1. **Padlocks.** The "🔒 Locked for folder actions: …" lines under each
   section are gone. A padlock icon sits at the right of the section title,
   and its tooltip holds the same text. The Actions title combines the
   actions and services locks, naming each when they differ.
2. **Receive email as an action.** Automation has one Actions list: Receive
   email cards first, then agent actions ("Run an agent · …"). Each Receive
   email has an optional name. A folder can have up to 6, and every one
   after the first needs its own name (Core 0.97.2 `name`). The existing
   service has no name, so its address doesn't change. Renaming a saved one
   warns that it gets a new address. On the website a new one is saved
   straight away and shows its address, as before. `folderSettings.ts`
   `emails[]` replaces `email`. `backend.sync.emailAddress` takes a name.
3. **Delete asks first.** The × became a bin icon. Clicking it shows "Delete
   …? It stops running when you save." (for email: its address stops working)
   with Keep It and Delete. Nothing leaves the settings until Save.
4. **Add Action…** is a drop-down: Receive email or Run an agent. Cards drag
   by the ⠿ handle to reorder among their own kind. Email services and agent
   actions live in separate lists of the settings file (`services` and
   `actions`), so a mixed order couldn't be saved. Order doesn't change what
   runs. Only the owner reorders agent actions.
5. **Hidden files (first part of Dave's .mt rename plan).** On the website,
   AGENTS.md and dot names are left out of Files unless hidden files are
   shown. Folders holding only hidden files are listed as empty folders. A
   Show hidden files eye button in the Files header, and Show Hidden Files on
   the Files right-click menu, toggle it on both the website and the desktop
   (the desktop's View menu item does the same). The renames to `.mt.json`
   and `.mt.assets/` come in two later Core releases.
6. **New folder on the website.** `backend.files.createFolder` writes the new
   folder's `AGENTS.md` (the server adds its `.metatrash.json`), so File ›
   New Folder, the Files button and the right-click items work on the site.
   Picture conversion no longer pre-creates `assets/` on the site, because the
   move makes it.
7. **Search.** "Best matches / Exact text" buttons became an Exact switch at
   the right of the search box (`role="switch"`, tooltip explains both).

Files: `src/lib/FolderProperties.svelte`, `src/lib/folderSettings.ts`,
`src/lib/FilesSection.svelte`, `src/lib/SearchSection.svelte`,
`src/lib/Section.svelte`, `src/lib/backend/web.ts`, `src/lib/backend/types.ts`,
`src/App.svelte`, `package.json`, `package-lock.json`,
`docs/change-notes/changenotes_0.42.0.md`, this file (plus 0.41.2's).

Checked in the cloud: `svelte-check` 0 errors, 0 warnings; `vite build --mode
web` builds. In Chromium against a mock backend: Automation lists the email
service and two agent actions; Add Action › Receive email saves `{"type":
"email", "name": "mail-2"}` and shows its address; the bin asks before
deleting; dragging `summary` above `triage` reorders `actions` in the file;
General shows the padlock at the right of Summary; Search's Exact switch
toggles; Files shows the eye button and a hidden-only folder. Not checked:
the Tauri build.

## Check after release

1. Website, a folder with locks: each locked section has a padlock at the
   right of its title, and its tooltip says who can't change it.
2. A folder that already receives email: Automation shows Receive email with
   the same address as before.
3. Add Action › Receive email: a second card appears, named `mail-2`, with a
   different address. Send mail to both.
4. Click a bin: it asks first. Keep It leaves the action.
5. Drag an agent action above another, Save, reopen: the order stayed.
6. Files › New folder button, type `test-folder`: it appears and stays after
   a reload. Turn on the eye: AGENTS.md and .metatrash.json show inside it.
7. Search: flip Exact on and off. The results change mode.
