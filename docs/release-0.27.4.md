# Slate Viewer 0.27.4 — bounded website polling

Prepared 2026-11-07. Source, local change notes and release instructions are
prepared; tests, checks, builds, commits, tags, Actions and change-note publication
remain pending. Codex has not executed tests/builds or release commands. Keep the
existing local docs/release-0.27.3.md publication record unchanged and unstaged.

The shared web backend uses one request at a time, schedules its next request
after completion, applies bounded backoff/jitter and Retry-After guidance, and
aborts a request after 15 seconds. Hidden/offline pages pause; visibility/online
and page lifecycle events resume with jitter. Server retry floors survive pause/
resume. Stopping a watch removes its event listeners and timers. Space changes
abort old work; root/generation/state checks prevent stale responses from moving
the new watch backwards, including switching A to B and back to A.

Healthy checks remain ordinary since= HTTP requests every 5–6.25 seconds after
the previous request finishes. Error backoff normally grows to 60 seconds; server
hints have a five-minute bound plus at most five seconds of jitter. No WebSocket,
permanent subscription service, new dependency or document-format migration.
package.json/package-lock.json align at 0.27.4; Tauri reads that version. No Rust
crate version or Cargo lock change is required.

## One combined candidate

This slice is bundled with Core/mtsync 0.95.3 and Company 0.96.10. David can run
the private sibling's scripts/release-laptop.ps1 -Version 0.96.10 once when ready.
Its Viewer stage installs dependencies, runs the polling regressions/type checks
and both frontend builds, stages only the declared Viewer files, shows the staged
diff for review, commits, verifies HEAD, creates/pushes v0.27.4 and waits for CI
and the complete Release workflow. It then releases Core and records the actual
Viewer/Core commit pins before Company builds/commit/tag. No interim test pass is
required between local implementation slices. Never run both release paths blindly.

## Standalone Viewer checks and source release, if needed

David runs these only instead of the helper's Viewer stage, preserving unrelated
work. Go/server checks and production commands belong in the private repository.
Node 22.12+ or Node 24 and the existing native build prerequisites are required.

```powershell
Set-Location 'C:\Users\David\OneDrive\Documents\Web\Slate_Viewer'
git status --short
npm ci
if ($LASTEXITCODE -ne 0) { throw 'Viewer dependency installation failed' }
npm run test:polling
if ($LASTEXITCODE -ne 0) { throw 'Polling regressions failed' }
npm run check
if ($LASTEXITCODE -ne 0) { throw 'Viewer checks failed' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Desktop frontend build failed' }
npm run build:web
if ($LASTEXITCODE -ne 0) { throw 'Website frontend build failed' }
git add -- .github/workflows/ci.yml package.json package-lock.json src/lib/backend/web.ts src/lib/backend/polling.ts tests/polling.test.mjs docs/release-0.27.4.md docs/change-notes/changenotes_0.27.4.md
git diff --cached --check
git diff --cached --stat
git diff --cached
# Stop and review the entire staged diff before committing.
git commit -m 'Viewer 0.27.4: bounded browser polling'
if ($LASTEXITCODE -ne 0) { throw 'Commit failed; inspect retained state' }
git log -1 --oneline
git show HEAD:package.json | Select-String '0.27.4'
git show HEAD:package-lock.json | Select-Object -First 12
git show HEAD:src/lib/backend/polling.ts
git diff --exit-code HEAD -- .github/workflows/ci.yml package.json package-lock.json src/lib/backend/web.ts src/lib/backend/polling.ts tests/polling.test.mjs docs/release-0.27.4.md docs/change-notes/changenotes_0.27.4.md
if ($LASTEXITCODE -ne 0) { throw 'Working release files differ from committed HEAD' }
git tag -a v0.27.4 -m 'Slate Viewer 0.27.4'
if ($LASTEXITCODE -ne 0) { throw 'Tag creation failed; never replace an existing tag' }
if ((git rev-parse 'v0.27.4^{commit}') -ne (git rev-parse HEAD)) { throw 'Tag differs from HEAD' }
git push origin main
if ($LASTEXITCODE -ne 0) { throw 'Branch push failed' }
git push origin refs/tags/v0.27.4
if ($LASTEXITCODE -ne 0) { throw 'Tag push failed' }
```

Wait for CI and the complete v0.27.4 Release workflow/artifacts. An already
created tag must match the accepted commit; never delete/move/recreate it.

## Required change-note publication by Codex

Publication is pending until the matching release is available. Once that is
reported/verified, Codex must read the connected dave-zap/metatrash-com space and
folder instructions, copy the exact committed local text from
docs/change-notes/changenotes_0.27.4.md to
tools/slate-viewer/change-logs/changenotes_0.27.4.md, then read the saved file back
and verify an exact match. Do not publish early: the app immediately displays
the newest listed note. David should report release availability to Codex; he is
not assigned the publication itself. Local notes do not complete this release.

## Combined acceptance and rollback

On the rebuilt website, use a disposable space. Inspect request timing with a
slow response: one poll must finish before the next begins. Hide/show the page,
go offline/online and repeat failures/429/503 with Retry-After guidance. Verify
retries spread, pause while hidden/offline, and honor a pending floor after
resuming. Stop watching and check no poll timers/listeners remain active. Switch
spaces quickly (A/B/A), and change documents during an unfinished check; stale
responses must not emit changes for another space or replace its state.
Verify normal remote edits, rename/delete, refresh, save/conflicts and desktop
opening remain functional. Fake-clock regressions are deterministic and run in
CI; this manual browser acceptance is for David with the combined candidate.

Keep previous installers. Company restores its previous accepted binary/assets
using the private release guide. A standalone app can reinstall its prior signed
release; documents/settings require no conversion or rollback. Source corrections
after tagging require a new version/tag. No deployment is performed by Codex.
