# Slate Viewer 0.34.1 — Properties help, links that work the app, each document's own place

Prepared 2026-11-08 by Claude. Not yet released. No Metatrash change: it
works with Core 0.95.12 as 0.34.0 does. Ships in Company 0.96.21 (the site
runs the same Properties dialog).

- **Help button** (`FolderProperties.svelte`): a round **?** at the top right
  of each Properties page, sticky while the page scrolls. It opens
  `https://metatrash.com/docs/guides/folder-properties/<page>.md` with
  `backend.opener.url` (the system browser on the desktop, a new tab on the
  site). The pages are `general.md`, `security.md`, `connections.md`,
  `publishing.md`, `automation.md` and `settings-file.md`, written to the docs
  space on 2026-11-08; the folder's AGENTS.md there says not to rename them.
- **Links that work the app** (`App.svelte`: `followLink`, `followAppLink`;
  David, 2026-11-08). A link whose address starts with `#` used to mean only
  a heading in the document. These now work the app instead:
  - `#settings`, `#settings/<tab>`, `#settings/<tab>/<page>`: that Settings
    page. On the site the address's `#` changes, so the dialog opens over
    the page. With Ctrl or Shift, and on the desktop, it opens
    `<server>/spaces/#settings/…` in the browser (the opened space's server,
    else metatrash.com). Before, nothing happened (Dave tested the first one,
    in the docs space's `guides/folder-properties/automation.md`).
  - `#properties/<folder>/<page>`: that folder's Properties, on a page named
    as its guide is (general, security, connections, publishing, automation,
    settings-file; General when left out). The folder is relative to the
    open folder; `.` or an empty folder is the top (`#properties/./security`,
    `#properties//security`); with no folder, the open document's folder.
    `FolderProperties.svelte` gained an `initialPage` prop. A folder the
    space doesn't have, or no space open, gets a short message.
  - `#panel/<files|search|outline|history>`: shows or hides that side
    panel; `/open` or `/close` after it only opens or only closes. On a
    phone it is the drawer.
  - `#command/<name>`: change-space (the space picker on the site, Open
    Metatrash Space on the desktop), find, search, print, back, forward,
    edit-on, edit-off (site only, in a space you can change),
    theme/light, theme/dark, theme/paper, theme/system.
  - The button the link stands for flashes twice (`.link-flash`;
    `ActivityBar.svelte` items carry `data-section`), so the reader learns
    where it is.
  - On purpose, nothing a link does changes a file or the account (no save,
    delete, upload or sign out): anyone can put a link in a shared
    document. An unknown name gets a message rather than doing nothing.

- **Each document opens where it was left** (David, 2026-11-08). Before,
  the view kept the scroll of the document before it, the same for every
  document; only a folder's last document came back where it was. Now
  `loadHere` saves the document being left (the line at the top and the
  cursor; `rememberDocument`, also on every scroll, key and click after
  half a second) and shows the new one where it was left, or at its top the
  first time (`showDocumentPlace`). Every way of opening counts: links, the
  Files list, Go to File, Back and Forward. A heading link still goes to
  its heading. Kept in `session.ts` (`slate-viewer.documents` in local
  storage, the 1,000 most recent documents, keyed by path), so it lasts
  across restarts on that computer, or in that browser on the site. It
  isn't shared between computers or browsers.
  - Desktop: **Go > Remember Position in Each Document** (on by default;
    off opens every document at its top) and **Go > Forget Document
    Positions**.
  - Site: the same two in the account menu (`TitleBar.svelte`).
  - `prefs.ts`: `slate-viewer.remember-positions`.

Changed: src/lib/FolderProperties.svelte, src/App.svelte, src/lib/ActivityBar.svelte,
src/lib/TitleBar.svelte, src/lib/session.ts, src/lib/prefs.ts, README.md, package.json,
package-lock.json, docs/release-0.34.1.md,
docs/change-notes/changenotes_0.34.1.md.

Claude ran `npm run check` (0 errors, 0 warnings) and `npm run build:web`.
Nothing was clicked through in a browser: use the checks below.

## Release

With Company 0.96.21 (`.\scripts\release-laptop.ps1 -Version 0.96.21`).
After v0.34.1's Release workflow, publish
`docs/change-notes/changenotes_0.34.1.md` to the docs space at
`tools/slate-viewer/change-logs/changenotes_0.34.1.md` (Claude does this when
asked) and read it back.

## Checks

1. Open a folder's Properties. A small **?** sits at the top right of the
   General page. Click it: the browser opens the General guide.
2. Go through the other pages: each **?** opens that page's guide (Security,
   Connections, Publishing, Automation, Settings File). On a long page
   (Automation with an action open), the **?** stays in view as you scroll.
3. On the site (metatrash.com), the same buttons open the guide in a new tab.
4. On the site, open `/docs/guides/folder-properties/automation.md` and click
   **Settings → Services → Agents** (under "Who pays"): the Settings dialog
   opens on Services → Agents over the guide. Close it: the guide is still
   there. Ctrl+click opens Settings in a new tab instead.
5. In the desktop Viewer, open the same guide from the docs space and click
   the link: the browser opens metatrash.com Settings on Services → Agents.
6. In a space of yours on the site, put these in a document and click each
   (in reading mode, or Ctrl+click while editing):
   `[files](#panel/files)`, `[outline](#panel/outline/open)`,
   `[security](#properties/./security)`, `[this folder](#properties/automation)`,
   `[change space](#command/change-space)`, `[find](#command/find)`,
   `[dark](#command/theme/dark)`, `[nope](#command/delete)`.
   Expected: the Files panel toggles and its button flashes; the Outline
   opens (a second click leaves it open); Properties opens on Security for
   the top of the space, then on Automation for the document's folder;
   the space picker opens with Change Space flashing; the find bar opens;
   the theme turns dark; `nope` says the link isn't known.
7. `[x](#properties/no-such-folder/general)` says the space has no such
   folder. `[top](#properties//publishing)` opens Publishing for the top of
   the space, like `#properties/./publishing`.
8. A normal heading link (`[top](#some-heading)`) still scrolls to the
   heading.
9. In the desktop Viewer: `#panel/…`, `#properties/…` and
   `#command/change-space` (opens Open Metatrash Space) work the same.
10. Open a long document and scroll to the middle. Open another document
    from Files, scroll it a little, then press Back: the first one is back
    in the middle. Forward: the second is where you left it. A document
    you've never opened starts at its top.
11. Close the Viewer (or reload the site page) and open the first document
    again: still in the middle.
12. Go > Forget Document Positions (site: account menu) says how many it
    forgot; the document then opens at its top. Turning off Remember
    Position in Each Document opens every document at its top.
