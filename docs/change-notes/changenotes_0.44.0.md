# Slate Viewer 0.44.0

- **Dashboards.** A Markdown file can hold cards: a count, a list, a table you can sort, a pie, bar or line chart, a piece of text, a notice to acknowledge or a short form to send. Each card is a ```` ```card ```` block naming a folder of notes or a .csv file, and the rest of the page is ordinary Markdown. The numbers come from the space, with only what you can see, and they refresh while the page is open. A card can show only when it matters (`show-if: @count>0`, after 4 pm, on Mondays, until you have done it). See the Dashboards guide. It needs Metatrash 0.99.0; on the desktop, mtsync 0.99.0.
- **A space opens on its dashboard.** A `dashboard.md` at the top of a space is its home page, before README.md. Folder Properties → General → **Opens on** picks any other file.
- **Forms that need no review.** A form whose copies are filed as done (`review: none`) shows them as **Done** in My Submissions, with no Approve or Decline.
- Includes Slate 0.24.0, which draws the cards (its charts load only on pages that have one).
