# Slate Viewer 0.41.1: the email address straight away

Prepared 2026-11-15 by Claude at David's request: ticking Receive email left
the address blank and told you to close and reopen Properties.

- **Website**: ticking **Receive email in this folder** saves the email
  service at once (only that; other edits in the dialog still wait for Save)
  and shows the folder's address with its Copy button. If that fails, the
  reason shows with a **Create the Address** button.
- **Get a New Address** on the website asks once (**Retire It and Create the
  New Address** or **Keep the Current Address**) and then shows the new
  address straight away.
- The desktop app works as in 0.41.0 (Save, then the address on the website).
- **Pictures on the website** (thread "Fix uploaded pictures and add
  previews", Dave: uploaded pictures were greyed out in Files and opened as an
  empty "Start writing Markdown…" note). The website's backend never said
  which files are virtual (`sync.virtual` answered nothing), so Files dimmed
  them as hidden non-notes and opening one read its empty text into the
  editor. The file list now takes them from the space's listing, which
  already marks them (`virtual`), so pictures, PDFs and other uploads show
  normally with their "virtual" badge. Clicking a picture (PNG, JPEG, GIF,
  WebP, SVG, AVIF, BMP) shows it over the document, fitted to the pane, with
  its size, **Copy Markdown** (`![name](name.preview.jpg)`, using the smaller
  copy Core 0.97.1 makes when there is one) and **Open in New Tab**; Esc or ×
  closes it. Other uploads (a PDF, a zip) open in a new tab instead of as an
  empty note. The desktop app is unchanged (they open in their own app).

Checked in the cloud: `npm run check` (0 errors), and in Chromium against a
mocked site API: ticking writes `{"type": "email"}` and shows the address;
a new address writes `"address": 2` and shows it; Save stays off afterwards.
Not checked: the Tauri build.

Pictures: `npm run check` (0 errors, 0 warnings), and in Chromium against a
mocked site API: a virtual picture in a folder lists undimmed with its badge,
clicking it shows the picture (1600 pixels wide, loaded from `?raw`), Esc
closes it.

Files: `src/lib/FolderProperties.svelte`, `src/App.svelte`,
`src/lib/FilesSection.svelte`, `src/lib/backend/web.ts`, `package.json`,
`package-lock.json`, `docs/change-notes/changenotes_0.41.1.md`, this file.
