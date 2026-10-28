# Slate Viewer 0.20.2

## Fixed

- **Files now notices uploads.** A picture, video or other file you put in a synced folder stayed dimmed after Metatrash Sync had uploaded it, until the folder was opened again. An upload changes nothing else in the folder, so Files never looked again. The Viewer now checks the space's virtual files each time Sync finishes a pass, and a file turns into a **virtual** file in Files once it is uploaded.
