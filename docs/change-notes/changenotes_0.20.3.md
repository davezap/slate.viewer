# Slate Viewer 0.20.3

## Fixed

- **Files shows every folder in a space.** A folder named `build`, `bin`, `dist`, `obj`, `target` or `node_modules` was left out of Files, because outside a space those names usually hold build output. In a folder synced with a Metatrash space only hidden folders (names starting with a dot) are left out now, so a space's `build/` folder and everything in it shows.
