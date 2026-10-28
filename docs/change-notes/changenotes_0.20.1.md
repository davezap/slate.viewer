# Slate Viewer 0.20.1

## Fixed

- **Conflict copies of linked files.** When Metatrash Sync puts back a linked file you edited, it keeps your edit as a `.conflict-` copy. Opening that copy offered to compare and merge it, and choosing Compare failed with "Compare needs an editable document". A linked file can't be changed here, so the Viewer now says so and that your edit is kept in the copy. The same goes for files locked for everyone and files in a read-only space.
