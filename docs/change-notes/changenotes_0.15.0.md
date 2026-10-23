# Slate Viewer 0.15.0

## New

- **Fill in forms.** A form is a Markdown file in a space with `form`, `title` and `submitTo` in its front matter, and fields such as `{{text name=full_name required}}` in its text. When you open one, a bar above it offers **Fill In**. The form then shows with boxes, choices, dates and a signature to fill in, and the notes in comments stay hidden.
- **Drafts are kept.** While you fill in a form, your answers are saved on this computer. If you stop, close the file or close the app, the bar offers **Continue Draft** next time, or **Discard Draft** to start again.
- **Send.** **Send** checks your answers first, then sends them to Metatrash. Anything that needs fixing is shown under its field. Once sent, a filled-in copy is filed in the review space the form names, and the bar shows when it was sent.
- **My Submissions.** The bar and the File menu list the forms you sent from the open space, with your answers and the copy that was filed.

## Needs

- Metatrash 0.49.0 on the server and mtsync 0.49.0 on this computer.
- Uses Slate 0.18.0.
