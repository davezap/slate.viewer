# Slate Viewer 0.37.0: spaces you manage, Move, and the Organisation tab

Prepared 2026-11-10 by Claude. `npm run check` (0 errors, 0 warnings) passed
in a scratch copy, and so did the Company viewer's check with this source.
Settings was checked in Chromium against a mocked site API: Your spaces with a
managed owner's spaces, a managed space's Members and Ownership pages, an own
space's Move, and the Company Organisation tab (the move and add requests
were checked). Pending David: the release helper, review, commit, tag, push
and publishing the change note.

Step 2, slice 4, of Metatrash Company `docs/roadmap-organisations.md`
(David, 2026-11-10: organisations for Enterprise, built in slices).

- `src/lib/siteAccount.ts`: `AccountSpace.owner`, `Account.manages`,
  `Sharing.moveTo` (Metatrash 0.95.23).
- `src/lib/SettingsDialog.svelte`:
  - Your spaces counts and lists only your own spaces; each managed owner's
    spaces follow under "<owner>'s spaces you manage".
  - A managed space shows its owner/slug address and a "you manage it" pill.
    Its Members page shows the owner account as owner.
  - Ownership has **Move** when `moveTo` lists anywhere: a select and Move
    space (`POST …/spaces/{id}/move {owner}`, Confirm it's you on 403). If
    the open space moved, the app goes to its new address.
  - Transfer ownership on a managed space explains that it must be moved to
    your own account first.
- The Organisation tab is in Company `viewer/src/OrganisationPanel.svelte`.

Files: `src/lib/siteAccount.ts`, `src/lib/SettingsDialog.svelte`,
`README.md`, `package.json`, `package-lock.json`,
`docs/change-notes/changenotes_0.37.0.md`, this file.

Released with Core 0.95.23 and Company 0.96.32; follow its
`docs/release-0.96.32.md`. Publish `changenotes_0.37.0.md` to
`dave-zap/metatrash-com` `tools/slate-viewer/change-logs/` after the tag.

Rollback: install Slate Viewer 0.36.0 (with Company 0.96.31 or older).
