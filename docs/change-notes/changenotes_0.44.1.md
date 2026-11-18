# Slate Viewer 0.44.1

- **New File keeps the name you type.** `jobs.csv`, `notes.txt`, `.gitignore` or any other name with its own extension is created as typed (empty, unless it's Markdown); a name without one, such as `Plan` or `Plan v1.2`, still gets `.md`. CSV files are listed in Files like notes, ready for a dashboard to read.
- **Rename can change a file's extension**: type the new one, such as `jobs.csv` for `jobs.csv.md`. Without one, the file keeps its own.
- **Opens on** takes a name without `.md`: `dashboard` means `dashboard.md`.
- **Forms name their folder like a path** (Metatrash 0.99.1): `submitTo: done/` files copies in a folder beside the form, `../done/` one folder up, and `/owner/space/folder/` (with the leading `/`) in a space. A form written `owner/space/folder/` without the `/` needs it added. The banner says "Your answers are filed in this space" or names the space.
- **Files that aren't Markdown show as plain text.** A .txt, .csv, C file or any other text file shows exactly as written, in the editor's font, in Preview and Edit alike, instead of being read as Markdown. Markdown files are unchanged.
- **Code shows what you typed.** `!=`, `->` and `>=` no longer turn into `≠` or arrows in the editor and in code blocks (that was the font joining them).
- Includes Slate 0.24.1 (plain text; its message for a form without `submitTo` gives both forms).
- With Metatrash 0.99.1 the website also opens a space on its dashboard or its **Opens on** file.
