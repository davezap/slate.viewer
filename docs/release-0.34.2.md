# Slate Viewer v0.34.2: readable table columns

Prepared 2026-11-08. CSS, package versions and local change notes complete.
Build, acceptance, commit, tag, push, release and note publication pending.
David builds/tests/releases; Codex ran no tests or builds.

Vendor Slate v0.21.2's table wrapping rule in `public/slate/slate.css`.
Whole words now contribute to automatic column sizing, so long descriptions
do not squash short keys into letter fragments. No app logic, dependencies,
configuration or schema changes. Existing JavaScript assets remain compatible.

Use Company `docs/release-0.96.22.md` and run its laptop helper with
`-Version 0.96.22`. It first commits/tags Slate v0.21.2 and waits for Actions,
copies the accepted CSS here, runs `npm ci`, `npm run test:polling`,
`npm run check`, `npm run build` and `npm run build:web`, then stages these
intended files, presents the diff, commits and verifies committed HEAD:

- package.json, package-lock.json, public/slate/slate.css
- docs/release-0.34.2.md, docs/change-notes/changenotes_0.34.2.md

The pre-existing `docs/release-0.27.3.md` edit is preserved outside the release.
Then the helper runs (do not repeat manually):

```powershell
git -C C:\Claude\zt\Slate_Viewer tag -a v0.34.2 -m 'Metatrash v0.34.2'
git -C C:\Claude\zt\Slate_Viewer push origin main
git -C C:\Claude\zt\Slate_Viewer push origin refs/tags/v0.34.2
```

It waits for CI and the matching Release workflow before releasing Company.
Never replace an existing tag. Install the matching desktop release only after
Actions succeeds. Company installation and recovery use the complete server
commands in Company's new release guide.

David's checks: recreate the reported Key / What it does table with `name`,
`on`, `when`, `every`, `do` in backticks and sentence-length descriptions.
At about 740px the keys should stay whole while descriptions wrap. Check
rendered editing and reading, print, narrow windows, all themes, three-column
tables, and long URLs. Check ordinary prose/code wrapping is unchanged.

After the matching v0.34.2 release is available, Codex must read the connected
`dave-zap/metatrash-com` space and folder instructions, copy
`docs/change-notes/changenotes_0.34.2.md` to
`tools/slate-viewer/change-logs/changenotes_0.34.2.md`, and read it back to
verify the full contents. This is pending until release availability and is
part of completing the release; do not publish the unreleased note early.

Rollback: reinstall the previous desktop release; on the website use the
Company checkpoint rollback. No document, data or configuration recovery.
