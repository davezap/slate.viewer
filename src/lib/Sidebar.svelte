<script lang="ts">
  import { tick } from 'svelte';
  import { basename } from './paths';

  export interface SearchMatch { path: string; line: number; text: string }

  interface Props {
    root: string;
    files: string[];
    truncated: boolean;
    /** The open document, relative to root, or null when it is outside the folder. */
    current: string | null;
    tab: 'files' | 'search';
    query: string;
    onOpen: (relative: string, options: { newWindow: boolean; find?: string }) => void;
    onCreate: (name: string) => Promise<boolean>;
    onSearch: (query: string) => Promise<{ matches: SearchMatch[]; truncated: boolean }>;
    onClose: () => void;
  }

  let { root, files, truncated, current, tab = $bindable(), query = $bindable(), onOpen, onCreate, onSearch, onClose }: Props = $props();

  // ---- Tree ------------------------------------------------------------------

  interface Node { name: string; path: string; folder: boolean; children: Node[] }

  function buildTree(list: string[]): Node[] {
    const top: Node = { name: '', path: '', folder: true, children: [] };
    for (const file of list) {
      const parts = file.split('/');
      let node = top;
      parts.forEach((part, i) => {
        const path = parts.slice(0, i + 1).join('/');
        const isFolder = i < parts.length - 1;
        let child = node.children.find(c => c.name === part && c.folder === isFolder);
        if (!child) {
          child = { name: part, path, folder: isFolder, children: [] };
          node.children.push(child);
        }
        node = child;
      });
    }
    const sort = (nodes: Node[]) => {
      nodes.sort((a, b) => Number(b.folder) - Number(a.folder) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));
      nodes.forEach(n => sort(n.children));
    };
    sort(top.children);
    return top.children;
  }

  const tree = $derived(buildTree(files));
  let expanded = $state(new Set<string>());

  // Reveal the open document by expanding its folders.
  $effect(() => {
    if (!current) return;
    const parts = current.split('/');
    const next = new Set(expanded);
    let changed = false;
    for (let i = 1; i < parts.length; i++) {
      const folder = parts.slice(0, i).join('/');
      if (!next.has(folder)) { next.add(folder); changed = true; }
    }
    if (changed) expanded = next;
  });

  function toggle(path: string) {
    const next = new Set(expanded);
    if (next.has(path)) next.delete(path); else next.add(path);
    expanded = next;
  }

  const displayName = (name: string) => name.replace(/\.(md|markdown|mdown|mkd)$/i, '');

  // ---- New note ------------------------------------------------------------------

  let creating = $state(false);
  let newName = $state('');
  let newInput = $state<HTMLInputElement>();

  async function startCreate() {
    tab = 'files';
    creating = true;
    newName = '';
    await tick();
    newInput?.focus();
  }

  async function finishCreate(event: KeyboardEvent) {
    if (event.key === 'Escape') { creating = false; return; }
    if (event.key !== 'Enter' || !newName.trim()) return;
    if (await onCreate(newName.trim())) creating = false;
  }

  // ---- Search ------------------------------------------------------------------

  let results = $state<SearchMatch[]>([]);
  let resultsTruncated = $state(false);
  let searching = $state(false);
  let searchedFor = $state('');
  let searchInput = $state<HTMLInputElement>();
  let searchTimer: ReturnType<typeof setTimeout> | undefined;

  export async function focusSearch() {
    tab = 'search';
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
    if (!q) { results = []; searchedFor = ''; return; }
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

  const isNewWindow = (event: MouseEvent) => event.ctrlKey || event.metaKey || event.shiftKey || event.button === 1;
</script>

<aside class="sidebar">
  <header>
    <span class="folder" title={root}>{basename(root) || root}</span>
    <button class="icon" title="New note" aria-label="New note" onclick={startCreate}>+</button>
    <button class="icon" title="Close folder" aria-label="Close folder" onclick={onClose}>×</button>
  </header>

  <div class="tabs" role="tablist">
    <button role="tab" aria-selected={tab === 'files'} class:active={tab === 'files'} onclick={() => (tab = 'files')}>Files</button>
    <button role="tab" aria-selected={tab === 'search'} class:active={tab === 'search'} onclick={focusSearch}>Search</button>
  </div>

  {#if tab === 'files'}
    <div class="scroll">
      {#if creating}
        <input
          class="field"
          bind:this={newInput}
          bind:value={newName}
          placeholder="New note name, then Enter"
          onkeydown={finishCreate}
          onblur={() => (creating = false)}
        />
      {/if}
      {#if files.length === 0}
        <p class="empty">No Markdown files in this folder yet.</p>
      {/if}
      <ul class="tree">
        {#snippet branch(nodes: Node[], depth: number)}
          {#each nodes as node (node.path + (node.folder ? '/' : ''))}
            <li>
              {#if node.folder}
                <button class="row" style:padding-left="{8 + depth * 14}px" onclick={() => toggle(node.path)}>
                  <span class="twisty" class:open={expanded.has(node.path)}>›</span>{node.name}
                </button>
                {#if expanded.has(node.path)}
                  <ul>{@render branch(node.children, depth + 1)}</ul>
                {/if}
              {:else}
                <button
                  class="row file"
                  class:current={node.path === current}
                  style:padding-left="{22 + depth * 14}px"
                  title={node.path}
                  onclick={event => onOpen(node.path, { newWindow: isNewWindow(event) })}
                  onauxclick={event => { if (event.button === 1) onOpen(node.path, { newWindow: true }); }}
                >{displayName(node.name)}</button>
              {/if}
            </li>
          {/each}
        {/snippet}
        {@render branch(tree, 0)}
      </ul>
      {#if truncated}
        <p class="empty">Showing the first {files.length} files.</p>
      {/if}
    </div>
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
        <button class="row result-file" title={group.path} onclick={event => onOpen(group.path, { newWindow: isNewWindow(event), find: searchedFor })}>
          {displayName(basename(group.path))}<span class="where">{group.path}</span>
        </button>
        {#each group.matches.filter(m => m.line > 0) as match (match.line)}
          {@const parts = highlight(match.text, searchedFor)}
          <button class="row result-line" onclick={event => onOpen(group.path, { newWindow: isNewWindow(event), find: searchedFor })}>
            <span class="line">{match.line}</span>{parts.before}<mark>{parts.hit}</mark>{parts.after}
          </button>
        {/each}
      {/each}
      {#if resultsTruncated}
        <p class="empty">Showing the first {results.length} matches.</p>
      {/if}
    </div>
  {/if}
</aside>

<style>
  .sidebar {
    display: flex; flex-direction: column; height: 100%; min-width: 0;
    background: var(--side-bg); color: var(--side-fg);
    font: 13px/1.35 Inter, "Segoe UI", system-ui, sans-serif;
  }
  header { display: flex; align-items: center; gap: 2px; padding: 10px 8px 6px 14px; }
  .folder { flex: 1; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  button { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; }
  .icon { width: 24px; height: 24px; border-radius: 4px; font-size: 16px; line-height: 1; color: var(--side-muted); }
  .icon:hover { background: var(--side-hover); color: var(--side-fg); }
  .tabs { display: flex; gap: 4px; padding: 0 10px 6px; border-bottom: 1px solid var(--side-border); }
  .tabs button { padding: 4px 8px; border-radius: 4px; color: var(--side-muted); }
  .tabs button.active { color: var(--side-accent); background: var(--side-accent-soft); font-weight: 600; }
  .scroll { flex: 1; overflow: auto; padding: 6px 0 12px; }
  .search { padding: 8px 10px 0; }
  .field {
    box-sizing: border-box; width: calc(100% - 20px); margin: 0 10px 6px; padding: 5px 8px;
    font: inherit; color: var(--side-fg); background: var(--side-input);
    border: 1px solid var(--side-border); border-radius: 5px; outline: none;
  }
  .search .field { width: 100%; margin: 0; }
  .field:focus { border-color: var(--side-accent); }
  ul { list-style: none; margin: 0; padding: 0; }
  .row {
    display: block; width: 100%; text-align: left; padding: 3px 10px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .row:hover { background: var(--side-hover); }
  .row.current { background: var(--side-accent-soft); color: var(--side-accent); font-weight: 600; }
  .twisty { display: inline-block; width: 14px; color: var(--side-muted); transition: transform .1s; }
  .twisty.open { transform: rotate(90deg); }
  .result-file { margin-top: 6px; font-weight: 600; }
  .where { display: block; font-weight: 400; font-size: 11px; color: var(--side-muted); overflow: hidden; text-overflow: ellipsis; }
  .result-line { padding-left: 18px; color: var(--side-muted); font-size: 12px; }
  .line { display: inline-block; min-width: 26px; color: var(--side-muted); opacity: .7; }
  mark { background: var(--side-mark); color: var(--side-fg); border-radius: 2px; }
  .empty { margin: 8px 14px; color: var(--side-muted); }
</style>
