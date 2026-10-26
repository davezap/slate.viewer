# Slate Viewer 0.18.1

## Fixed

- **Diagrams print properly.** Printing a document with Mermaid diagrams (or Print to PDF) drew them broken: boxes lost their shape and labels went missing. They now print as they look on screen.
- **Tall diagrams fit on one page.** A diagram taller than the page is scaled down to fit, instead of being split over several pages and drawn tiny.
- **Print waits for diagrams.** Printing straight after editing a diagram no longer prints its source text in place of the drawing.

## Needs

- Nothing new. Slate 0.19.2, included.
