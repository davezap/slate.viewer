# Slate Viewer 0.20.0

## New

- **Virtual files in Files.** PDFs, pictures, Word files and other files a Metatrash space keeps outside Git now show in Files without View > Show Hidden Files, marked **virtual**. A file the space fetches from a web address is marked **linked**, and its tooltip says where from and how often it is fetched again. Click one to open it in its own app.
- **Convert to Markdown.** Right-click a virtual PDF, Word or HTML file and choose Convert to Markdown: the space's Markdown of it is saved beside it as a `.md` file with the same name, which then opens. If that file already exists, you are asked before it is replaced.
- A linked text file opens read-only: changes made here would be put back by Metatrash Sync, which keeps the version from its web address.

## Needs

- mtsync 0.61.0 or later, which syncs the files themselves (older ones synced only their text). With an older mtsync, Files looks as before.
- Metatrash 0.61.0 on the server.
