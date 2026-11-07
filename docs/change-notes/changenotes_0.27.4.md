# Slate Viewer 0.27.4

- Website checks for remote changes pause while the page is hidden or offline.
- Slow checks run one at a time. Failed checks retry gradually, and reconnects spread their requests.
- Switching spaces ignores unfinished responses from the previous space.
- Returning to the page resumes checking for changes while respecting a server request to wait.
