# Slate Viewer 0.34.3: heading links in the address

Prepared 2026-11-09 by Claude. Not yet released. Viewer only: no Core, Slate,
schema or configuration change. `npm run check` (svelte-check) passed with 0
errors; no build was run (David builds).

Dave asked (2026-11-09) for a site address to a heading to work:
`https://metatrash.com/spaces/bartco/r-d/protocols/LiveLinkBench/README.md#Run%20it%20from%20Windows%20(PowerShell)`.
Clicking a `#heading` link inside a document already worked; opening an address
with `#heading` did not. On load the site only read the hash for `#settings`,
then put the document back where the reader last left it (0.34.1).

Changes (`src/App.svelte`):

- `revealPageAnchor` runs after the first document opens on the site, so the
  address's `#heading` or `#L12` wins over the remembered place. App links
  (`#settings`, `#properties`, `#panel`, `#command`) are left alone.
- A heading matches by its GitHub-style slug (`#run-it-from-windows-powershell`)
  or by its text, decoded (`#Run%20it%20from%20Windows%20(PowerShell)`).
- `hashchange` on the site (`onPageHash`) now also goes to the heading, so a
  heading address pasted into the bar of an open page works.
- On the site, going to a heading (a link in the document or a click in the
  outline) puts its slug in the address with `history.replaceState` (no new
  history entry), so the address can be copied to share that heading.
- Desktop behaviour is unchanged.

Files: `src/App.svelte`, `package.json`, `package-lock.json`,
`docs/change-notes/changenotes_0.34.3.md`, this file.

Combined release with Company 0.96.25: David runs this one helper, which performs
Viewer checks/builds, stages all five intended files, shows the staged diff for
review, commits, verifies committed HEAD contents, tags/pushes Viewer and waits
for Actions. It then records the actual accepted Viewer SHA in Company's pins
and manifest before building/reviewing/committing/tagging Company. The
pre-existing `docs/release-0.27.3.md` edit stays out. Codex has not run checks,
builds or release commands for this combined preparation.

```powershell
Set-Location 'C:\Claude\zt\metatrash.com'
.\scripts\release-laptop.ps1 -Version 0.96.25 -CompanyTestsTimeoutMinutes 20
```

Follow Company's `docs/release-0.96.25.md` for the ordered staging/production
build/install, exact tag/commit checks, backups, executable bootstrap, logs and
rollback. Do not run the following standalone commands as well as the helper.
These show its commit/tag/push operations for review; staged diff review and
committed HEAD verification happen before tagging. Never replace an existing tag.

```powershell
git -C 'C:\Claude\zt\Slate_Viewer' add src/App.svelte package.json package-lock.json docs/change-notes/changenotes_0.34.3.md docs/release-0.34.3.md
git -C 'C:\Claude\zt\Slate_Viewer' commit -m 'Viewer 0.34.3: heading links in the site address'
git -C 'C:\Claude\zt\Slate_Viewer' tag -a v0.34.3 -m 'Slate Viewer v0.34.3'
git -C 'C:\Claude\zt\Slate_Viewer' push origin main
git -C 'C:\Claude\zt\Slate_Viewer' push origin v0.34.3

```

The site gets it with Company 0.96.25. Its manifest selects Viewer 0.34.3 and
the helper records the real committed/tagged revision after Viewer Actions.

Checks (site, signed in and signed out):

1. Open the LiveLinkBench README address above: it opens at "Run it from
   Windows (PowerShell)", not at the top or your last place.
2. Same with `#run-it-from-windows-powershell`, and with `#L20`.
3. With the page open, paste the address with a different `#heading` into the
   bar and press Enter: it scrolls there without reloading.
4. Click a heading in the outline: the address ends in its slug. Copy it into
   a new tab: it opens at that heading.
5. `#settings/security/passkeys` still opens Settings; closing it clears the hash.
6. Moving to another file drops the old `#heading` from the address.
7. A long document with diagrams or pictures above the heading: note whether
   the heading stays at the top once they finish drawing.
8. Desktop: `[x](other.md#Some%20Heading)` and `#some-heading` links still work.

After matching Viewer v0.34.3 is available, Codex must read the connected
`dave-zap/metatrash-com` space/folder instructions, publish the exact local
`docs/change-notes/changenotes_0.34.3.md` to
`tools/slate-viewer/change-logs/changenotes_0.34.3.md`, then read it back and
verify the complete contents. Publication is pending Codex; do not publish
early because the app immediately displays the newest listed note.

Rollback: the previous Company release (Viewer 0.34.2).
