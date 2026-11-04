# Slate Viewer 0.27.1 — website header additions

The website title bar can now render statically compiled edition components
through `headerAdditions`. Each component receives the current `signedIn` and
`account` values. The public edition exports an empty array, so its header has no
extra action. Desktop headers do not render these additions.

The website toolbar wraps at narrow widths to leave room for edition controls.
This release bumps package.json and both application entries in package-lock.json
to 0.27.1. Tauri reads the application version from package.json; the internal
Rust crate version is unchanged. No dependencies change.

After reviewing, building and committing the intended release files, David runs:

```powershell
git tag -a v0.27.1 -m 'Slate Viewer 0.27.1'
git push origin HEAD
git push origin v0.27.1
```

The tag triggers `.github/workflows/release.yml`, which checks the version,
runs CI, builds desktop installers and publishes the GitHub release. Wait for
success before consuming it in the company build. Never replace an existing tag;
if v0.27.1 already exists remotely, select the next version and update all version
metadata and release steps consistently.

The consuming edition must pin the commit resolved by `v0.27.1^{commit}` before
its server build; instructions are in that edition's release guide.

David runs checks and deployment. No build or tests were run while preparing
this change. Suggested checks: `npm run check`, `npm run build:web`, and desktop
`npm run build`. Confirm the public header is unchanged and the website toolbar
fits a narrow viewport. Roll back by restoring the previous source pin in the
consuming edition and rebuilding its server.
