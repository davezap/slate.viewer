// The page footer on the website (Metatrash 0.88.0): up to three lines of Markdown (0.95.29;
// one before) from a folder's .metatrash.json `footer`, separated by \n, drawn below the
// document by App.svelte. It is never in the file.
// Only a little Markdown is read, and only into DOM nodes (never HTML), so the site's CSP and
// Slate's no-attribute rule for HTML stay as they are:
//   [text](target)  a link (https, mailto: or a path on the site; anything else stays plain text)
//   **bold**  *italic* or _italic_  `code`  \* (a character as written)
//   :metatrash:     the Metatrash wordmark, as on the sign-in page
//   :name:          a mark the edition's brand adds (0.40.0; editionTypes.ts Brand.footerMarks),
//                   such as a company's own wordmark; an unknown :name: stays text
// Everything else is text.

import { brand } from '$edition';
import { footerLinkTarget } from './folderSettings';

/** A :name: token at the start of the text. */
const MARK = /^:([a-z][a-z0-9-]{0,31}):/;

/** The marks a footer can use, by name, with what each shows (Folder Properties' hint). */
export function footerMarks(): { name: string; label: string }[] {
  return [{ name: 'metatrash', label: 'Metatrash' },
    ...Object.entries(brand.footerMarks ?? {}).filter(([name]) => name !== 'metatrash').map(([name, mark]) => ({ name, label: mark.label }))];
}

/** The node for :name:, or null when nothing has that name. */
function mark(name: string): Node | null {
  if (name === 'metatrash') return wordmark();
  const made = Object.hasOwn(brand.footerMarks ?? {}, name) ? brand.footerMarks![name] : undefined;
  return made ? made.render() : null;
}

/** The Metatrash wordmark: "metatrash" with its accent-coloured dot. */
function wordmark(): HTMLElement {
  const mark = document.createElement('span');
  mark.className = 'metatrash-wordmark';
  mark.setAttribute('aria-label', 'Metatrash');
  mark.append('metatrash');
  const dot = mark.appendChild(document.createElement('span'));
  dot.textContent = '.';
  return mark;
}

/** Where the closing `marker` of a run starting at `from` is, or -1. Empty runs don't count. */
function closing(text: string, marker: string, from: number): number {
  const end = text.indexOf(marker, from + marker.length + 1);
  return end < 0 ? -1 : end;
}

/** The footer's nodes. `links` is false inside a link, which can't hold another. */
function inline(text: string, links: boolean): Node[] {
  const out: Node[] = [];
  let plain = '';
  const flush = () => {
    if (plain) out.push(document.createTextNode(plain));
    plain = '';
  };
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '\\' && i + 1 < text.length && /[\\`*_[\]():]/.test(text[i + 1])) {
      plain += text[i + 1];
      i += 2;
      continue;
    }
    if (c === ':') {
      const found = MARK.exec(text.slice(i));
      const node = found && mark(found[1]);
      if (found && node) {
        flush();
        out.push(node);
        i += found[0].length;
        continue;
      }
    }
    if (c === '`') {
      const end = text.indexOf('`', i + 1);
      if (end > i + 1) {
        flush();
        const code = document.createElement('code');
        code.textContent = text.slice(i + 1, end);
        out.push(code);
        i = end + 1;
        continue;
      }
    }
    if (links && c === '[') {
      const match = /^\[([^\]]+)\]\(([^)\s]*)\)/.exec(text.slice(i));
      if (match && footerLinkTarget(match[2])) {
        flush();
        const link = document.createElement('a');
        link.href = match[2];
        if (/^https:/i.test(match[2])) link.rel = 'noopener';
        link.append(...inline(match[1], false));
        out.push(link);
        i += match[0].length;
        continue;
      }
    }
    if (text.startsWith('**', i)) {
      const end = closing(text, '**', i);
      if (end > 0) {
        flush();
        const strong = document.createElement('strong');
        strong.append(...inline(text.slice(i + 2, end), links));
        out.push(strong);
        i = end + 2;
        continue;
      }
    }
    // _ only at the start of a word, so snake_case stays as written.
    if ((c === '*' || (c === '_' && !/\w/.test(text[i - 1] ?? ''))) && text[i + 1] !== c && text[i + 1] !== ' ') {
      const end = text.indexOf(c, i + 2);
      if (end > 0 && text[end - 1] !== ' ') {
        flush();
        const em = document.createElement('em');
        em.append(...inline(text.slice(i + 1, end), links));
        out.push(em);
        i = end + 1;
        continue;
      }
    }
    plain += c;
    i += 1;
  }
  flush();
  return out;
}

/** The footer element for footer Markdown: each line centred, below a rule (app.css). */
export function renderFooter(markdown: string): HTMLElement {
  const footer = document.createElement('footer');
  footer.className = 'page-footer';
  // Slate's Preview can be editable on the site; the footer is never part of the document.
  footer.contentEditable = 'false';
  for (const text of markdown.split('\n')) {
    if (!text.trim()) continue;
    const line = footer.appendChild(document.createElement('p'));
    line.append(...inline(text, true));
  }
  return footer;
}
