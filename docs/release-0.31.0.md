# Slate Viewer 0.31.0 — folder actions in Properties

Prepared 2026-11-07 by Claude. Not yet released. Needs Core 0.95.9 or later
(no Core change); ships in Company 0.96.17.

- **Automation page (desktop and website).** Properties > Automation lists
  the folder's `actions` (Metatrash 0.54.0 to 0.57.x) as cards and edits
  each one: name; files arriving (patterns, with a preview of matching
  files, and `"when": "change"`) or a schedule (`every`, built from
  hour / day / weekday / a weekday / a day of the month and a time); `do`
  written in place or a `.md` file of the folder; `model` (on the website a
  list of the person's own agents from `/api/v1/site/account/services`;
  otherwise each provider's suggested model or a typed one); `pays`
  (contributor needs a model, never with a schedule); steps, `web`,
  `agentsMd` and `tools` under Limits and tools. **Open the Run Log** opens
  `runner.md`.
- **Same rules as Metatrash.** `src/lib/folderActions.ts` mirrors
  actions.go `checkActions` and `checkActionsWriter`, schedules.go
  `parseEvery`, runner_tools.go and agent_config.go `actionModel`. Who is
  saving comes from `whoami` (the site session on the web, mtsync on the
  desktop): the owner (username = the space's owner) changes their own
  actions and may remove a member's or adopt it (drops `member`); a member's
  new actions carry `"member": "<username>"` and the rest are read-only for
  them. Actions only in owned spaces (owner/slug). An action whose meaning
  didn't change is written back exactly as it was (a comma string `on`
  stays a string), so a member's action is never "changed" by accident.
- **Settings fixes.** `actions` is now one of the lockable keys on the
  Security page (Metatrash had it since 0.54.0), and the dialog no longer
  treats `actions` as inherited (Metatrash never passes them down). The save
  note on the website no longer mentions Metatrash Sync.
- **metatrash.com opens where you left off.** `src/lib/site.ts` keeps the
  address of the open file in `localStorage` (`metatrash.lastPlace`) each
  time the address bar follows it. `src/main.ts` asks `restoreLastPlace()`
  before the app starts: on the home page (`config.address === '/'`, path
  `/`, no hash or query) it does `location.replace(last)`. Not after a
  reload or Back, not when the logo was clicked (it sets
  `sessionStorage metatrash.goingHome`), and Sign out forgets the place.

Changed: src/lib/FolderProperties.svelte, src/lib/folderSettings.ts,
src/lib/folderActions.ts (new), src/lib/site.ts, src/lib/TitleBar.svelte,
src/main.ts, package.json, package-lock.json, README.md,
docs/release-0.31.0.md, docs/change-notes/changenotes_0.31.0.md.

Claude ran `npm run check` (0 errors, 0 warnings), `npm run test:polling`,
`npm run build` and `npm run build:web`, unit-tested folderActions.ts
(schedules, raw actions kept, checks, owner/member rules, file matching),
and used the Automation page in Chromium with a stand-in backend as the
owner and as a member (light and dark), plus the home-page restore (fresh
visit restores, logo / reload / `#settings` stay home). Not yet tried
against a real server: the first real save of an action is check 3 below.

## Release

With Company 0.96.17 (`.\scripts\release-laptop.ps1 -Version 0.96.17`,
which reuses Core v0.95.9). After v0.31.0's Release workflow, publish
`docs/change-notes/changenotes_0.31.0.md` to the docs space at
`tools/slate-viewer/change-logs/changenotes_0.31.0.md` (Claude does this when
asked) and read it back.

## Checks

On staging first (website, signed in, a folder in a space you own):

1. Properties > Automation on a folder with no actions: the explanation,
   **Add an Action**, and nothing else odd. In `dave-zap/metatrash` `news/`,
   the existing `news` action shows as "Every day at 06:00".
2. Open `news`, change nothing, look at Settings File: the action is exactly
   as on disk, and Save stays disabled.
3. Add an action on a test folder: files arriving `inbound/*.md`,
   instructions "Add a line 'seen' to the end of the file.", your MiniMax
   agent from the list, Save. Drop a note into `inbound/`: the file shows
   `agent waiting` then `done`, and **Open the Run Log** shows the job.
4. Change it to On a schedule, Once a week, Monday at 09:00: Settings File
   shows `"every": "monday 09:00"`; Save is accepted. Remove it and save.
5. Type a bad name (`Bad Name`) or clear the instructions: the red note on
   the page, a dot on Automation, Save disabled.
6. As a member of someone else's space (if you have one): the owner's
   actions are greyed out; a new one gets `"member": "<you>"` and saves.
7. Security page: Actions appears in Locked settings; set it Locked for
   everyone, save, and the Automation page goes read-only with the lock note.
8. Open a document in a space, then go to metatrash.com in a new tab: it
   opens that document. Click the metatrash logo: the home page. Sign out,
   go to metatrash.com: the home page.
9. Slate Viewer on the desktop: Properties > Automation works the same
   (the model list shows the two providers' suggested models instead of
   your agents).
