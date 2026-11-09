# Slate Viewer 0.35.1: red dots for forms waiting for you, clearer reviews

Prepared 2026-11-09 by Claude. `npm run check` (0 errors, 0 warnings) and
`vite build --mode web` passed in a scratch copy. Pending David: the release
helper, review, commit, tag, push and publishing the change note.

David found (2026-11-09) that new copies in a review folder get no red dot (the
acknowledge service marks published files only), and that after Approve or Ask
for More the review bar changed too quietly to notice; both reviews had saved.

Changes:

- `src/lib/policies.ts`: `Policies` has `toReview` and `toFix` (Metatrash
  0.95.20; empty when absent); `thingsToDo` counts files to read, copies to
  review and forms sent back.
- `src/lib/FilesSection.svelte`: `toReview` and `toFix` props; the tree's red
  dot marks them and their folders, with tooltips saying which ("2 to review in
  here", "waiting for someone to approve…", "sent this form back to you…").
- `src/App.svelte`: passes the lists to the tree, counts them in the taskbar
  number and the status chip ("1 to review", "1 sent back"); a saved review
  drops the copy's dot at once and asks again; sending a form always reloads
  the lists (clears a sent-back dot). Passes `done` to the review bar.
- `src/lib/ReviewBanner.svelte`: after a review saves, a line in bold says what
  happened ("Approved. dave-zap sees this, and your note, in My Submissions.",
  "Sent back to … with your note. The form gets a red dot for them …"), and
  the note box and ticks clear.
- `src/lib/backend/web.ts`: the signed-out answer carries empty lists.

On the desktop the lists come through `mtsync -json policies`, so they need
mtsync 0.95.20; an older mtsync or server shows no dots and nothing breaks.

Files: `src/App.svelte`, `src/lib/FilesSection.svelte`,
`src/lib/ReviewBanner.svelte`, `src/lib/policies.ts`, `src/lib/backend/web.ts`,
`README.md`, `package.json`, `package-lock.json`,
`docs/change-notes/changenotes_0.35.1.md`, this file.

Released with Core 0.95.20 and Company 0.96.28; follow its
`docs/release-0.96.28.md`. Publish `changenotes_0.35.1.md` to
`dave-zap/metatrash-com` `tools/slate-viewer/change-logs/` after the tag.

Rollback: install Slate Viewer 0.35.0. The dots and the review bar's line go;
reviews work as before.
