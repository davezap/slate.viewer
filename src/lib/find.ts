// Find in the current document: matches in the rendered document become DOM ranges, which are
// painted with the CSS Custom Highlight API (see the ::highlight rules in app.css).

const BLOCK_BREAK = '\u0000';

/** Every case-insensitive match of `query` in the visible text under `root`, in document order. */
export function findRanges(root: HTMLElement, query: string, limit = 2000): Range[] {
  const needle = query.toLowerCase();
  if (!needle) return [];

  const nodes: Text[] = [];
  const starts: number[] = [];
  let text = '';
  let lastBlock: Element | null = null;
  const visible = new Map<Element, boolean>();
  const isVisible = (element: Element) => {
    let value = visible.get(element);
    if (value === undefined) {
      value = (element as HTMLElement).checkVisibility?.() ?? true;
      visible.set(element, value);
    }
    return value;
  };

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const parent = node.parentElement;
    if (!parent || !node.data || !isVisible(parent)) continue;
    // Keep matches inside one block: "end of one paragraph" + "start of the next" is not a hit.
    const block = parent.closest('.live-block, p, li, h1, h2, h3, h4, h5, h6, td, th, pre, blockquote');
    if (block !== lastBlock) { text += BLOCK_BREAK; lastBlock = block; }
    nodes.push(node);
    starts.push(text.length);
    text += node.data;
  }

  const haystack = text.toLowerCase();
  const ranges: Range[] = [];
  const locate = (offset: number, end: boolean) => {
    // The last node starting at or before offset (for an end offset, strictly before it).
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (end ? starts[mid] < offset : starts[mid] <= offset) lo = mid; else hi = mid - 1;
    }
    return { node: nodes[lo], offset: offset - starts[lo] };
  };

  for (let at = haystack.indexOf(needle); at >= 0 && ranges.length < limit; at = haystack.indexOf(needle, at + needle.length)) {
    const start = locate(at, false);
    const end = locate(at + needle.length, true);
    const range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    ranges.push(range);
  }
  return ranges;
}

/** Every match in plain text (Source mode), as [start, end) offsets. */
export function findOffsets(text: string, query: string, limit = 2000): [number, number][] {
  const needle = query.toLowerCase();
  if (!needle) return [];
  const haystack = text.toLowerCase();
  const found: [number, number][] = [];
  for (let at = haystack.indexOf(needle); at >= 0 && found.length < limit; at = haystack.indexOf(needle, at + needle.length)) {
    found.push([at, at + needle.length]);
  }
  return found;
}

const highlights = (globalThis as { CSS?: { highlights?: Map<string, unknown> } }).CSS?.highlights;
const HighlightClass = (globalThis as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;

export function paint(all: Range[], current: Range | null): void {
  if (!highlights || !HighlightClass) return;
  highlights.set('find-match', new HighlightClass(...all));
  if (current) highlights.set('find-current', new HighlightClass(current));
  else highlights.delete('find-current');
}

export function clearPaint(): void {
  highlights?.delete('find-match');
  highlights?.delete('find-current');
}
