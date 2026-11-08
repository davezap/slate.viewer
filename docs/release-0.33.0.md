# Slate Viewer 0.33.0 — clearer folder tree, folder links

Prepared 2026-11-08 by Claude. Not yet released. Pairs with Core 0.95.11
(folder addresses without a slash, safer file names); each works without the
other. Ships in Company 0.96.19.

- **Guide lines** (`FilesSection.svelte`): an open folder's `<ul>` gets class
  `children` and `--guide` (the centre of the folder's arrow); a 1px line in
  `--side-border` runs down beside its contents. Desktop and website.
- **`.metatrash.json` as a new file name** (`finishCreate`): when the Files
  list has `onProperties` (a space), naming a new file `.metatrash.json` or
  `metatrash.json` (any case) closes the name box and opens that folder's
  Properties instead of creating `.metatrash.json.md`. Local folders behave
  as before.
- **Copy Address on a folder** (website): the address ends in `/`. Before, it
  gave `/spaces/owner/slug/guides`, which older servers answered with 404.

Changed: src/lib/FilesSection.svelte, package.json, package-lock.json,
docs/release-0.33.0.md, docs/change-notes/changenotes_0.33.0.md.

Claude ran `npm run check` (0 errors, 0 warnings) and mounted the Files list
in Chromium with a stand-in space: guide lines drawn at each level (three
deep), `.metatrash.json` opened Properties for the folder and made no file,
`notes` still made a file.

## Release

With Company 0.96.19 (`.\scripts\release-laptop.ps1 -Version 0.96.19`).
After v0.33.0's Release workflow, publish
`docs/change-notes/changenotes_0.33.0.md` to the docs space at
`tools/slate-viewer/change-logs/changenotes_0.33.0.md` (Claude does this when
asked) and read it back.

## Checks

1. Open a space with nested folders, with View > Show Hidden Files on: each
   open folder's contents have a line under its arrow, and each
   `.metatrash.json` sits on its folder's line.
2. New File in a folder, type `.metatrash.json`, Enter: that folder's
   Properties open and no file appears. Try a normal name: a note is made.
3. On the site, right-click a folder in Files and choose Copy Address. Paste
   it: it ends in `/` and opens the folder's page. On a file: no slash added.
