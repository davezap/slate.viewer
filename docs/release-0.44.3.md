# Slate Viewer 0.44.3: fewer card refreshes, folders open on their home page

Prepared 2026-11-18 by Claude (thread "Build Collumii dashboards") for
Company 0.96.59 (Core 0.99.1 and Slate 0.24.2 unchanged). Tier: Core.

Dave saw "Rate limit reached" in the website while Claude wrote about 100
files into the docs space. `App.svelte` `refreshCardsSoon()` ran on every
folder change and, on the web, redrew every card 500 ms later, so each
change cost one request per card. Now the first change still refreshes after
500 ms (4 s on the desktop), and further changes wait until 15 s
(`CARD_REFRESH_GAP_MS`) after the last refresh, with one timer at a time.
Slate's own once-a-minute refresh is unchanged.

**Folders open on their home page** (Dave, same day): `FilesSection.svelte`
calls the new `onFolderOpen` when a folder's row opens (not when it closes);
`App.svelte` `openFolderHome()` opens the folder's own `home` setting, else
its `dashboard.md`, else its `README.md` (`homeNote`), and does nothing for a
folder with none. `FolderProperties.svelte` shows Opens on for every folder,
not only the top one; Core already accepts `home` in any folder's
`.metatrash.json` (it is never inherited).

**Footer below the cards** (Dave, same day): with cards, Slate makes the
Preview pane a wrapping flex row, so the website's `.page-footer` (put last in
the pane by `placePageFooter`) flowed in beside the last card. `app.css` gives
it `flex: 0 0 100%`, a row of its own.

Checked in the cloud: `npx svelte-check` (0 errors). Not checked in a
browser: a click on a folder (Dave's check list in the release script).
