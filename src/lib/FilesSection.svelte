<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { revealItemInDir } from '@tauri-apps/plugin-opener';
  import { basename, joinPath } from './paths';
  import { conflictOriginal, type FolderDescription } from './space';
  import Section from './Section.svelte';
  import KindIcon from './KindIcon.svelte';
  import ContextMenu from './ContextMenu.svelte';
  import type { MenuEntry } from './menu';
  import type { RecentEntry } from './recent';
  import { displayName, isNewWindowClick, type OpenOptions } from './types';

  interface Props {
    root: string | null;
    files: string[];
    truncated: boolean;
    /** The open document, relative to root, or null when it is outside the folder. */
    current: string | null;
    recentFolders: RecentEntry[];
    /** Whether the open folder is a plain folder or a Metatrash space. */
    rootKind?: 'folder' | 'space';
    onOpen: (relative: string, options: OpenOptions) => void;
    /** Creates a note called `name` in `folder` (relative to root, "" for the root itself). */
    onCreate: (name: string, folder: string) => Promise<boolean>;
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
    root, files, truncated, current, recentFolders, rootKind = 'folder', onOpen, onCreate, onCloseFolder, onChooseFolder, onOpenFolder,
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

  // ---- New file ------------------------------------------------------------------

  let creating = $state(false);
  /** Where the new file goes: a folder relative to root, "" for the root. */
  let createIn = $state('');
  let newName = $state('');
  let newInput = $state<HTMLInputElement>();

  const parentOf = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf('/')));
  /** The open document's folder (relative), or the root when it is outside the folder. */
  const currentFolder = $derived(current ? parentOf(current) : '');
  const rootName = $derived(root ? basename(root) || root : '');
  const folderLabel = (folder: string) => (folder ? `${folder}/` : `${rootName} (top)`);

  /** Shows the name box for a new file in `folder` (relative, "" for the root), opening the folder in the tree. */
  export async function startCreate(folder: string = currentFolder) {
    createIn = folder;
    if (folder) {
      const parts = folder.split('/');
      const next = new Set(expanded);
      for (let i = 1; i <= parts.length; i++) next.add(parts.slice(0, i).join('/'));
      expanded = next;
    }
    creating = true;
    newName = '';
    await tick();
    newInput?.focus();
  }

  async function finishCreate(event: KeyboardEvent) {
    if (event.key === 'Escape') { creating = false; return; }
    if (event.key !== 'Enter' || !newName.trim()) return;
    if (await onCreate(newName.trim(), createIn)) creating = false;
  }

  // ---- Right-click menu ------------------------------------------------------------

  let menu = $state<{ x: number; y: number; items: MenuEntry[] } | null>(null);
  const revealLabel = /Mac/i.test(navigator.userAgent) ? 'Reveal in &Finder' : /Windows/i.test(navigator.userAgent) ? 'Show in &Explorer' : 'Show in File &Manager';

  /** New File here (in a folder, or beside a file), New File in Root, and the usual extras. */
  function showMenu(event: MouseEvent, node: Node | null) {
    if (!root) return;
    event.preventDefault();
    event.stopPropagation();
    const items: MenuEntry[] = [];
    const folder = node ? (node.folder ? node.path : parentOf(node.path)) : '';
    if (folder) items.push({ text: `&New File in ${folder.split('/').pop()!.replace(/&/g, '&&')}…`, action: () => void startCreate(folder) });
    items.push({ text: 'New File in &Root…', action: () => void startCreate('') });
    if (node && !node.folder) {
      items.push({ separator: true });
      items.push({ text: '&Open', action: () => onOpen(node.path, { newWindow: false }) });
      items.push({ text: 'Open in New &Window', action: () => onOpen(node.path, { newWindow: true }) });
    }
    if (node) {
      const target = joinPath(root, node.path);
      items.push({ separator: true });
      items.push({ text: revealLabel, action: () => void revealItemInDir(target).catch(console.error) });
      items.push({ text: 'Copy &Path', action: () => void navigator.clipboard.writeText(target).catch(console.error) });
    }
    menu = { x: event.clientX, y: event.clientY, items };
  }
</script>

<Section title="Files" detail={root ? basename(root) || root : undefined} tooltip={root ? (rootPurpose ? `${root}\n${rootPurpose}` : root) : undefined}>
  {#snippet detailIcon()}
    {#if root}<KindIcon kind={rootKind} />{/if}
  {/snippet}
  {#snippet actions()}
    {#if root}
      <button title="New file in {folderLabel(currentFolder)} (Ctrl+Alt+N)" aria-label="New file" onclick={() => void startCreate()}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8.5 1.5h-4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h4M8.5 1.5l4 4V8M8.5 1.5v4h4M12 10v5M9.5 12.5h5" /></svg>
      </button>
      <button title="New file in {folderLabel('')}" aria-label="New file in root" onclick={() => void startCreate('')}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 1.5h11M8.5 4h-4a1 1 0 0 0-1 1v8.5a1 1 0 0 0 1 1h4M8.5 4l3 3v1M12 10v5M9.5 12.5h5" /></svg>
      </button>
      <button title="Close folder" aria-label="Close folder" onclick={onCloseFolder}>×</button>
    {/if}
  {/snippet}

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="scroll" oncontextmenu={event => showMenu(event, null)}>
    {#if !root}
      <p class="empty">No folder is open.</p>
      <button class="open-folder" onclick={onChooseFolder}>Open Folder…</button>
      {#if onOpenSpace}<button class="open-folder secondary" onclick={onOpenSpace}>Open Space…</button>{/if}
      {#if recentFolders.length}
        <p class="recent-title">Recent</p>
        {#each recentFolders as entry (entry.path)}
          <button class="row recent" title="{entry.path}\n{entry.kind === 'space' ? 'Metatrash space' : 'Local folder'}" onclick={() => onOpenFolder(entry.path)}>
            <KindIcon kind={entry.kind} />
            <span class="what">{basename(entry.path) || entry.path}<span class="where">{entry.path}</span></span>
          </button>
        {/each}
      {/if}
    {:else}
      {#if creating}
        <input
          class="field"
          bind:this={newInput}
          bind:value={newName}
          placeholder="New file in {folderLabel(createIn)}: name, Enter"
          title="A name for the new Markdown file (.md is added). Escape cancels."
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
                  oncontextmenu={event => showMenu(event, node)}
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
                  oncontextmenu={event => showMenu(event, node)}
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

{#if menu}
  {#key menu}
    <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => (menu = null)} />
  {/key}
{/if}

<style>
  .scroll { flex: 1; overflow: auto; padding: 4px 0 12px; }
  button { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; }
  .field {
    box-sizing: border-box; width: calc(100% - 20px); margin: 2px 10px 6px; padding: 5px 8px;
    font: inherit; color: var(--side-fg); background: var(--side-input);
    border: 1px solid var(--side-border); border-radius: 5px; outline: none;
  }
  .field:focus { border-color: var(--side-accent); }
  .field::placeholder { color: var(--side-muted); }
  svg { width: 16px; height: 16px; vertical-align: middle; fill: none; stroke: currentColor; stroke-width: 1.2; stroke-linecap: round; stroke-linejoin: round; }
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
  .row.recent { display: flex; align-items: flex-start; gap: 8px; padding-left: 14px; }
  .row.recent :global(.kind) { margin-top: 2px; color: var(--side-muted); }
  .row.recent :global(.kind.space) { color: var(--side-accent); }
  .what { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
</style>
