# Slate Viewer 0.30.0 — see what is happening in a space

Prepared 2026-11-07 by Claude. Not yet released. Needs Core 0.95.9 (the
`activity` call); ships in Company 0.96.16.

- **Upload rows (website).** `uploadFiles` puts a row in Files for every file
  at once (`waiting`), then `uploading` with the percentage, `storing` once
  the body has gone, and takes the row away when the listing has the file.
  A failed upload (refused name, over 100 MB, no room, a cut connection)
  stays as a red **upload failed** row; clicking it shows why and removes it.
  The old error dialog after a batch is gone. The site uploads with
  `XMLHttpRequest` (fetch can't report upload progress).
- **Activity chips.** App.svelte asks `GET …/activity?viewing=<open file>`
  (web.ts; desktop.ts answers null, so the desktop does nothing new) every
  3 s while something is under way, every 15 s otherwise, only while the
  page is visible, and at once after an upload or when another file is
  opened. When something finishes, Files is listed again at once, so a new
  `name.md` appears without waiting for the next poll. FilesSection shows
  chips after file names (src/lib/activity.ts has the words and colours), a
  spinner on collapsed folders with work inside, a summary line at the top of
  Files and the initials of other people here.

Changed: src/App.svelte, src/lib/activity.ts (new),
src/lib/FilesSection.svelte, src/lib/backend/{types,desktop,web}.ts,
package.json, package-lock.json, README.md,
docs/change-notes/changenotes_0.30.0.md.

Claude ran `npm run check` (0 errors, 0 warnings) and `npm run build:web`,
and looked at the website build in Chromium against a stand-in site API
(conversion, agent and presence chips, three uploads with one refused). Real
upload progress events, a real Docling conversion and a second person's
presence are first tried in the checks below.

## Release

With Core 0.95.9 and Company 0.96.16 (`scripts/release-laptop.ps1 -Version
0.96.16`). After v0.30.0's Release workflow, publish
`docs/change-notes/changenotes_0.30.0.md` to the docs space at
`tools/slate-viewer/change-logs/changenotes_0.30.0.md` (Claude does this when
asked) and read it back.

## Checks (website, signed in, a space you can write)

1. Drop three files at once, one of them a PDF of a few MB: all three rows
   appear at once; the big one counts up `uploading N%`, then `storing…`,
   then the row turns into the real file.
2. Within seconds the PDF shows `queued` or `converting 0:0x` with a running
   timer, and the line at the top of Files says `Converting name.pdf …`.
3. When it finishes, `name.pdf` disappears, `name.md` appears with
   `✓ converted` (hover: made from name.pdf, original in assets/), without
   reloading.
4. Upload `x.pdf` into a folder that has `x.md`: after converting it shows
   `kept as is`, hover says `x.md already exists`.
5. Drop a file over 100 MB (or a name with `:` in it): a red
   `upload failed` row; clicking it explains and removes it.
6. In a folder with an action, add a file that triggers it: the file shows
   `agent waiting`, `agent 0:0x`, then `✓ agent done` (or `agent failed`
   with the reason on hover).
7. Open the same space in a second browser signed in as another member: each
   sees the other's initials at the top of Files and on the open file, and
   they go about a minute after that window closes.
8. Collapse a folder while something converts in it: a small spinner shows
   on the folder row.
9. Slate Viewer on the desktop: uploads and everything else work as in
   0.29.0 (nothing new is shown there yet).
