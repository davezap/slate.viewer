# Slate Viewer 0.45.0: Dave's site notes, batch 1

Prepared 2026-11-19 by Claude (thread "Build the batch of small site fixes")
with Slate 0.25.0, Metatrash Core 0.99.3 and Company 0.96.60. Tier: Core
(Viewer is public), except that the space storage allowance the limit sits
under comes from Company billing.

From Dave's notes while using the site (project file
`collumii-domain/post-rebranding-patches.md`):

1. **New file whose name is taken** (`src/lib/backend/web.ts`): a createOnly
   write refused with `destination_exists` is now a `FileExists` error, "A file
   called test.md already exists in notes/. Choose another name.", not
   `SaveConflict`. New Folder says the same of a folder. Duplicate still steps
   past taken names. `App.svelte` `showError` shows only the message (no
   "SaveConflict:" or "Error:" prefix); a FileExists is an info box. The Files
   name box stays open, as it did for any failure.
2. **Change Space** (`SpacePicker.svelte`): Public is gone as a heading; the
   public space is listed under Help, after the documentation. Headings with
   nothing under them were already hidden (`sections` filters empty lists);
   Help now follows the same rule. Rows are a snippet shared by both places.
3. **Account menu** (`TitleBar.svelte`): inbox and gear icons beside My
   Submissions and Settings (`.menu-icon`); the two document-position items are
   gone from it (the desktop app keeps them under Go).
4. **Settings** (`SettingsDialog.svelte`): the first group is General
   (address still `#settings/profile`): Profile (username, email, Danger zone
   with Delete account; `#settings/profile/delete` scrolls to it) and Settings
   (`#settings/profile/settings`: Remember position in each document, Forget
   document positions). App passes `rememberPositions` and the two actions.
5. **Storage limit** (`SettingsDialog.svelte`, `siteAccount.ts`): when the
   account answer has `spaceLimits` (Core 0.99.3 with
   `deploy/account-space-storage-limit.sql` applied), a space's General page
   has Storage limit in GB, posted as `storage-limit {limit: bytes|null}`, and
   Your spaces shows "size of limit".
6. Slate 0.25.0 copied into `public/slate/` (code blocks).

Checked in the cloud: `npm run check` (0 errors) and `npm run build:web`.
