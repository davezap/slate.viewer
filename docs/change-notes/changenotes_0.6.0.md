# Slate Viewer 0.6.0

## New

- **New File** (Ctrl+Alt+N) and **New File in Root** in the File menu, in the Files panel header, and on a right-click in the file tree. In a folder, type the name in place; without one, a Save dialog asks where.
- **What's new when you update.** Help > Check for Updates shows these change notes, with the notes of earlier versions down the side. Update installs quietly with just a progress bar and restarts Slate Viewer.
- **When something goes wrong:** Help > Open Log Folder shows Slate Viewer's fault log, and Help > Developer Tools opens the browser developer tools.

## Fixed

- Open Folder could stop responding after a slow or failed folder open. It now always works, and very large folders are listed without freezing the window.
- Double-clicking a Markdown file in Explorer while Slate Viewer was open could leave its window hidden behind the taskbar. It now comes to the front.

## Installer

- Updating over an existing version keeps your settings and makes **Uninstall** the second choice, not the default.
