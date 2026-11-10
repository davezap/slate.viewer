# Slate Viewer 0.36.0: the count and My Submissions across all spaces, Use These Answers, drafts to continue, matching menus, docs in Change Space

Prepared 2026-11-10 by Claude. `npm run check` (0 errors, 0 warnings) and
`vite build --mode web` passed in a scratch copy; My Submissions and the
account menu were checked in Chromium against a mocked site API. Pending
David: the release helper, review, commit, tag, push and publishing the
change note.

David asked (2026-11-10): the account icon's count implies all spaces, so
it should count all of them, and My Submissions should list forms from all
spaces; My Submissions also needs a way to resume a form left part filled
in, and to start a new copy from an old one's answers when the form is the
same version.

- `src/lib/forms.ts`: `AccountReceipt` (`space`, `current`, `sameForm`),
  `AccountTodo`/`TodoSpace`, `todoWords`, `fetchAccountReceipts`,
  `fetchAccountReceipt`, `fetchAccountTodo`, `reusableAnswers` (leaves out
  photo answers). Drafts now record `file` (keys are lowercased) and an
  optional `note` said when the form opens; `listDrafts(root)` lists them.
- `src/lib/backend/types.ts`, `web.ts`, `desktop.ts`: `accountSubmissions`,
  `accountSubmission`, `todo`. The website calls `GET /api/v1/site/submissions`
  and `GET /api/v1/site/todo` (Metatrash 0.95.22); 401 or 404 (signed out, an
  older server) is null, and the app falls back to the open space. The desktop
  answers null.
- `src/lib/SubmissionsDialog.svelte`: lists all spaces' forms (the space under
  each title) or, as before, the open space's; **Not sent yet** with Continue
  Filling In and Discard Draft; **Use These Answers** when the form is
  unchanged (else why not), **Open the Form**, and Open the Form on a form sent
  back. Not offered for quizzes.
- `src/App.svelte`: `accountTodo` (loaded when signed in on the website, at
  most every 20 seconds after the open space's answer, and every five minutes);
  `todoCount` (all spaces, with the open space's live numbers) for the icon
  and taskbar; `todoSpaces` lines for the menu; `useAnswers` (asks before
  replacing a draft, fills the open form directly when it is already being
  filled in, otherwise saves the draft and opens the form); My Submissions
  is available on the website without a space open.
- `src/lib/TitleBar.svelte`: `todoSpaces` replaces `todoText`: a red line per
  space, linked to spaces other than the open one.

Also asked by David the same day (menus that look alike, and a way back to
the docs now that the home page reopens the last place):

- `src/app.css`: shared `.dropdown` styles (rows, section labels, tick column,
  second lines), the space picker's look.
- `src/lib/TitleBar.svelte`: the account menu uses them ("Waiting for you"
  section with red dots, second lines under My Submissions and Settings); the
  theme control is a menu in the same style instead of the browser's own list.
- `src/lib/SpacePicker.svelte`, `src/lib/siteSpaces.ts`: a **Help** section
  with **Metatrash documentation** when the session answer names `docs`
  (Metatrash 0.95.22); typing docs, help, guides or metatrash keeps it.
- `src/lib/SyncMenu.svelte` (desktop): the same padding, row height and font.

Files: `src/App.svelte`, `src/lib/forms.ts`, `src/lib/SubmissionsDialog.svelte`,
`src/lib/TitleBar.svelte`, `src/lib/SpacePicker.svelte`, `src/lib/siteSpaces.ts`,
`src/lib/SyncMenu.svelte`, `src/app.css`, `src/lib/backend/types.ts`,
`src/lib/backend/web.ts`, `src/lib/backend/desktop.ts`, `README.md`,
`package.json`, `package-lock.json`,
`docs/change-notes/changenotes_0.36.0.md`, this file.

Released with Core 0.95.22 and Company 0.96.30; follow its
`docs/release-0.96.30.md`. Publish `changenotes_0.36.0.md` to
`dave-zap/metatrash-com` `tools/slate-viewer/change-logs/` after the tag.

Rollback: install Slate Viewer 0.35.2.
