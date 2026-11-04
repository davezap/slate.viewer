# Slate Viewer 0.27.2 — grouped Markdown quotes

David builds/tests and pushes tags. Codex has not built/copied generated assets,
run tests or created tags. Package versions are prepared as 0.27.2; Tauri reads
the application version from package.json. The internal Rust crate stays unchanged.

## Vendor the released Slate component and build

First build, check, commit and push Slate v0.21.1 following its release guide.
Wait for Slate release validation. Confirm the sibling Slate checkout is clean
and at v0.21.1 before copying its built assets.

```powershell
Set-Location 'C:\Users\David\OneDrive\Documents\Web\Slate_Viewer'
git status --short
git -C '..\Slate' show --no-patch --oneline v0.21.1
Copy-Item '..\Slate\slate.js' 'public\slate\slate.js' -Force
Copy-Item '..\Slate\slate.css' 'public\slate\slate.css' -Force
Copy-Item '..\Slate\slate-editor.d.ts' 'public\slate\slate-editor.d.ts' -Force
Copy-Item '..\Slate\mermaid' 'public\slate' -Recurse -Force
npm run check
npm run build
npm run build:web
```

Test Preview with Slate's test/blockquotes.md: one quote around consecutive lines,
paragraph breaks for bare > markers, no empty strips, correct nested content and
checkbox edits. Switching Edit/Source/Preview must retain original Markdown.
The public Viewer does not supply Metatrash's company-only announcement colour.

## Commit, verify, tag and push

```powershell
git add package.json package-lock.json public/slate
git add docs/change-notes/changenotes_0.27.2.md docs/release-0.27.2.md
git diff --cached --stat
git diff --cached
git commit -m 'Slate Viewer 0.27.2: include Slate grouped blockquotes'
git log -1 --oneline
git show HEAD:package.json | Select-String '0.27.2'
git ls-tree -r HEAD -- public/slate/slate.js docs/change-notes/changenotes_0.27.2.md
git status --short
git tag -a v0.27.2 -m 'Slate Viewer 0.27.2'
git push origin HEAD
git push origin v0.27.2
```

Wait for the version-matching tag's CI/release workflow to pass. It builds and
publishes native installers. Do not reuse v0.27.1 or move an existing tag. The
company source pin must be the committed v0.27.2 tag target, not an uncommitted
asset copy. The company release guide covers its separate server deployment.

After the desktop release, publish the change note to the existing docs space's
tools/slate-viewer/change-logs/changenotes_0.27.2.md using its folder instructions.
That public documentation is a separate publication step, not performed by Codex.

Rollback desktop clients with the preceding released installer; a website rollback
uses the preceding company's binary and source pins. Do not revert or rewrite
the Markdown document as a workaround.
