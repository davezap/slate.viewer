# Slate Viewer 0.50.0: Markdown templates

Prepared 2026-11-28 by Claude (thread "Build collaborative forms and
workflows", slice 1), released with Company 0.96.77 and Core 0.103.0. Tier:
Core (public Viewer). Slate is unchanged (0.26.2).

1. **New File from a template** (Metatrash 0.103.0 `templates`,
   `defaultTemplate`): in a space, New File (the Files menu, the button,
   Ctrl+Alt+N) starts from the folder's default template when it has one,
   and the name box is filled with the template's `newName` (numbered when
   taken, as Metatrash does; selected, so typing replaces it). The Files menu adds New from "template" for each
   other listed template and New Blank File when a default applies; New File
   says which template it uses. Templates that aren't in the space's listing
   are left out. `FilesSection.svelte` (`templatesFor`, `suggestName`,
   `startCreate`'s template, `onCreate`'s template; the menu opens once the
   folder's templates are known).
2. **Making the file**: on the website Metatrash makes it
   (`backend.files.createFromTemplate`, `POST .../from-template` with the
   person's local date and time). The desktop app fills the template in
   itself, the same way, with the name and email from `mtsync whoami`, and
   Metatrash Sync sends the file. `lib/templates.ts` (new) mirrors Core's
   `templates.go`; `tests/templates.test.mjs` runs the same cases
   (`npm run test:templates`).
3. **Folder Properties, General: New files**: the templates list (with the
   space's Markdown files as suggestions), New File starts from, and "A
   blank file, even if a folder above names a template". Shows what the
   folder inherits. Both keys are lockable on the Security page.
   `folderSettings.ts`, `FolderProperties.svelte`.
4. `docs/change-notes/changenotes_0.50.0.md`, published to the Collumii docs
   space at `tools/slate-viewer/change-logs/changenotes_0.50.0.md` after the
   release.

`svelte-check` passes (0 errors, 0 warnings); `npm run test:templates`
passes; `npm run build:web` builds. `npm run check` and the builds run in
release-laptop.ps1.
