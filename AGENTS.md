# Working agreement

- Every project release requires a new version and matching `vX.Y.Z` Git tag for GitHub Actions. Keep package.json and package-lock.json versions aligned; Tauri reads its application version from package.json. Include tag/push steps in release documentation. Never replace an existing tag.
- Codex writes code and release instructions; David builds, tests, commits, pushes release tags and deploys unless he explicitly asks otherwise. Do not run tests or release/deployment commands on his behalf.
- Preserve existing local and staged work.
