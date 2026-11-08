# Slate Viewer 0.34.0 — locks for each kind of agent, forms sent by agents

Prepared 2026-11-08 by Claude. Not yet released. Pairs with Core 0.95.12
(new lock levels, `fillForms` and `takeQuizzes`, agents sending forms, actions
governed by locks, default locks). Ships in Company 0.96.20. Against an older
server the new choices are refused by Sync, so release them together.

- **Lock levels** (`folderSettings.ts`, `FolderProperties.svelte`): `LockLevel`
  adds `folderAgents` and `connectedAgents`. The Security page's dropdowns
  (locked settings and read-only files) offer Unlocked, Locked for folder
  actions, Locked for connected agents, Locked for agents and Locked for
  everyone. Inherited locks, lock notes and Use the Parent's Locks all know
  the new levels. `space.ts fileLock` counts either kind as "agents".
- **Form locks**: `fillForms` (Fill in forms) and `takeQuizzes` (Take
  quizzes) are rows in the Locked settings table and written in `locked`.
- **Default locks**: a missing top-level `.metatrash.json` now stands for the
  one Metatrash 0.95.12 gives a new space (`DEFAULT_LOCKS`).
- **Send forms** (`folderActions.ts`): the `submit` tool is never part of
  "All tools". A checkbox under Limits and tools adds it to the action's
  `tools` (with every tool listed when "All tools" is chosen) or takes it
  out. "Only these" keeps it.
- **Copies sent by agents** (`forms.ts`, `ReviewBanner.svelte`): the copy's
  `submittedVia` shows on the review bar as "from Pat, sent by Claude (an
  agent) …".

Changed: src/lib/folderSettings.ts, src/lib/folderActions.ts,
src/lib/FolderProperties.svelte, src/lib/space.ts, src/lib/forms.ts,
src/lib/ReviewBanner.svelte, README.md, package.json, package-lock.json,
docs/release-0.34.0.md, docs/change-notes/changenotes_0.34.0.md.

Claude ran `npm run check` (0 errors, 0 warnings), `npm run build` and
`npm run build:web`. A scratch script checked the settings and tools logic
under Node: the default top-level text matches Core's byte for byte, new
levels and form locks round-trip, inherited form locks are seen, and send
forms switches between all tools, a list and back. The dialog itself wasn't
clicked through in a browser: use the checks below.

## Release

With Company 0.96.20 (`.\scripts\release-laptop.ps1 -Version 0.96.20`).
After v0.34.0's Release workflow, publish
`docs/change-notes/changenotes_0.34.0.md` to the docs space at
`tools/slate-viewer/change-logs/changenotes_0.34.0.md` (Claude does this when
asked) and read it back.

## Checks

1. After the server restarts on 0.95.12, open the top of an existing space's
   Properties > Security. Actions, Published version, Read-only files and
   Connections show "Locked for folder actions", and Take quizzes "Locked for
   agents". The space's history has one commit "add the default locks to
   .metatrash.json" (or none, if every folder already had them). Restart
   again: no new commit.
2. Set Fill in forms to "Locked for connected agents", save. Ask Claude (MCP)
   to fill in a form in that folder: it is refused (`locked_form`). Set it
   back to Unlocked: Claude's `submit` files a copy, and opening the copy
   shows "sent by Claude (an agent)" on the review bar.
3. A form with a signature field: Claude's `submit` is refused
   (`person_must_sign`). You can still send it.
4. A quiz: Claude is refused while Take quizzes is locked for agents.
5. Automation: tick "Let it send forms in this folder" on an action, save,
   and look at the Settings File page: `tools` lists every tool and
   `submit`. Untick it: `tools` goes away. With "Only these" and a few tools
   ticked, the box adds and removes `submit` only.
6. With Actions "Locked for folder actions" (the default), a job that tries
   to change actions is refused (runner.md says so). Set Actions to
   Unlocked: a job may add another action, but not change its own.
7. Ask Claude (MCP) to change an action in your space: it can now (Actions
   isn't locked for connected agents by default), and the commit says it
   was Claude. Lock Actions for agents: Claude is refused.
