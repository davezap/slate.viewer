# Slate Viewer 0.14.0

## New

- **Show Changes.** A new **± Changes** toggle in the toolbar (also View > Show Changes, Ctrl+Shift+D) shows what changed in a space file, read only. In Preview you see the document as it reads, with removed words struck through in red and added words in green; paragraphs and list items that were added or removed outright are marked in full, and a changed table shows just the cells that changed. In Edit and Source you see the same changes in the Markdown. A bar above names the versions, counts the changes, steps through them with ↑ and ↓, and has **Hide Changes**.
- **What it compares with.** On a published text, the toggle shows the changes since the version before. On a draft, the changes since the published version. On any other file, the changes since it was last saved to the space. It works on read-only documents too, so readers can use it on the published text.
- **Policy bar shortcuts.** The bar above a published file has **Changes in vN** (what this version changed) and, if you confirmed reading an older version, **Changes Since You Read It**.
- **Pick versions in History.** Click a version to see what changed since then. Ctrl+click a second version to see what changed between the two, which is handy for comparing two published versions. The picked versions are marked **From** and **To**, and **Clear** goes back to the document.

## Changed

- Clicking a version in History now shows its changes instead of starting a merge. To bring parts of an old version back, click it, then choose **Merge…** under the list. That opens the same Compare as before, with **Keep this** and **Use** buttons.
- Uses Slate 0.17.0.
