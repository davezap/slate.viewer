<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { basename } from './paths';
  import { conflictOriginal, type FolderDescription } from './space';
  import Section from './Section.svelte';
  import { displayName, isNewWindowClick, type OpenOptions } from './types';

  interface Props {
    root: string | null;
    files: string[];
    truncated: boolean;
    /** The open document, relative to root, or null when it is outside the folder. */
    current: string | null;
    recentFolders: string[];
    onOpen: (relative: string, options: OpenOptions) => void;
    onCreate: (name: string) => Promise<boolean>;
    onCloseFolder: () => void;
    onChooseFolder: () => void;
    onOpenFolder: (folder: string) => void;
    /** `.metatrash.json` descriptions when the folder is a Metatrash space. */
    descriptions?: FolderDescription[];
    /** A folder (relative, no trailing slash) to expand and scroll to. */
    reveal?: string | null;
    onOpenSpace?: () => void;
  }

  let {
    root, files, truncated, current, recentFolders, onOpen, onCreate, onCloseFolder, onChooseFolder, onOpenFolder,
    descriptions = [], reveal = null, onOpenSpace,
  }: Props = $props();

  // ---- Space descriptions ------------------------------------------------------

  const described = $derived(new Map(descriptions.map(d => [d.folder, d])));
  const rootPurpose = $derived(described.get('')?.purpose ?? null);

  /** What the parent folder's .metatrash.json (or the folder's own) says about a node. */
  function describe(path: string, folder: boolean): string | null {
    const slash = path.lastIndexOf('/');
    const parent = slash < 0 ? '' : path.slice(0, slash + 1);
    const name = path.slice(slash + 1) + (folder ? '/' : '');
    const fromParent = described.get(parent)?.children[name] ?? (folder ? described.get(parent)?.children[name.slice(0, -1)] : undefined);
    return fromParent ?? (folder ? described.get(path + '/')?.purpose ?? null : null);
  }

  const isGithub = (path: string) => described.get(path + '/')?.github === true;

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

  // Open Space… with a folder address: expand down to it and bring it into view.
  $effect(() => {
    if (!reveal) return;
    const target = reveal;
    const parts = target.split('/');
    untrack(() => {
      const next = new Set(expanded);
      for (let i = 1; i <= parts.length; i++) next.add(parts.slice(0, i).join('/'));
      expanded = next;
    });
    void tick().then(() => {
      document.querySelector(`[data-folder="${CSS.escape(target)}"]`)?.scrollIntoView({ block: 'start', behavior: 'instant' });
    });
  });

  function toggle(path: string) {
    const next = new Set(expanded);
    if (next.has(path)) next.delete(path); else next.add(path);
    expanded = next;
  }

  function fileTitle(node: Node): string {
    const original = conflictOriginal(node.name);
    if (original) {
      return `Conflict copy of ${original}: edits that clashed with a change from somewhere else, kept by Metatrash Sync. `
        + `Compare it with ${original}, copy across what you need, then delete this file.`;
    }
    const about = describe(node.path, false);
    return about ? `${node.path}\n${about}` : node.path;
  }

  // ---- New note ------------------------------------------------------------------

  let creating = $state(false);
  let newName = $state('');
  let newInput = $state<HTMLInputElement>();

  async function startCreate() {
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
</script>

<Section title="Files" detail={root ? basename(root) || root : undefined} tooltip={root ? (rootPurpose ? `${root}\n${rootPurpose}` : root) : undefined}>
  {#snippet actions()}
    {#if root}
      <button title="New note" aria-label="New note" onclick={startCreate}>+</button>
      <button title="Close folder" aria-label="Close folder" onclick={onCloseFolder}>×</button>
    {/if}
  {/snippet}

  <div class="scroll">
    {#if !root}
      <p class="empty">No folder is open.</p>
      <button class="open-folder" onclick={onChooseFolder}>Open Folder…</button>
      {#if onOpenSpace}<button class="open-folder secondary" onclick={onOpenSpace}>Open Space…</button>{/if}
      {#if recentFolders.length}
        <p class="recent-title">Recent</p>
        {#each recentFolders as dir (dir)}
          <button class="row" title={dir} onclick={() => onOpenFolder(dir)}>
            {basename(dir) || dir}<span class="where">{dir}</span>
          </button>
        {/each}
      {/if}
    {:else}
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
                <button
                  class="row"
                  style:padding-left="{8 + depth * 14}px"
                  data-folder={node.path}
                  title={describe(node.path, true) ?? undefined}
                  onclick={() => toggle(node.path)}
                >
                  <span class="twisty" class:open={expanded.has(node.path)}>›</span>{node.name}
                  {#if isGithub(node.path)}<span class="badge" title="Mirrors a GitHub repository">GitHub</span>{/if}
                </button>
                {#if expanded.has(node.path)}
                  <ul>{@render branch(node.children, depth + 1)}</ul>
                {/if}
              {:else}
                <button
                  class="row file"
                  class:current={node.path === current}
                  style:padding-left="{22 + depth * 14}px"
                  class:conflict={conflictOriginal(node.name) !== null}
                  title={fileTitle(node)}
                  onclick={event => onOpen(node.path, { newWindow: isNewWindowClick(event) })}
                  onauxclick={event => { if (event.button === 1) onOpen(node.path, { newWindow: true }); }}
                >{#if conflictOriginal(node.name) !== null}<span class="warn">⚠</span>{/if}{displayName(node.name)}</button>
              {/if}
            </li>
          {/each}
        {/snippet}
        {@render branch(tree, 0)}
      </ul>
      {#if truncated}
        <p class="empty">Showing the first {files.length} files.</p>
      {/if}
    {/if}
  </div>
</Section>

<style>
  .scroll { flex: 1; overflow: auto; padding: 4px 0 12px; }
  button { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; }
  .field {
    box-sizing: border-box; width: calc(100% - 20px); margin: 2px 10px 6px; padding: 5px 8px;
    font: inherit; color: var(--side-fg); background: var(--side-input);
    border: 1px solid var(--side-border); border-radius: 5px; outline: none;
  }
  .field:focus { border-color: var(--side-accent); }
  ul { list-style: none; margin: 0; padding: 0; }
  .row {
    display: block; width: 100%; text-align: left; padding: 3px 10px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .row:hover { background: var(--side-hover); }
  .row.current { background: var(--side-accent-soft); color: var(--side-accent); font-weight: 600; }
  .badge {
    margin-left: 6px; padding: 0 5px; font-size: 10px; border-radius: 3px;
    color: var(--side-muted); border: 1px solid var(--side-border);
  }
  .row.conflict { color: #b26a00; }
  .warn { margin-right: 4px; }
  .open-folder.secondary, :global([data-theme="dark"]) .open-folder.secondary { color: var(--side-fg); background: var(--side-hover); }
  .twisty { display: inline-block; width: 14px; color: var(--side-muted); transition: transform .1s; }
  .twisty.open { transform: rotate(90deg); }
  .empty { margin: 8px 14px; color: var(--side-muted); }
  .open-folder {
    margin: 2px 14px 8px; padding: 5px 12px; border-radius: 5px;
    color: #fff; background: var(--side-accent);
  }
  :global([data-theme="dark"]) .open-folder { color: #1d1a22; }
  .open-folder:hover { filter: brightness(1.08); }
  .recent-title { margin: 10px 14px 2px; font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--side-muted); }
  .row .where { display: block; font-size: 11px; color: var(--side-muted); overflow: hidden; text-overflow: ellipsis; }
  .row:has(.where) { padding-left: 14px; }
</style>
