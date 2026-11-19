# Slate Viewer 0.46.0: zoom and pan diagrams, coloured code files

Prepared 2026-11-19 by Claude (thread "Add zoom and pan to Mermaid diagrams")
with Slate 0.26.0, released with Company 0.96.61. Tier: Core (Viewer is
public; every instance draws diagrams).

1. Slate 0.26.0 copied into `public/slate/` (`slate.js`, `slate.css`,
   `CHANGELOG.md`; `slate-editor.d.ts`, `mermaid/` and `charts/` unchanged):
   Ctrl+wheel zooms and Ctrl+drag pans a diagram in the page, and the expand
   button opens it full size over the faded page, where the plain wheel and
   drag zoom and pan. See Slate's docs/release-0.26.0.md.
2. No Viewer source change. Slate stops the Ctrl+wheel it uses before it
   reaches `onZoomWheel` in `App.svelte`, so zooming a diagram doesn't zoom
   the window; Ctrl+wheel anywhere else still does. Esc in the full-size view
   is stopped there too, so it doesn't reach the Viewer's own Esc handlers.

Checked in the cloud with Slate's `test/diagram-zoom-check.mjs` (Slate's page
under a strict Content-Security-Policy, with a stand-in for the Viewer's
window Ctrl+wheel listener). `npm run check` and the builds run in
release-laptop.ps1.

## Code files in CodeMirror, coloured (same release)

Added the same day (thread "Colour and edit code files with CodeMirror"),
with Slate 0.26.0's code colouring. Tier: Core.

3. Slate 0.26.0 copied again into `public/slate/` (`slate.js`, `slate.css`,
   `slate-editor.d.ts`, `CHANGELOG.md`) plus the new `public/slate/languages/`
   (CodeMirror's language list and a chunk per language, loaded only when a
   code file or a coloured code block shows). release-laptop.ps1 now copies
   `languages/` whole on every Slate release.
4. `src/App.svelte`: `setPlainText(!isMarkdownName(path), { fileName: path })`,
   so a file that isn't Markdown is coloured by its extension's language
   (`.py`, `.js`, `.json`, `.go`, `Dockerfile` and about 140 more; `.txt` and
   unknown ones stay plain). With Read Only on (or the site's editing switch
   off) it shows in the editor, read only; with it off, the same editor is
   editable. Find (Ctrl+F) searches the editor for such a file in Preview
   too (`inEditor` on `FindBar`).
5. Slate's view switcher has no Preview button now: Edit | Source. Preview
   is Read Only (the site's editing switch off), Ctrl+E or the View menu.
6. Fenced code blocks in Markdown are coloured by their language in Preview.
