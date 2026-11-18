# Slate Viewer 0.44.2: real names, mode buttons, menu tick

Prepared 2026-11-18 by Claude (thread "Build Collumii dashboards") from
Dave's 0.96.57 checks, for Company 0.96.58 with Slate 0.24.2 (Core
unchanged, 0.99.1). Tier: Core (public Viewer).

1. **Names** (`src/lib/types.ts` `displayName`): Files hid `.md` from every
   Markdown name, so `jobs.csv.md` showed as `jobs.csv` and Rename (which
   starts from the shown name) could not get rid of the `.md`. The `.md` is
   now hidden only when what is left has no extension of its own
   (`hasOwnExtension`). Rename then starts from `jobs.csv.md`, and typing
   `jobs.csv` renames it. `Sidebar.svelte` and `QuickOpen.svelte` use the
   same `displayName` instead of their own copies. File > New File
   (`App.svelte` `newFile`) passes the dialog's whole name to
   `createNote` instead of stripping `.md` first.
2. **Mode buttons**: Slate 0.24.2 keeps Edit | Preview | Source at the right
   when the formatting buttons are hidden. Vendored `public/slate/`.
3. **Menu tick** (`src/lib/ContextMenu.svelte`): items with `checked` (Show
   Hidden Files) show a ✓ column and are `menuitemcheckbox` with
   `aria-checked`. The native View menu already had its tick.

Checked in the cloud: `npx svelte-check` (0 errors), `displayName` cases
(`jobs.csv.md`, `notes.md`, `Plan v1.2.md`, `.gitignore`, `README.MD`),
and the switcher's position in Slate for plain text in all three modes.
