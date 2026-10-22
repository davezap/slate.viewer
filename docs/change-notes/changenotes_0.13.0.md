# Slate Viewer 0.13.0

## New

- **Published versions.** A folder in a Metatrash space can publish its files as numbered versions, like an official edition of your policies. Right-click the folder and choose **Publish Version N…**, or use the new **Publishing** page in its Properties. The files as they are when you publish become the official text; later edits are a draft until the next version.
- **Everyone reads the published text.** Opening a file in a publishing folder shows its published text, read only, with a bar naming the version and who published it. If the file has changed since, **Show Draft** shows the latest text (and lets you edit it), and **Show Published Version** goes back.
- **History marks published versions.** Each text that was published shows a **Published vN** badge, so an official version stands out from a typo fix.
- **Read confirmations.** Turn on **Ask everyone to confirm they've read the published files** in Publishing. Each published file you haven't confirmed shows a red dot in Files (and on the folders holding it). Read it, then choose **I Have Read This**. A new version asks again only for the files whose text changed.
- **A count on the taskbar.** Slate Viewer's taskbar button shows a red number for the published files you still have to read, and the status chip in the title bar says how many are left.
- **Who has read what.** Properties > Publishing lists everyone in the space and which files each still has to read (needs read-write access).

## Needs

- Metatrash 0.48.0 on the server and mtsync 0.48.0 on this computer. With an older mtsync, the rest of Slate Viewer works as before and a publishing folder says to update it.
