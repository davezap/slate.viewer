# Slate Viewer 0.41.0: receive email from folder Properties

Prepared 2026-11-15 by Claude at David's request ("the user cannot be
expected to do this all manually"). Checked in the cloud: `npm run check`
(0 errors), the settings round trip and checks in `folderSettings.ts`, and
the Automation page in Chromium against a mocked site API. Not checked: the
Tauri build.

Tier: public. Receiving email is a Core feature (Core 0.97.0 email service and
the `email` REST resource), so a self-hosted Metatrash needs the same form.

- **Properties > Automation > Receive email**: a checkbox turns the folder's
  email service on or off. Once saved, the folder's address shows with a
  Copy button (website; the desktop app links to the website for now). Get a
  New Address raises the address version, so saving retires the old one.
  Allowed and blocked senders are one per line; Replies chooses `strip` or
  `keep`. Problems (a GitHub folder, the public space, a bad sender rule)
  show like the other pages' checks.
- **Fix**: saving Properties no longer drops services the dialog doesn't
  edit. Before this, saving any folder's Properties removed its email
  service.

Files: `src/lib/folderSettings.ts` (`EmailService`, `senderRules`,
`validSenderRule`, `otherServices`, checks), `src/lib/FolderProperties.svelte`
(Receive email section), `src/lib/backend/types.ts` and
`src/lib/backend/web.ts` (`sync.emailAddress`, GET `.../email?folder=`),
`package.json`, `package-lock.json`, `docs/change-notes/changenotes_0.41.0.md`,
this file.

Version: `package.json` and `package-lock.json` say 0.41.0. It ships in Company 0.96.51 (Core 0.97.0 unchanged).

Later: the desktop app shows the address itself once mtsync can ask for it
(an `mtsync email-address` command and a Tauri command).
