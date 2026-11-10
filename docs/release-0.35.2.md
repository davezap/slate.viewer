# Slate Viewer 0.35.2: My Submissions in the account menu, a waiting count, green ticks, requests that stand out

Prepared 2026-11-09 by Claude. `npm run check` (0 errors, 0 warnings) and
`vite build --mode web` passed in a scratch copy; the sent-back bar was
checked in Chromium. Pending David: the release helper, review, commit, tag,
push and publishing the change note.

David asked (2026-11-09, after testing 0.35.1):

- `src/lib/TitleBar.svelte`: the website's account menu has **My Submissions**
  (inside a space) and a line saying what is waiting; the account icon carries
  a red number (`todo`, capped at 99+) with the same text in its tooltip.
- `src/App.svelte`: passes `onSubmissions`, `todo` (`thingsToDo`) and
  `todoText` to the title bar, and `approved` to the tree; approving a copy
  here ticks it at once.
- `src/lib/FilesSection.svelte`: `approved` prop, a green ✓ after the names of
  approved copies (Metatrash 0.95.21).
- `src/lib/SubmissionsDialog.svelte`: a green ✓ before approved forms, a red
  dot and red status on forms sent back; a sent-back form's request is shown
  in a highlighted box instead of a plain "Note" line; the review line of an
  approved form is green.
- `src/lib/FormBanner.svelte`: a form sent back has an amber bar with the
  request in a white box, large and bold, under "Sent back: the reviewer needs
  more from you".
- `src/lib/policies.ts`, `src/lib/backend/web.ts`: `approved` (empty when
  absent).

The desktop app keeps My Submissions in the File menu and its taskbar number;
the tree's ticks there need mtsync 0.95.21.

Files: `src/App.svelte`, `src/lib/TitleBar.svelte`,
`src/lib/FilesSection.svelte`, `src/lib/SubmissionsDialog.svelte`,
`src/lib/FormBanner.svelte`, `src/lib/policies.ts`, `src/lib/backend/web.ts`,
`README.md`, `package.json`, `package-lock.json`,
`docs/change-notes/changenotes_0.35.2.md`, this file.

Released with Core 0.95.21 and Company 0.96.29; follow its
`docs/release-0.96.29.md`. Publish `changenotes_0.35.2.md` to
`dave-zap/metatrash-com` `tools/slate-viewer/change-logs/` after the tag.

Rollback: install Slate Viewer 0.35.1.
