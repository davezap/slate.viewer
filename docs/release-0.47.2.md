# Slate Viewer 0.47.2: fewer false prompts

Prepared 2026-11-22 by Claude (thread "Build the small ideas batch", slice 1),
released with Company 0.96.73 and Core 0.100.2. Tier: Core (public Viewer).

1. `src/App.svelte` `checkDisk`: a failed read of the open file counted as
   "deleted", which marked the document changed. Reading a document an agent
   was updating, a refused read (the site's rate limit) or a dropped
   connection was enough for leaving it to ask "Do you want to save the
   changes?". Now only a real "not found" counts (`fileIsGone`: the site's
   404, the desktop's os error 2 or 3); other failures wait for the next
   check.
2. `src/App.svelte` `checkDisk`: the site reports the window's own save a
   few seconds later. With more typed since, the text differed from the
   window's and it asked about a conflict with nobody. A version equal to the
   text this window last read or saved (`diskText`) is now ignored.
3. `src/App.svelte` `showDocumentPlace`/`toVeryTop`: a document with no
   remembered place opens at the very top. Before, the scroll was reset only
   when under 64 pixels and before Slate finished laying out, so documents
   opened a little way down with the title hidden.
4. `src/lib/site.ts` `rememberPlacesWhile`, called from `App.svelte` once
   the page knows whether it is signed in: the last place is remembered only
   while signed in. Signing out lands on the docs home; that page used to
   become the last place, so signing in again opened it instead of where
   the person was.
5. `src/lib/siteAccount.ts` `passkeyProblem(error, using)` and
   `ConfirmSheet.svelte`: "Use a passkey" when confirming it's you now says
   that no passkey was used, the likely reasons (another device or password
   manager, or a passkey made for the site's old address) and what to do,
   instead of "Cancelled or timed out". Adding a passkey keeps the old message.
6. `public/slate/`: Slate 0.26.1 (diagram labels no longer cut off; heading
   jumps land while diagrams draw), copied in by release-laptop.ps1 after
   Slate's tag. No Viewer source change for it.
7. `docs/change-notes/changenotes_0.47.2.md`, published to the Collumii docs
   space at `tools/slate-viewer/change-logs/changenotes_0.47.2.md` after the
   release.

No server change. `npm run check` and the builds run in release-laptop.ps1.
