# Working agreement

- Every project release requires a new version and matching `vX.Y.Z` Git tag for GitHub Actions. Keep package.json and package-lock.json versions aligned; Tauri reads its application version from package.json. Include tag/push steps in release documentation. Never replace an existing tag.
- Codex writes code and release instructions; David builds, tests, commits, pushes release tags and deploys unless he explicitly asks otherwise. Do not run tests or release/deployment commands on his behalf.
- Preserve existing local and staged work.
- Every Slate Viewer release must publish its user-facing change notes to the connected `dave-zap/metatrash-com` space at `tools/slate-viewer/change-logs/changenotes_<version>.md`, copied from `docs/change-notes/changenotes_<version>.md`. Local notes alone do not complete the release. Read the space/folder instructions, publish when the matching release is available (the app immediately displays the newest listed note), and read back the saved file to verify its contents. Include this publication and verification step in every release guide; do not leave it implicit or assign it to David by default.
