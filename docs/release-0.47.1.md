# Slate Viewer 0.47.1: no signed-out to-do request, 1 MB notes

Prepared 2026-11-22 by Claude (thread "Security and edge-case review of
Enterprise releases"), released with Company 0.96.72 and Core 0.100.1. Tier:
Core (public Viewer).

1. `src/lib/backend/web.ts`: `accountCall` (forms to-do list, the account's
   receipts) asks the site session first and returns nothing when signed out,
   so a signed-out visit no longer requests `/api/v1/site/todo` and the
   browser console shows no 401. If the session can't be read, it asks as
   before.
2. `src/lib/space.ts`: `SPACE_FILE_LIMIT` is 1 MB (was 64 KB; Dave,
   2026-11-23), with `spaceLimitText` for messages. `src/App.svelte`: the
   save refusal and the status line's size warning name it instead of a
   fixed "64 KB". The server still enforces its own `maxFileBytes`
   (spaces.json), so raise that too (Company guide 0.96.72).
3. `docs/change-notes/changenotes_0.47.1.md`, published to the Collumii docs
   space at `tools/slate-viewer/change-logs/changenotes_0.47.1.md` after the
   release (Claude publishes and reads it back).

No server change. `npm run check` and the builds run in release-laptop.ps1.
