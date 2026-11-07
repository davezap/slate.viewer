# Slate Viewer 0.28.0 — Convert to Markdown keeps the original in assets/

Prepared 2026-11-07 by Claude. Not yet released.

**Convert to Markdown** (right-click a virtual PDF, Word or HTML file in Files)
now writes `<name>.md` and moves the original into `assets/` beside it, with an
`> [Open original PDF](assets/<name>.pdf)` line at the top of the Markdown
(**Open original Word file** / **web page** for the others). The rename is a
local rename, which mtsync sends to the space as a move, so the original keeps
its file ID and history. An original already in an `assets/` folder stays where
it is and its Markdown goes in the folder above, so converting again replaces
the same `.md` (after asking). Name characters that would break the link
(space, parentheses, `<`, `>`, `%`) are percent-encoded. Nothing else changes:
uploads stay where they are, and no existing file is moved unless someone
chooses Convert to Markdown.

Only `src/App.svelte` (convertToMarkdown), the version in package.json and
package-lock.json, README.md and the change note change. Claude ran
`npm run check` on a clean clone of v0.27.4 plus this change: 0 errors,
0 warnings. Builds were not run.

## Release

Bundled with Core 0.95.5 and Company 0.96.13: run the Company helper
(`scripts/release-laptop.ps1 -Version 0.96.13`, see the private
docs/release-0.96.13.md). Its Viewer stage checks, builds, commits, tags v0.28.0
and waits for Actions.

After v0.28.0's Release workflow finishes, publish
`docs/change-notes/changenotes_0.28.0.md` to the `dave-zap/metatrash-com` space
at `tools/slate-viewer/change-logs/changenotes_0.28.0.md` and read it back
(Claude does this when asked).

## Checks

1. Open a synced space with a PDF in a folder, for example `reports/q3.pdf`.
2. Right-click it, **Convert to Markdown**. `reports/q3.md` opens with an
   **Open original PDF** link at the top; Files shows `reports/assets/q3.pdf`.
3. Click the link: the PDF opens in the system's PDF viewer.
4. After Sync, the website shows `reports/q3.md`, and its link opens the PDF's
   page there. The PDF's History still has its earlier versions (a move, not a
   new file).
5. Convert `reports/assets/q3.pdf` again: it asks to replace `reports/q3.md`
   and the PDF stays in `assets/`.
6. A file named with spaces (`Annual report (draft).pdf`): the link works.
