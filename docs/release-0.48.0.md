# Slate Viewer 0.48.0: folder order, run an action again, invitation permission

Prepared 2026-11-23 by Claude (thread "Build the small ideas batch", slice 2),
released with Company 0.96.74, Core 0.101.0 and Slate 0.26.2. Tier: Core
(public Viewer).

1. **Folder order** (`sort` in `.metatrash.json`, Metatrash 0.101.0):
   `FilesSection.svelte` sorts a folder Z to A when its description says
   `sort: "z-a"` (folders still first). On the desktop the description comes
   from `folder_descriptions` (`src-tauri/src/workspace.rs`, new `sort`
   field); on the website from the file list, which marks each folder's
   `.metatrash.json` with its `sort` (`backend/web.ts`: `folderDescriptions`
   now returns those folders). Folder Properties, General: "Order in Files",
   Name A to Z or Z to A (`folderSettings.ts`: `zToA`, the `sort` key, never
   inherited, lockable as "Order in Files").
2. **Run Again on All Files** (Metatrash 0.101.0 `rerun`): on the
   Automation page, a saved and unchanged action that files start gets a card
   in its body. It asks the site first (file count, a few names, who pays,
   which agent), then queues on "Run on N files". Errors from the site (not
   the payer, over 100 files, jobs still waiting) show in the card. Website
   only: `siteAccount.ts` `rerunAction`.
3. **Invitation permission**: Settings → Spaces → (space) → Members shows
   each pending invitation's "Apps: read and write / read only" when the
   server keeps it (`agentPermission` on the invitation), and changes it with
   the `invitation-agent` action.
4. `public/slate/`: Slate 0.26.2 (diagrams measured right at any page zoom),
   copied in by release-laptop.ps1 after Slate's tag.
5. `docs/change-notes/changenotes_0.48.0.md`, published to the Collumii docs
   space at `tools/slate-viewer/change-logs/changenotes_0.48.0.md` after the
   release.

`svelte-check` passes (0 errors, 0 warnings). `npm run check` and the
builds run in release-laptop.ps1.
