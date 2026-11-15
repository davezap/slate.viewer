<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { basename } from './paths';
  import Section from './Section.svelte';
  import { displayName, isNewWindowClick, type OpenOptions, type SearchMatch } from './types';
  import { searchModePref, setSearchModePref, type SearchMode } from './prefs';

  interface Props {
    root: string | null;
    query: string;
    onOpen: (relative: string, options: OpenOptions) => void;
    onSearch: (query: string, rank: boolean) => Promise<{ matches: SearchMatch[]; truncated: boolean }>;
  }

  let { root, query = $bindable(), onOpen, onSearch }: Props = $props();

  let results = $state<SearchMatch[]>([]);
  let resultsTruncated = $state(false);
  let searching = $state(false);
  let searchedFor = $state('');
  let searchInput = $state<HTMLInputElement>();
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  // Best matches by word, or every line with the exact text; remembered on this machine.
  let mode = $state<SearchMode>(searchModePref());
  let searchedMode = $state<SearchMode>('best');

  function setMode(next: SearchMode) {
    if (next === mode) return;
    mode = next;
    setSearchModePref(next);
    clearTimeout(searchTimer);
    void runSearch();
  }

  export async function focus() {
    await tick();
    searchInput?.focus();
    searchInput?.select();
  }

  /** Puts `text` in the box and searches for it straight away (Find in Folder from the document):
   *  the exact text, since it was picked from a note. */
  export async function searchFor(text: string) {
    query = text;
    mode = 'exact';
    clearTimeout(searchTimer);
    await tick();
    await runSearch();
  }

  function scheduleSearch() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, 250);
  }

  async function runSearch() {
    const q = query.trim();
    if (!q || !root) { results = []; searchedFor = ''; return; }
    const asked = mode;
    searching = true;
    try {
      const found = await onSearch(q, asked === 'best');
      if (q !== query.trim() || asked !== mode) return; // a newer search is on its way
      results = found.matches;
      resultsTruncated = found.truncated;
      searchedFor = q;
      searchedMode = asked;
    } finally {
      searching = false;
    }
  }

  // Search again when the folder changes, or when the section comes back with a query in it.
  $effect(() => {
    void root;
    untrack(() => void runSearch());
  });
  onMount(() => () => clearTimeout(searchTimer));

  // Results grouped by file, in the order they were found.
  const grouped = $derived.by(() => {
    const groups: { path: string; matches: SearchMatch[] }[] = [];
    for (const match of results) {
      const last = groups.at(-1);
      if (last?.path === match.path) last.matches.push(match);
      else groups.push({ path: match.path, matches: [match] });
    }
    return groups;
  });

  /** The line in pieces, `hit` marking the text (exact) or the start of each word matching one
   *  of the query's words (best matches). */
  function highlight(text: string, q: string, best: boolean): { text: string; hit: boolean }[] {
    if (!best) {
      const i = text.toLowerCase().indexOf(q.toLowerCase());
      if (i < 0) return [{ text, hit: false }];
      return [{ text: text.slice(0, i), hit: false }, { text: text.slice(i, i + q.length), hit: true }, { text: text.slice(i + q.length), hit: false }];
    }
    const words = q.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
    const parts: { text: string; hit: boolean }[] = [];
    let last = 0;
    for (const m of text.matchAll(/[\p{L}\p{N}]+/gu)) {
      const low = m[0].toLowerCase();
      const w = words.filter(w => low.startsWith(w)).sort((a, b) => b.length - a.length)[0];
      if (!w) continue;
      const start = m.index!;
      // Mark as many letters as the word has (lower-casing keeps the length for most text).
      const end = start + Math.min(m[0].length, w.length);
      parts.push({ text: text.slice(last, start), hit: false }, { text: text.slice(start, end), hit: true });
      last = end;
    }
    parts.push({ text: text.slice(last), hit: false });
    return parts;
  }

  // The term an opened note highlights: the exact text, or the first word for best matches.
  const findTerm = $derived(searchedMode === 'best' ? (searchedFor.match(/[\p{L}\p{N}]+/u)?.[0] ?? searchedFor) : searchedFor);
