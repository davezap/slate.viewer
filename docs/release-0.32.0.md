# Slate Viewer 0.32.0 — ask for more on a form

Prepared 2026-11-08 by Claude. Not yet released. Needs Core 0.95.10 (server
and mtsync); ships in Company 0.96.18, which also carries 0.31.0 (Company
0.96.17 was never tagged).

- **Review bar.** A form copy (not a quiz) gets **Ask for More** beside
  Approve and Decline. It needs a note: with an empty note the box asks
  "What should <name> add or change?" and nothing is sent. It sends
  `{"status": "needs-info", "note"}` to `reviews`. A `resent` copy shows
  that a fixed copy arrived and offers no review buttons; a copy with
  `resends` says it is a fixed copy.
- **Form bar.** When a form opens in a space, `needsInfo()` asks for the
  person's receipts (one `submissions` call; on the desktop `mtsync
  submissions`) and, when their newest copy of this form is `needs-info`,
  reads it with its answers. The bar shows the note, **Fix My Answers**
  (fills the form with the answers sent and keeps them as the draft) and
  says that sending replaces the old copy. Any Send of that form while it
  is sent back carries `resends` (desktop: `mtsync submit -resends ID`,
  which needs mtsync 0.95.10; older mtsync gets a clear message). A
  `not_needs_info` refusal (the reviewer approved or declined it meanwhile)
  drops the link and says to Send again as a new copy. Older servers or
  mtsync: the receipts call fails quietly and forms work as before.
- **My Submissions** shows "Needs more information" and "Sent again", and
  for a needs-info copy says to open the form to fix it.
- `forms.ts`: `ReviewStatus` adds `needs-info` and `resent`;
  `parseFiledCopy` reads them and `resends` / `resentAs`; `answerKeyText`
  leaves those lines out.

Changed: src/App.svelte, src/lib/forms.ts, src/lib/FormBanner.svelte,
src/lib/ReviewBanner.svelte, src/lib/SubmissionsDialog.svelte,
src/lib/backend/types.ts, src/lib/backend/web.ts,
src/lib/backend/desktop.ts, src-tauri/src/mtsync.rs, package.json,
package-lock.json, README.md, docs/release-0.32.0.md,
docs/change-notes/changenotes_0.32.0.md.

Claude ran `npm run check` (0 errors, 0 warnings), `npm run build`,
`npm run build:web` and `cargo test --lib mtsync` (version gate), and
clicked the review bar and form bar in Chromium with a stand-in backend
(empty note refused, Ask for More sends needs-info with the note, Fix My
Answers fires). Not yet tried against a real server.

## Release

With Company 0.96.18 (`.\scripts\release-laptop.ps1 -Version 0.96.18`).
After v0.32.0's Release workflow, publish
`docs/change-notes/changenotes_0.32.0.md` to the docs space at
`tools/slate-viewer/change-logs/changenotes_0.32.0.md` (Claude does this when
asked) and read it back.

## Checks

Use two accounts as in the 0.50.0 quiz checks (Switch Account): a sender with
access to the form's space and a reviewer who can write to the review space.

1. As the reviewer, open a fresh copy of a plain form. Choose **Ask for More**
   with an empty note: the box asks what to add, nothing is saved. Type a
   note and choose Ask for More: the bar says "Needs more information" with
   your note, and Approve Instead / Decline Instead stay.
2. As the sender, open the form. The bar shows "A reviewer asked for more"
   with the note and **Fix My Answers**. Choose it: the form fills in with
   what you sent. Change an answer and **Send**: the bar says "Sent again".
3. My Submissions: the new copy waits for review; the old one says "Sent
   again".
4. As the reviewer, sync and open the old copy: it says a fixed copy
   arrived, with no review buttons; its front matter has `status: resent`
   and `resentAs`. Open the new copy: it says it is a fixed copy
   (`resends`). Approve it.
5. Ask for more on another copy, then Approve it before the sender resends.
   As the sender, Send: the bar says the copy is not waiting any more and
   to Send again as a new copy; Send again works.
6. A quiz copy has no Ask for More.
