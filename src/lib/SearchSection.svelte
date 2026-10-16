<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { basename } from './paths';
  import Section from './Section.svelte';
  import { displayName, isNewWindowClick, type OpenOptions, type SearchMatch } from './types';

  interface Props {
    root: string | null;
    query: string;
    onOpen: (relative: string, options: OpenOptions) => void;
    onSearch: (query: string) => Promise<{ matches: SearchMatch[]; truncated: boolean }>;
  }

  let { root, query = $bindable(), onOpen, onSearch }: Props = $props();

  let results = $state<SearchMatch[]>([]);
  let resultsTruncated = $state(false);
  let searching = $state(false);
  let searchedFor = $state('');
  let searchInput = $state<HTMLInputElement>();
  let searchTimer: ReturnType<typeof setTimeout> | undefined;

  export async function focus() {
    await tick();
    searchInput?.focus();
    searchInput?.select();
  }

  function scheduleSearch() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, 250);
  }

  async function runSearch() {
    const q = query.trim();
    if (!q || !root) { results = []; searchedFor = ''; return; }
    searching = true;
    try {
      const found = await onSearch(q);
      if (q !== query.trim()) return; // a newer search is on its way
      results = found.matches;
      resultsTruncated = found.truncated;
      searchedFor = q;
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

  function highlight(text: string, q: string): { before: string; hit: string; after: string } {
    const i = text.toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) return { before: text, hit: '', after: '' };
    return { before: text.slice(0, i), hit: text.slice(i, i + q.length), after: text.slice(i + q.length) };
  }
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
        placeholder="Search notes"
        oninput={scheduleSearch}
        onkeydown={event => { if (event.key === 'Enter') { clearTimeout(searchTimer); void runSearch(); } }}
      />
    </div>
    <div class="scroll">
      {#if searching && results.length === 0}
        <p class="empty">Searching…</p>
      {:else if searchedFor && results.length === 0}
        <p class="empty">No matches for “{searchedFor}”.</p>
      {/if}
      {#each grouped as group (group.path)}
        <button class="row result-file" title={group.path} onclick={event => onOpen(group.path, { newWindow: isNewWindowClick(event), find: searchedFor, line: group.matches.find(m => m.line > 0)?.line })}>
          {displayName(basename(group.path))}<span class="where">{group.path}</span>
        </button>
        {#each group.matches.filter(m => m.line > 0) as match (match.line)}
          {@const parts = highlight(match.text, searchedFor)}
          <button class="row result-line" onclick={event => onOpen(group.path, { newWindow: isNewWindowClick(event), find: searchedFor, line: match.line })}>
            <span class="line">{match.line}</span>{parts.before}<mark>{parts.hit}</mark>{parts.after}
          </button>
        {/each}
      {/each}
      {#if resultsTruncated}
        <p class="empty">Showing the first {results.length} matches.</p>
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
