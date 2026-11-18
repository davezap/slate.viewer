# Slate Viewer 0.45.0

- **Code blocks have a copy button.** A faint copy icon sits at the top right of every block of code or text in a page. Click it to copy the block, and it says "Copied". Dashboard cards and diagrams don't have one, and it doesn't print.
- **Code inside code shows properly.** A block opened with four backticks can now show a three-backtick block inside it, the way the dashboards guide does, and inline code such as ```` ```card ```` shows as ```card.
- **A clearer message when a name is taken.** Making a new file or folder with a name that's already in the folder now says so ("A file called test.md already exists…") and keeps the name box open, instead of talking about a change on the server. Error messages no longer start with words like "SaveConflict:".
- **Change Space:** the public space now sits under Help, below the documentation. A heading only shows when something is under it.
- **Account menu:** My Submissions and Settings have icons. Remember position in each document and Forget document positions moved to Settings → General → Settings.
- **Settings → General** (was Profile): Profile holds your username and email, with a Danger zone at the bottom for deleting your account (it was a page of its own). Settings is the new home for options few people change.
- **Space storage limits.** In Settings → Spaces → (your space) → General, you can give a space a storage limit in GB. Without one, a space grows up to what your account allows, shared by all your spaces. Your spaces list shows each space's size against its limit.
