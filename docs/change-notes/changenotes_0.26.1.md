# Slate Viewer 0.26.1

## Fixed

- **Change notes in Check for Updates.** The update dialog found no notes and couldn't open them, because the docs on metatrash.com became the site app in Metatrash 0.87.0 and the dialog was reading the old pages. It now reads the notes as Markdown straight from the docs, and shows the newest one as soon as the list arrives instead of waiting for the update check.
- **Settings → Billing → Storage says why** extra storage can't be changed when it can't: a plan that's free of charge, a payment to fix or a paused subscription first, or a server not set up for it yet.
