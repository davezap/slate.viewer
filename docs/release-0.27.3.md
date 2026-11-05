# Slate Viewer 0.27.3 — preserve filenames

Completed by Codex: source edits, platform-specific Rust name checks/regressions,
package.json/package-lock.json version alignment, local change notes and this guide.
Not completed: checks, tests, builds, commits, tags, pushes or installation.
David performs those steps. No dependency, Slate source or Rust crate version
change; Tauri reads the app version from package.json.

Pair with Metatrash Core/mtsync 0.94.2. The company adoption and complete server
upgrade instructions are in the private sibling metatrash.com repository at
docs/release-core-0.94.2.md. This guide covers the Viewer release only.

## David: check, test and build

```powershell
Set-Location 'C:\Users\David\OneDrive\Documents\Web\Slate_Viewer'
git status --short
git diff
npm ci
npm run check
if ($LASTEXITCODE -ne 0) { throw 'Viewer check failed' }
cargo test --manifest-path src-tauri/Cargo.toml files::tests
if ($LASTEXITCODE -ne 0) { throw 'Native file tests failed' }
cargo test --manifest-path src-tauri/Cargo.toml workspace::tests
if ($LASTEXITCODE -ne 0) { throw 'Workspace tests failed' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Viewer build failed' }
npm run build:web
if ($LASTEXITCODE -ne 0) { throw 'Website build failed' }
```

Stop at any failure. Platform regressions run on the platform where invoked;
retain Windows and Linux Actions results. Do not assume a Windows-only test
establishes Linux punctuation handling.

David's acceptance: create and rename Café [Draft] 📄.md and a folder named
Controller Logs; check names remain exact and sync with Core 0.94.2. Check
ordinary dotfiles with Show hidden files enabled, folder descriptions, and
removing a GitHub connection while dotfiles remain. Check both existing
[[My Note]] → my-note.md links and links to new names. On a case-sensitive
server check exact [[Report]] and [[report]] select their respective notes.
On Windows native actions must reject names such as what?.md and CON.txt.
Web creation may store those names; Windows mtsync must report them without
downloading content or blocking compatible files. On Linux the native backend
should allow punctuation supported there. Check new web notes have a .md suffix
and no automatic slug conversion. Use a disposable test space, not production.

## David: stage, review, commit, verify, tag and push

Preserve unrelated changes. Review all staged changes before committing. Include
any intended tracked build outputs after inspecting them. Never replace a tag.

```powershell
git add -- AGENTS.md docs/release-0.27.2.md package.json package-lock.json src/App.svelte src/lib/filenames.ts src/lib/FilesSection.svelte src/lib/Sidebar.svelte src/lib/space.ts src/lib/wiki.ts src/lib/folderSettings.ts src/lib/backend/web.ts src-tauri/src/files.rs src-tauri/src/workspace.rs docs/change-notes/changenotes_0.27.3.md docs/release-0.27.3.md
git diff --cached --check
git diff --cached --stat
git diff --cached
git commit -m 'Viewer 0.27.3: preserve Unicode filenames and case'
if ($LASTEXITCODE -ne 0) { throw 'Inspect commit state before continuing' }
git log -1 --oneline
git show HEAD:package.json | Select-String '0.27.3'
git show HEAD:package-lock.json | Select-Object -First 12
git show HEAD:src/lib/filenames.ts
git show HEAD:src/App.svelte | Select-String 'const fileName = noteName'
git tag -a v0.27.3 -m 'Slate Viewer 0.27.3'
if ($LASTEXITCODE -ne 0) { throw 'Tag failed; never replace an existing tag' }
if ((git rev-parse 'v0.27.3^{commit}') -ne (git rev-parse HEAD)) { throw 'Tag differs from HEAD' }
git push origin main
if ($LASTEXITCODE -ne 0) { throw 'Branch push failed' }
git push origin v0.27.3
if ($LASTEXITCODE -ne 0) { throw 'Tag push failed' }
```

Wait for Viewer Actions to pass and the v0.27.3 release to be available before
publishing its change notes, using its installer or recording the company Viewer
pin. Follow the private guide to adopt the committed Core and
Viewer revisions and rebuild company website assets. No separate frontend
deployment is performed by Codex.

## Publish the app's change notes — required, pending

Once v0.27.3 is available, Codex must copy the exact text of
`docs/change-notes/changenotes_0.27.3.md` to the connected
`dave-zap/metatrash-com` space at
`tools/slate-viewer/change-logs/changenotes_0.27.3.md` using the Metatrash tools.
Read the space and folder AGENTS.md instructions first, use a current state for
the write, and read back the saved file to verify its contents match the release
source. The public URL is
https://metatrash.com/docs/tools/slate-viewer/change-logs/changenotes_0.27.3.md.
The app discovers notes through the folder's generated llms.txt; no manual index
entry is needed. A local note alone does not complete this step. Keep it pending
until the actual release: the app immediately displays the newest listed note,
so publishing ahead of the release would advertise unshipped changes.

## Recovery

Keep the prior Viewer installer. Reinstall it if native acceptance fails; no
document conversion, schema or settings rollback is needed. Keep newly named
files and backups: older Viewer dialogs can reject or slug names, so restoring
the old app does not establish full editing support for them. Do not run older
Windows mtsync against spaces containing Windows-incompatible names; keep the
new client installed or stop sync while recovering. Prefer a forward fix. Any
source rollback needs a new reviewed version/tag; never move v0.27.3.
