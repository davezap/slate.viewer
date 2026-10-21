# Slate Viewer 0.12.0

## New

- **Folder Properties.** Right-click a folder in a Metatrash space and choose **Properties** (or press Alt+Enter on it) to change its settings without editing JSON. Right-click empty space in Files for the top of the space.
  - **General**: whether the folder uses its parent's settings, its AGENTS.md for agents, a short summary and descriptions of what's inside.
  - **Security**: read-only files (a name, a pattern like `*.pdf`, or a subfolder), showing which files each one locks, and which settings are locked for agents or for everyone.
  - **Connections**: the GitHub repository the folder mirrors, its branch and when changes are pushed.
  - **Automation**: where triggers and actions will go once Metatrash has them.
  - **Settings File**: exactly what Save writes to `.metatrash.json`.
- Properties checks your changes against Metatrash's rules before saving, and explains anything that needs fixing (for example a setting another folder has locked for everyone).
