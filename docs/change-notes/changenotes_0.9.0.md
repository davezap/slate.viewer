# Slate Viewer 0.9.0

## New

- **View > Show Hidden Files.** The Files panel now shows only your notes. `AGENTS.md`, `.metatrash.json`, other dot files and everything that isn't a note (images, PDFs and so on) are hidden until you turn this on. Images still show inside the notes that use them.
- Hidden files show dimmed when they're visible. Opening one that isn't a note opens it in its own app.

## Changed

- Metatrash 0.45.0 puts an `AGENTS.md` (instructions for agents) and a `.metatrash.json` (settings) in every folder of a space. Slate Viewer lets you edit them but not rename, move or delete them.
- A space's `README.md` is now an ordinary note: it can be renamed, moved or deleted like any other. A folder still opens on its `README.md` if it has one, otherwise on its first note.
