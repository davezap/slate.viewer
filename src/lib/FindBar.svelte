<script lang="ts">
  import { tick } from 'svelte';
  import { clearPaint, findOffsets, findRanges, paint } from './find';
  import type { SlateEditorApi } from '../../public/slate/slate-editor';

  interface Props {
    /** The Slate host element. */
    getHost: () => HTMLElement | undefined;
    /** The mounted Slate editor. */
    getEditor: () => SlateEditorApi | null;
    /** True while Slate shows its CodeMirror editor (Edit or Source) rather than Preview. */
    inEditor: () => boolean;
  }

  let { getHost, getEditor, inEditor }: Props = $props();

  let visible = $state(false);
  let query = $state('');
  let count = $state(0);
  let index = $state(-1);
  let input = $state<HTMLInputElement>();

  // Matches from the last search: DOM ranges in Preview, text offsets in Edit and Source.
  let ranges: Range[] = [];
  let offsets: [number, number][] = [];

  const pane = () => getHost()?.querySelector<HTMLElement>('#previewPane') ?? null;
  // Edit and Source offsets are into getMarkdown(), which is the editor's text.
  const sourceText = () => getEditor()?.getMarkdown() ?? '';

  export function isOpen() {
    return visible;
  }

  /**
   * Shows the bar. With `text` it searches for it; with `line` (zero-based Markdown line) it
   * starts at the first match on or after that line, otherwise at the first one in view.
   */
  export async function open(text?: string, line?: number) {
    visible = true;
    if (text !== undefined) query = text;
    else {
      const selected = window.getSelection()?.toString() ?? '';
      if (selected && !selected.includes('\n') && selected.length < 200) query = selected;
    }
    await tick();
    input?.focus();
    input?.select();
    search({ line, scroll: true });
  }

  export function close() {
    if (!visible) return;
    visible = false;
    clearPaint();
    getEditor()?.setSourceHighlights([]);
    // Leave the caret on the match that was showing, so the reader carries on from there.
    const current = ranges[index];
    if (!inEditor() && current) {
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(current);
    } else if (inEditor() && offsets[index]) {
      getEditor()?.selectSourceRange(...offsets[index]);
    }
    ranges = [];
    offsets = [];
  }

  /** Re-runs the search after the document changed, keeping the place without scrolling. */
  export function refresh() {
    if (visible) search({ keep: true });
  }

  function search({ line, scroll = false, keep = false }: { line?: number; scroll?: boolean; keep?: boolean } = {}) {
    const previous = index;
    if (inEditor()) {
      ranges = [];
      clearPaint();
      offsets = findOffsets(sourceText(), query);
      count = offsets.length;
    } else {
      offsets = [];
      getEditor()?.setSourceHighlights([]);
      const root = pane();
      ranges = root ? findRanges(root, query) : [];
      count = ranges.length;
    }
    if (!count) { index = -1; clearPaint(); getEditor()?.setSourceHighlights([]); return; }
    if (keep) index = Math.min(Math.max(previous, 0), count - 1);
    else if (line !== undefined) index = firstFromLine(line);
    else index = firstInView();
    show(scroll);
  }

  function firstFromLine(line: number): number {
    if (inEditor()) {
      const lines = sourceText().split('\n');
      const start = lines.slice(0, line).reduce((sum, l) => sum + l.length + 1, 0);
      const i = offsets.findIndex(([from]) => from >= start);
      return i < 0 ? 0 : i;
    }
    // The rendered block holding that line: the last one starting at or before it.
    let block: Element | null = null;
    for (const candidate of pane()?.querySelectorAll<HTMLElement>(':scope > .live-block[data-line-index]') ?? []) {
      if (Number(candidate.dataset.lineIndex) > line) break;
      block = candidate;
    }
    if (!block) return 0;
    const start = document.createRange();
    start.setStartBefore(block);
    const i = ranges.findIndex(range => range.compareBoundaryPoints(Range.START_TO_START, start) >= 0);
    return i < 0 ? 0 : i;
  }

  function firstInView(): number {
    if (inEditor()) return firstFromLine(getEditor()?.getTopLine() ?? 0);
    const root = pane();
    if (!root) return 0;
    const top = root.getBoundingClientRect().top;
    const i = ranges.findIndex(range => range.getBoundingClientRect().top >= top);
    return i < 0 ? 0 : i;
  }

  function show(scroll: boolean) {
    if (inEditor()) {
      // Every match is highlighted in the editor, the current one more strongly.
      getEditor()?.setSourceHighlights(offsets, index);
      if (scroll) scrollSource();
      return;
    }
    const current = ranges[index] ?? null;
    paint(ranges, current);
    const root = pane();
    if (!scroll || !current || !root) return;
    const rect = current.getBoundingClientRect();
    const view = root.getBoundingClientRect();
    if (rect.top < view.top + 20 || rect.bottom > view.bottom - 20) {
      root.scrollTo({ top: root.scrollTop + rect.top - view.top - root.clientHeight / 3, behavior: 'instant' });
    }
  }

  function scrollSource() {
    const match = offsets[index];
    if (!match) return;
    // Select it and bring it into view, leaving the keyboard in the find box.
    getEditor()?.selectSourceRange(match[0], match[1], { focus: false });
  }

  function step(delta: number) {
    if (!count) return;
    index = (index + delta + count) % count;
    show(true);
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    else if (event.key === 'Enter' || event.key === 'F3') { event.preventDefault(); step(event.shiftKey ? -1 : 1); }
  }

  export function next() { step(1); }
  export function previous() { step(-1); }
</script>

{#if visible}
  <div class="find" role="search">
    <input
      bind:this={input}
      bind:value={query}
      placeholder="Find in document"
      aria-label="Find in document"
      spellcheck="false"
      oninput={() => search({ scroll: true })}
      onkeydown={onKeydown}
    />
    <span class="count" class:none={query && !count}>
      {#if count}{index + 1} of {count}{:else if query}No results{/if}
    </span>
    <button title="Previous match (Shift+Enter)" aria-label="Previous match" disabled={!count} onclick={() => step(-1)}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6" /></svg>
    </button>
    <button title="Next match (Enter)" aria-label="Next match" disabled={!count} onclick={() => step(1)}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
    </button>
    <button title="Close (Escape)" aria-label="Close find" onclick={close}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17" /></svg>
    </button>
  </div>
{/if}

<style>
  .find {
    position: absolute; top: 62px; right: 22px; z-index: 50;
    display: flex; align-items: center; gap: 2px; padding: 5px 5px 5px 6px;
    background: var(--side-input); color: var(--side-fg);
    border: 1px solid var(--side-border); border-radius: 7px; box-shadow: 0 6px 22px rgb(0 0 0 / .16);
    font: 13px/1.2 Inter, "Segoe UI", system-ui, sans-serif;
  }
  input {
    width: 210px; padding: 5px 8px; font: inherit; color: inherit;
    background: var(--side-bg); border: 1px solid var(--side-border); border-radius: 5px; outline: none;
  }
  input:focus { border-color: var(--side-accent); }
  .count { min-width: 64px; padding: 0 6px; text-align: center; font-size: 12px; color: var(--side-muted); white-space: nowrap; }
  .count.none { color: #c0392b; }
  button {
    display: grid; place-items: center; width: 26px; height: 26px; padding: 0;
    color: var(--side-muted); background: none; border: 0; border-radius: 4px; cursor: pointer;
  }
  button:hover:not(:disabled) { background: var(--side-hover); color: var(--side-fg); }
  button:disabled { opacity: .4; cursor: default; }
  svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
</style>
