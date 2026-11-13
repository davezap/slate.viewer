# Slate Viewer 0.38.0: edition brand

Prepared 2026-11-13 by Claude. `npm run check` (0 errors, 0 warnings) and
`npm run build:web` passed in a scratch copy of v0.37.0. A build with a
test edition using Company's Collumii wordmark and stylesheet was run on a
local Core 0.95.28 and looked at in Chromium in light and dark (header
wordmark, page title, Inter loaded, palette). Pending David: the release
helper, review, commit, tag, push and publishing the change note.

Release 1 of the Collumii rebrand (dave-zap/metatrash `branding/`). Tier:
the hook is public (this repository), because any edition of the site may
name itself; the Collumii name, wordmark and colours are in Metatrash
Company's `viewer/src/brand/`.

- `src/lib/editionTypes.ts`: `Brand { name; wordmark? }`.
- `src/lib/edition.ts`: the public edition's `brand`, `{ name: 'Metatrash' }`.
- `src/lib/TitleBar.svelte`: the website header shows the edition's
  wordmark component when it has one (`.brand-mark`, 22 px high, 18 px on
  phones), else its name in lower case as the text wordmark.
- `src/lib/backend/web.ts`: page titles end with `— <brand name>`, and the
  message box title on the site is the brand name.

Added 2026-11-14 (Dave), checked the same way (first visit: panels closed
and Document Nav pinned, a returning browser unchanged; the title-bar
Changes button on and off with history; a page opened at its start shows
its top padding):

- `src/lib/prefs.ts`: `firstVisit()` (true once, when no `slate-viewer.*`
  key is stored; it stores `slate-viewer.visited`) and
  `useLandingLayout()` (sections all off but Document Nav, which is pinned).
- `src/App.svelte`: the website applies the landing layout on a first
  visit, before the sidebar reads its settings, and opens the folder
  without forcing Files on that once. The website no longer gives Slate the
  Changes toggle (`setChangesToggle(null)`), so a read-only page has no
  toolbar; the title bar's toggle calls `toggleChanges()`. A document
  opened at line 0 scrolls to the very top (`toVeryTop()`), since Slate
  puts line 0 under the pane's top padding.
- `src/lib/TitleBar.svelte`: `changes` / `onChanges` props, a +/- button
  before Find (pressed while changes show), website only.

Files: `src/App.svelte`, `src/lib/prefs.ts`, `src/lib/editionTypes.ts`, `src/lib/edition.ts`,
`src/lib/TitleBar.svelte`, `src/lib/backend/web.ts`, `README.md`,
`package.json`, `package-lock.json`,
`docs/change-notes/changenotes_0.38.0.md`, this file.

Change note: publish `docs/change-notes/changenotes_0.38.0.md` to
dave-zap/metatrash-com `tools/slate-viewer/change-logs/changenotes_0.38.0.md`
once v0.38.0 is tagged, and read it back.
