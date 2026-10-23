# Slate Viewer 0.14.1

## Fixed

- **Notes in comments are hidden when reading.** Text written as an HTML comment (`<!-- … -->`), such as a template's instructions, no longer shows in Preview or in Show Changes. Edit and Source still show it, so whoever fills in or edits the file can read it and delete it.
- **Form blanks show.** A run of underscores like `______` in a form now shows as written. Before, `____` disappeared.
- Uses Slate 0.17.1.
