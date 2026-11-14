# Slate Viewer 0.39.0: footer lines and theme fade

Prepared 2026-11-14 by Claude (post-rebranding patches). Not type-checked
here (svelte-check can't run in the device shell); David's
`build-frontends` run and the release helper are the check. Pending David:
the release helper (Company 0.96.45 manifest), review, commit, tag, push and
publishing the change note.

Tier: public. Multi-line footers and the theme fade are plain Viewer
features any edition can use.

- `src/lib/folderSettings.ts`: `MAX_FOOTER_LINES = 3`; `cleanFooter()`
  turns CRLF into LF, trims each line and drops blank lines at both ends;
  `footerProblems` allows line breaks and reports more than three lines.
- `src/lib/footer.ts`: `renderFooter` makes one `<p>` per line.
- `src/lib/FolderProperties.svelte`: the footer field is a three-row
  textarea, with the hint saying Enter starts a new line.
- `src/app.css`: `.page-footer p + p` spacing, and the `html.theme-fade`
  rule (colour properties only, `--theme-fade`, default 600 ms).
- `src/lib/themeFade.ts` (new): `fadeTheme(change)` adds `theme-fade` to
  `<html>` for the length of the fade. It skips the first paint (no
  `data-theme` yet) and `prefers-reduced-motion: reduce`.
- `src/App.svelte`: choosing a theme and the system theme changing both go
  through `fadeTheme(applyTheme)`.

Server: a footer with line breaks needs Metatrash 0.95.29 (Core's
`checkFooter` refused `\n` before). With an older server the Viewer's
check passes but the save is refused with the server's message.

Files: `src/App.svelte`, `src/app.css`, `src/lib/FolderProperties.svelte`,
`src/lib/folderSettings.ts`, `src/lib/footer.ts`, `src/lib/themeFade.ts`,
`package.json`, `package-lock.json`,
`docs/change-notes/changenotes_0.39.0.md`, this file.

Change note: publish `docs/change-notes/changenotes_0.39.0.md` to the docs
space (dave-zap/metatrash-com, or dave-zap/collumii after the rename; the
old address keeps working) at
`tools/slate-viewer/change-logs/changenotes_0.39.0.md` once v0.39.0 is
tagged, and read it back.