</script>

<Section title="Search">
  {#if !root}
    <p class="empty">Open a folder to search its notes.</p>
  {:else}
    <div class="search">
      <input
        class="field"
        bind:this={searchInput}
        bind:value={query}
        placeholder={mode === 'best' ? 'Search notes by words' : 'Search notes for exact text'}
        oninput={scheduleSearch}
        onkeydown={event => { if (event.key === 'Enter') { clearTimeout(searchTimer); void runSearch(); } }}
      />
      <div class="modes" role="radiogroup" aria-label="Search for">
        <button role="radio" aria-checked={mode === 'best'} class:on={mode === 'best'} title="Notes that best match the words, in any order, best first" onclick={() => setMode('best')}>Best matches</button>
        <button role="radio" aria-checked={mode === 'exact'} class:on={mode === 'exact'} title="Every line holding the exact text" onclick={() => setMode('exact')}>Exact text</button>
      </div>
    </div>
    <div class="scroll">
      {#if searching && results.length === 0}
        <p class="empty">Searching…</p>
      {:else if searchedFor && results.length === 0}
        <p class="empty">No matches for “{searchedFor}”.</p>
      {/if}
      {#each grouped as group (group.path)}
        <button class="row result-file" title={group.path} onclick={event => onOpen(group.path, { newWindow: isNewWindowClick(event), find: findTerm, line: group.matches.find(m => m.line > 0)?.line })}>
          {displayName(basename(group.path))}<span class="where">{group.path}</span>
        </button>
        {#each group.matches.filter(m => m.line > 0) as match (match.line)}
          {@const parts = highlight(match.text, searchedFor, searchedMode === 'best')}
          <button class="row result-line" onclick={event => onOpen(group.path, { newWindow: isNewWindowClick(event), find: findTerm, line: match.line })}>
            <span class="line">{match.line}</span>{#each parts as part, i (i)}{#if part.hit}<mark>{part.text}</mark>{:else}{part.text}{/if}{/each}
          </button>
        {/each}
      {/each}
      {#if resultsTruncated}
        <p class="empty">{searchedMode === 'best' ? `Showing the best ${grouped.length} notes.` : `Showing the first ${results.length} matches.`}</p>
      {/if}
    </div>
  {/if}
</Section>

<style>
  .scroll { flex: 1; overflow: auto; padding: 2px 0 12px; }
  .search { flex: none; padding: 8px 10px 4px; }
  button { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; }
  .field {
    box-sizing: border-box; width: 100%; padding: 5px 8px;
    font: inherit; color: var(--side-fg); background: var(--side-input);
    border: 1px solid var(--side-border); border-radius: 5px; outline: none;
  }
  .field:focus { border-color: var(--side-accent); }
  .modes { display: flex; gap: 4px; margin-top: 6px; }
  .modes button {
    flex: 1; padding: 2px 6px; font-size: 11px; color: var(--side-muted);
    border: 1px solid var(--side-border); border-radius: 4px;
  }
  .modes button.on { color: var(--side-fg); border-color: var(--side-accent); background: var(--side-hover); }
  .row {
    display: block; width: 100%; text-align: left; padding: 3px 10px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .row:hover { background: var(--side-hover); }
  .result-file { margin-top: 6px; font-weight: 600; }
  .where { display: block; font-weight: 400; font-size: 11px; color: var(--side-muted); overflow: hidden; text-overflow: ellipsis; }
  .result-line { padding-left: 18px; color: var(--side-muted); font-size: 12px; }
  .line { display: inline-block; min-width: 26px; color: var(--side-muted); opacity: .7; }
  mark { background: var(--side-mark); color: var(--side-fg); border-radius: 2px; }
  .empty { margin: 8px 14px; color: var(--side-muted); }
</style>
