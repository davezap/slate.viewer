<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { backend, capabilities } from './backend';
  import { basename, joinPath } from './paths';
  import { siteAddress } from './site';
  import { canConvert, conflictOriginal, sizeLabel, type FolderDescription, type VirtualFile } from './space';
  import Section from './Section.svelte';
  import KindIcon from './KindIcon.svelte';
  import ContextMenu from './ContextMenu.svelte';
  import type { MenuEntry } from './menu';
  import type { RecentEntry } from './recent';
  import { displayName, isHiddenFile, isNewWindowClick, type OpenOptions } from './types';
  import { chipLabel, chipTitle, initials, isRunning, summary, tone, type ActivityItem } from './activity';

  interface Props {
    root: string | null;
    files: string[];
    /** Folders with nothing in them yet (relative), shown so a new folder can be filled. */
    emptyFolders?: string[];
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
    /** False in a read-only space: no new, rename, move, duplicate or delete. */
    editable?: boolean;
    /** Files (relative) that can't be renamed, moved or deleted, such as a space's README. */
    locked?: string[];
    /** Creates a folder called `name` in `folder`; resolves to its relative path, or null. */
    onCreateFolder?: (name: string, folder: string) => Promise<string | null>;
    /** Renames a file or folder; resolves to its new relative path, or null when it didn't. */
    onRename?: (path: string, folder: boolean, name: string) => Promise<string | null>;
    /** Moves a file or folder into `toFolder` ("" for the root); resolves like onRename. */
    onMove?: (path: string, folder: boolean, toFolder: string) => Promise<string | null>;
    onDuplicate?: (path: string) => void;
    onDelete?: (path: string, folder: boolean) => void;
    /** Opens a folder's Properties (its .metatrash.json settings); "" is the top of the space. Spaces only. */
    onProperties?: (folder: string) => void;
    /** Files (relative) the person still has to read: published, and not confirmed yet. */
    unread?: string[];
    /**
     * Files (relative) a form asks something of (Metatrash 0.95.20): copies waiting for a review,
     * and forms sent back to this person for more information. Marked with the same dot.
     */
    toReview?: string[];
    toFix?: string[];
    /** Filed copies (relative) a reviewer approved: a green tick after the name (0.35.2). */
    approved?: string[];
    /** Publishes the next version of a folder ("" for the top of the space). Spaces only. */
    onPublish?: (folder: string) => void;
    /** The space's virtual files (content kept outside Git), by relative path. */
    virtualFiles?: Record<string, VirtualFile>;
    /** Saves a virtual PDF, Word or HTML file's Markdown beside it. Spaces only. */
    onConvert?: (path: string) => void;
    /** Stores files dropped from outside or picked with Upload Files in `folder` (relative, "" for the root). */
    onUpload?: (folder: string, files: File[]) => Promise<void>;
    /** What is happening: this page's uploads, conversions, agent jobs and who else is here. */
    activity?: ActivityItem[];
    /** A failed upload's row was clicked. */
    onDismissUpload?: (path: string) => void;
  }

  let {
    root, files, truncated, current, recentFolders, rootKind = 'folder', onOpen, onCreate, onCloseFolder, onChooseFolder, onOpenFolder,
    descriptions = [], reveal = null, onOpenSpace, emptyFolders = [], editable = true, locked = [],
    onCreateFolder, onRename, onMove, onDuplicate, onDelete, onProperties, unread = [], toReview = [], toFix = [], approved = [], onPublish,
    virtualFiles = {}, onConvert, onUpload, activity = [], onDismissUpload,
  }: Props = $props();

  // ---- Activity --------------------------------------------------------------------

  /** Activity by path; a scheduled agent job (no file) goes on its folder's row. */
  const activityByPath = $derived.by(() => {
    const map = new Map<string, ActivityItem[]>();
    for (const item of activity) {
      const key = item.path || (item.kind === 'agent' ? (item.folder ?? '').replace(/\/$/, '') : null);
      if (key === null || key === '') continue;
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    return map;
  });
  const uploadAt = (path: string) => activity.find(i => i.kind === 'upload' && i.path === path);
  const busyIn = (folder: string) => activity.some(i => isRunning(i) && (i.path ?? i.folder ?? '').startsWith(folder + '/'));
  /** People here with no file open, or in the top of the space. */
  const here = $derived(activity.filter(i => i.kind === 'presence'));
  // A clock for "converting 0:42", ticking only while something is under way.
  let now = $state(Date.now());
  const summaryParts = $derived(summary(activity, now));
  const ticking = $derived(activity.some(i => isRunning(i) && !!i.since));
  $effect(() => {
    if (!ticking) return;
    now = Date.now();
    const timer = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(timer);
  });

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
  /** The published version of a folder (relative, no trailing slash; "" for the top), or null. */
  const publishedVersion = (path: string) => described.get(path ? path + '/' : '')?.publishedVersion ?? null;

  // ---- Files still to read (published, not confirmed) --------------------------------

  const unreadSet = $derived(new Set(unread));
  const reviewSet = $derived(new Set(toReview));
  const fixSet = $derived(new Set(toFix));
  const approvedSet = $derived(new Set(approved));
  const todo = $derived([...new Set([...unread, ...toReview, ...toFix])]);
  const todoSet = $derived(new Set(todo));
  const todoIn = (folder: string) => todo.filter(f => f.startsWith(folder + '/'));
  /** What a folder's dot stands for, such as "2 to read and 1 to review in here". */
  function folderTodo(folder: string): string {
    const inside = todoIn(folder);
    const count = (set: Set<string>) => inside.filter(f => set.has(f)).length;
    const parts = [[count(unreadSet), 'to read'], [count(reviewSet), 'to review'], [count(fixSet), 'sent back to you']] as const;
    const said = parts.filter(([n]) => n).map(([n, what]) => `${n} ${what}`);
    return `${said.length > 1 ? `${said.slice(0, -1).join(', ')} and ${said[said.length - 1]}` : said[0]} in here`;
  }
  /** Why a file has a dot. */
  function fileTodo(path: string): string {
    if (unreadSet.has(path)) return "Published, and you haven't confirmed reading it yet.";
    if (reviewSet.has(path)) return 'A filed copy of a form, waiting for someone to approve, decline or ask for more.';
    return 'A reviewer sent this form back to you for more information: open it and choose Fix My Answers.';
  }

  // ---- Tree ------------------------------------------------------------------

  interface Node { name: string; path: string; folder: boolean; children: Node[] }

  function buildTree(list: string[], folders: string[]): Node[] {
    const top: Node = { name: '', path: '', folder: true, children: [] };
    const add = (entry: string, lastIsFolder: boolean) => {
      const parts = entry.split('/');
      let node = top;
      parts.forEach((part, i) => {
        const path = parts.slice(0, i + 1).join('/');
        const isFolder = lastIsFolder || i < parts.length - 1;
        let child = node.children.find(c => c.name === part && c.folder === isFolder);
        if (!child) {
          child = { name: part, path, folder: isFolder, children: [] };
          node.children.push(child);
        }
        node = child;
      });
    };
    for (const file of list) add(file, false);
    for (const folder of folders) add(folder, true);
    const sort = (nodes: Node[]) => {
      nodes.sort((a, b) => Number(b.folder) - Number(a.folder) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));
      nodes.forEach(n => sort(n.children));
    };
    sort(top.children);
    return top.children;
  }

  const tree = $derived(buildTree(files, emptyFolders));
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
    const v = virtualFiles[node.path];
    const lines = [node.path];
    if (about) lines.push(about);
    if (v) {
      lines.push(`Virtual file (${v.type}, ${sizeLabel(v.size)}): the space keeps it outside Git. It opens in its own app.`);
      if (v.source) lines.push(`From ${v.source}${v.refresh ? `, fetched again every ${v.refresh}` : ''}; changes made here are put back.`);
    }
    return lines.join('\n');
  }

  // ---- New file ------------------------------------------------------------------

  let creating = $state(false);
  /** What the name box makes: a note or a folder. */
  let createKind = $state<'file' | 'folder'>('file');
  /** Where the new file goes: a folder relative to root, "" for the root. */
  let createIn = $state('');
  let newName = $state('');
  let newInput = $state<HTMLInputElement>();

  const parentOf = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf('/')));
  /** The open document's folder (relative), or the root when it is outside the folder. */
  const currentFolder = $derived(current ? parentOf(current) : '');
  const rootName = $derived(root ? basename(root) || root : '');
  const folderLabel = (folder: string) => (folder ? `${folder}/` : `${rootName} (top)`);

  /** Whether the tree has a folder at `path` (relative). */
  function inTree(path: string): boolean {
    let nodes = tree;
    for (const part of path.split('/')) {
      const next = nodes.find(n => n.folder && n.name === part);
      if (!next) return false;
      nodes = next.children;
    }
    return true;
  }
  /** Where the name box shows, in the tree like a rename: the new entry's folder, or the top when that folder isn't listed. */
  const createAt = $derived(createIn && inTree(createIn) ? createIn : '');

  /** Expands `folder` (relative) and the folders above it. */
  function expandTo(folder: string) {
    if (!folder) return;
    const parts = folder.split('/');
    const next = new Set(expanded);
    for (let i = 1; i <= parts.length; i++) next.add(parts.slice(0, i).join('/'));
    expanded = next;
  }

  /** Shows the name box for a new file (or folder) in `folder` (relative, "" for the root), opening the folder in the tree. */
  export async function startCreate(folder: string = currentFolder, kind: 'file' | 'folder' = 'file') {
    if (!editable) return;
    renaming = null;
    createIn = folder;
    createKind = kind;
    expandTo(folder);
    creating = true;
    newName = '';
    await tick();
    newInput?.focus();
  }

  async function finishCreate(event: KeyboardEvent) {
    if (event.key === 'Escape') { creating = false; return; }
    if (event.key !== 'Enter' || !newName.trim()) return;
    if (createKind === 'file') {
      // Every folder of a space already has its .metatrash.json: naming a new file that opens the
      // folder's settings instead of making ".metatrash.json.md" (0.33.0).
      if (onProperties && /^\.?metatrash\.json$/i.test(newName.trim())) {
        creating = false;
        onProperties(createIn);
        return;
      }
      if (await onCreate(newName, createIn)) creating = false;
      return;
    }
    const made = await onCreateFolder?.(newName, createIn);
    if (made) {
      creating = false;
      expandTo(made);
    }
  }

  // ---- Rename, delete, duplicate ------------------------------------------------

  const keyOf = (node: Node) => node.path + (node.folder ? '/' : '');
  const isLocked = (node: Node) => !node.folder && locked.includes(node.path);
  const canChange = (node: Node) => editable && !isLocked(node);

  /** The node being renamed (by keyOf), and the name typed so far. */
  let renaming = $state<string | null>(null);
  let renameValue = $state('');

  async function startRename(node: Node) {
    if (!canChange(node) || !onRename) return;
    creating = false;
    renaming = keyOf(node);
    renameValue = node.folder ? node.name : displayName(node.name);
    await tick();
    const input = document.querySelector<HTMLInputElement>('.files-rename');
    input?.focus();
    input?.select();
  }

  /** After a folder moved: keeps it (and the folders in it) open at the new place. */
  function followFolder(from: string, to: string) {
    const next = new Set<string>();
    for (const folder of expanded) next.add(folder === from || folder.startsWith(from + '/') ? to + folder.slice(from.length) : folder);
    expanded = next;
    expandTo(parentOf(to));
  }

  async function finishRename(event: KeyboardEvent, node: Node) {
    event.stopPropagation();
    if (event.key === 'Escape') { renaming = null; return; }
    if (event.key !== 'Enter' || !renameValue.trim()) return;
    const renamed = await onRename?.(node.path, node.folder, renameValue);
    if (renamed == null) return;
    renaming = null;
    if (node.folder) followFolder(node.path, renamed);
  }

  /** F2 renames and Delete deletes the file or folder with the keyboard focus; Alt+Enter shows a folder's Properties. */
  function onRowKeydown(event: KeyboardEvent, node: Node) {
    if (node.folder && onProperties && event.key === 'Enter' && event.altKey) {
      event.preventDefault();
      onProperties(node.path);
      return;
    }
    if (!canChange(node)) return;
    if (event.key === 'F2') {
      event.preventDefault();
      void startRename(node);
    } else if (event.key === 'Delete' && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault();
      onDelete?.(node.path, node.folder);
    }
  }

  // ---- Drag and drop to move -------------------------------------------------------

  /** What is being dragged, and the folder ("" = root) it would land in. */
  let dragging = $state<{ path: string; folder: boolean } | null>(null);
  let dropTarget = $state<string | null>(null);
  let expandTimer: ReturnType<typeof setTimeout> | undefined;
  const DRAG_TYPE = 'application/x-slate-viewer-path';

  function onDragStart(event: DragEvent, node: Node) {
    if (!canChange(node) || !onMove || !event.dataTransfer) { event.preventDefault(); return; }
    dragging = { path: node.path, folder: node.folder };
    // Only our own type, so dropping on the document doesn't paste the path into it.
    event.dataTransfer.setData(DRAG_TYPE, node.path);
    event.dataTransfer.effectAllowed = 'move';
  }

  function onDragEnd() {
    dragging = null;
    dropTarget = null;
    clearTimeout(expandTimer);
  }

  /** Whether the dragged item can move into `folder`: not where it already is, nor into itself. */
  function canDropInto(folder: string): boolean {
    if (!dragging) return false;
    if (parentOf(dragging.path) === folder) return false;
    return !(dragging.folder && (folder === dragging.path || folder.startsWith(dragging.path + '/')));
  }

  /** Files dragged in from outside (Explorer, Finder, the desktop): they are uploaded where they drop. */
  const bringsFiles = (event: DragEvent) => !dragging && editable && !!onUpload && !!event.dataTransfer?.types.includes('Files');

  /** Over a folder row the target is that folder; over a file, the file's folder; elsewhere, the root. */
  function onDragOver(event: DragEvent, folder: string, hovered: Node | null = null) {
    const upload = bringsFiles(event);
    if (!dragging && !upload) return;
    event.stopPropagation();
    if (!upload && !canDropInto(folder)) {
      if (dropTarget !== null) dropTarget = null;
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = upload ? 'copy' : 'move';
    if (dropTarget !== folder) {
      dropTarget = folder;
      clearTimeout(expandTimer);
      // Resting on a closed folder opens it, to drop deeper.
      if (hovered?.folder && !expanded.has(hovered.path)) expandTimer = setTimeout(() => expandTo(hovered.path), 700);
    }
  }

  /** Leaving the list with files from outside: no drop target any more (no dragend comes for them). */
  function onDragLeave(event: DragEvent) {
    const into = event.relatedTarget as globalThis.Node | null;
    if (!dragging && !(into && (event.currentTarget as HTMLElement).contains(into))) {
      dropTarget = null;
      clearTimeout(expandTimer);
    }
  }

  async function onDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    const moving = dragging;
    const folder = dropTarget;
    onDragEnd();
    const dropped = Array.from(event.dataTransfer?.files ?? []);
    if (!moving && folder !== null && dropped.length && onUpload && editable) {
      expandTo(folder);
      await onUpload(folder, dropped);
      return;
    }
    if (!moving || folder === null) return;
    const moved = await onMove?.(moving.path, moving.folder, folder);
    if (moved == null) return;
    expandTo(folder);
    if (moving.folder) followFolder(moving.path, moved);
  }

  // ---- Upload Files… -----------------------------------------------------------------

  let picker = $state<HTMLInputElement>();
  /** The folder the file picker's files go to. */
  let pickFor = '';

  function pickFiles(folder: string) {
    if (!picker) return;
    pickFor = folder;
    picker.value = '';
    picker.click();
  }

  async function picked() {
    const chosen = Array.from(picker?.files ?? []);
    if (!chosen.length || !onUpload) return;
    expandTo(pickFor);
    await onUpload(pickFor, chosen);
  }

  // ---- Right-click menu ------------------------------------------------------------

  let menu = $state<{ x: number; y: number; items: MenuEntry[] } | null>(null);
  const revealLabel = /Mac/i.test(navigator.userAgent) ? 'Reveal in &Finder' : /Windows/i.test(navigator.userAgent) ? 'Show in &Explorer' : 'Show in File &Manager';

  /** New File/Folder here (in a folder, or beside a file) and in the root, rename, delete and the usual extras. */
  function showMenu(event: MouseEvent, node: Node | null) {
    if (!root) return;
    event.preventDefault();
    event.stopPropagation();
    const items: MenuEntry[] = [];
    const separate = () => { if (items.length && !('separator' in items[items.length - 1])) items.push({ separator: true }); };
    const folder = node ? (node.folder ? node.path : parentOf(node.path)) : '';
    if (editable) {
      const here = folder.split('/').pop()!.replace(/&/g, '&&');
      if (folder) {
        items.push({ text: `&New File in ${here}…`, action: () => void startCreate(folder) });
        if (onCreateFolder) items.push({ text: `New &Folder in ${here}…`, action: () => void startCreate(folder, 'folder') });
      }
      items.push({ text: 'New File in &Root…', action: () => void startCreate('') });
      if (onCreateFolder) items.push({ text: 'New Folder in Roo&t…', action: () => void startCreate('', 'folder') });
      if (onUpload) {
        separate();
        if (folder) items.push({ text: `Up&load Files to ${here}…`, action: () => pickFiles(folder) });
        items.push({ text: 'Upload Files to Root…', action: () => pickFiles('') });
      }
    }
    if (node && !node.folder) {
      separate();
      items.push({ text: '&Open', action: () => onOpen(node.path, { newWindow: false }) });
      items.push({ text: capabilities.windows ? 'Open in New &Window' : 'Open in New &Tab', action: () => onOpen(node.path, { newWindow: true }) });
      const v = virtualFiles[node.path];
      if (v && canConvert(v) && onConvert && editable) items.push({ text: 'Convert to &Markdown', action: () => onConvert(node.path) });
    }
    if (node && canChange(node)) {
      separate();
      if (onRename) items.push({ text: 'Ren&ame…', keys: 'F2', action: () => void startRename(node) });
      if (!node.folder && onDuplicate) items.push({ text: 'D&uplicate', action: () => onDuplicate(node.path) });
      if (onDelete) items.push({ text: '&Delete', keys: 'Del', action: () => onDelete(node.path, node.folder) });
    }
    if (node) {
      const target = joinPath(root, node.path);
      separate();
      if (capabilities.fileManager) {
        items.push({ text: revealLabel, action: () => void backend.opener.reveal(target).catch(console.error) });
        items.push({ text: 'Copy &Path', action: () => void navigator.clipboard.writeText(target).catch(console.error) });
      } else {
        // On the website a file's place is its address. A folder's ends in a slash: without one
        // the site looked for a file of that name (Metatrash before 0.95.11 answered not found).
        const address = location.origin + siteAddress(target) + (node.folder ? '/' : '');
        items.push({ text: 'Copy &Address', action: () => void navigator.clipboard.writeText(address).catch(console.error) });
      }
    }
    if (editable && onPublish && (!node || node.folder)) {
      const which = node ? node.path : '';
      const version = publishedVersion(which);
      separate();
      items.push({ text: version ? `&Publish Version ${version + 1}…` : 'P&ublish This Folder…', action: () => onPublish(which) });
    }
    if (onProperties && (!node || node.folder)) {
      separate();
      const which = node ? node.path : '';
      items.push({ text: node ? 'P&roperties…' : `P&roperties of ${rootName.replace(/&/g, '&&')}…`, keys: node ? 'Alt+Enter' : undefined, action: () => onProperties(which) });
    }
    if (!items.length) return;
    menu = { x: event.clientX, y: event.clientY, items };
  }
</script>

<Section title="Files" detail={root ? basename(root) || root : undefined} tooltip={root ? (rootPurpose ? `${root}\n${rootPurpose}` : root) : undefined}>
  {#snippet detailIcon()}
    {#if root}<KindIcon kind={rootKind} />{/if}
  {/snippet}
  {#snippet actions()}
    {#if root}
      {#if editable}
        <button title="New file in {folderLabel(currentFolder)} (Ctrl+Alt+N)" aria-label="New file" onclick={() => void startCreate()}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8.5 1.5h-4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h4M8.5 1.5l4 4V8M8.5 1.5v4h4M12 10v5M9.5 12.5h5" /></svg>
        </button>
        <button title="New file in {folderLabel('')}" aria-label="New file in root" onclick={() => void startCreate('')}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 1.5h11M8.5 4h-4a1 1 0 0 0-1 1v8.5a1 1 0 0 0 1 1h4M8.5 4l3 3v1M12 10v5M9.5 12.5h5" /></svg>
        </button>
        {#if onCreateFolder}
          <button title="New folder in {folderLabel(currentFolder)}" aria-label="New folder" onclick={() => void startCreate(currentFolder, 'folder')}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 13.5H2.5a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h3.5l1.5 2h6a1 1 0 0 1 1 1V8M12 10v5M9.5 12.5h5" /></svg>
          </button>
        {/if}
      {/if}
      <!-- On the website the page is the space: there is nothing to go back to without it. -->
      {#if capabilities.kind === 'desktop'}<button title="Close folder" aria-label="Close folder" onclick={onCloseFolder}>×</button>{/if}
    {/if}
  {/snippet}

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="scroll"
    class:drop-root={dropTarget === ''}
    oncontextmenu={event => showMenu(event, null)}
    ondragover={event => onDragOver(event, '')}
    ondragleave={onDragLeave}
    ondrop={event => void onDrop(event)}
  >
    <input class="upload-picker" type="file" multiple hidden bind:this={picker} onchange={() => void picked()} />
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
      {#if summaryParts.length || here.length}
        <div class="activity" role="status" aria-live="polite">
          {#if summaryParts.length}<span class="what-now">{#if activity.some(isRunning)}<span class="spinner" aria-hidden="true"></span>{/if}{summaryParts.join(' · ')}</span>{/if}
          {#if here.length}
            <span class="people">
              {#each here as person (person.who)}
                <span class="who" title={person.message}>{initials(person.who ?? '')}</span>
              {/each}
            </span>
          {/if}
        </div>
      {/if}
      {#if files.length === 0 && emptyFolders.length === 0}
        <p class="empty">No Markdown files in this folder yet.</p>
      {/if}
      <ul class="tree">
        {#snippet chips(path: string)}
          {#each activityByPath.get(path) ?? [] as item, i (i)}
            {#if item.kind === 'presence'}
              <span class="who small" title={item.message}>{initials(item.who ?? '')}</span>
            {:else}
              <span class="chip {tone(item)}" title={chipTitle(item)}>{chipLabel(item, now)}</span>
            {/if}
          {/each}
        {/snippet}
        {#snippet newEntry(depth: number)}
          <li>
            <input
              class="field rename"
              style:margin-left="{(createKind === 'folder' ? 8 : 22) + depth * 14}px"
              style:width="calc(100% - {(createKind === 'folder' ? 18 : 32) + depth * 14}px)"
              bind:this={newInput}
              bind:value={newName}
              placeholder={createKind === 'folder' ? 'New folder name' : 'New file name'}
              title={createKind === 'folder'
                ? `A name for the new folder in ${folderLabel(createIn)}. Enter makes it, Escape cancels.`
                : `A name for the new Markdown file in ${folderLabel(createIn)} (.md is added). Enter makes it, Escape cancels.`}
              onkeydown={finishCreate}
              onblur={() => (creating = false)}
            />
          </li>
        {/snippet}
        {#snippet branch(nodes: Node[], depth: number, parent: string)}
          {#if creating && createAt === parent}{@render newEntry(depth)}{/if}
          {#each nodes as node (keyOf(node))}
            <li>
              {#if renaming === keyOf(node)}
                <input
                  class="field rename files-rename"
                  style:margin-left="{(node.folder ? 8 : 22) + depth * 14}px"
                  style:width="calc(100% - {(node.folder ? 18 : 32) + depth * 14}px)"
                  bind:value={renameValue}
                  title={node.folder ? 'A new name for the folder. Enter renames, Escape cancels.' : 'A new name for the note (it keeps its extension). Enter renames, Escape cancels.'}
                  onkeydown={event => void finishRename(event, node)}
                  onblur={() => (renaming = null)}
                />
                {#if node.folder && expanded.has(node.path)}
                  <ul class="children" style:--guide="{15 + depth * 14}px">{@render branch(node.children, depth + 1, node.path)}</ul>
                {/if}
              {:else if node.folder}
                <button
                  class="row"
                  class:drop={dropTarget === node.path}
                  class:dragged={dragging?.path === node.path}
                  style:padding-left="{8 + depth * 14}px"
                  data-folder={node.path}
                  title={describe(node.path, true) ?? undefined}
                  draggable={canChange(node) && !!onMove}
                  onclick={() => toggle(node.path)}
                  oncontextmenu={event => showMenu(event, node)}
                  onkeydown={event => onRowKeydown(event, node)}
                  ondragstart={event => onDragStart(event, node)}
                  ondragend={onDragEnd}
                  ondragover={event => onDragOver(event, node.path, node)}
                  ondrop={event => void onDrop(event)}
                >
                  <span class="twisty" class:open={expanded.has(node.path)}>›</span>{node.name}
                  {#if isGithub(node.path)}<span class="badge" title="Mirrors a GitHub repository">GitHub</span>{/if}
                  {#if publishedVersion(node.path)}<span class="badge published" title="Publishes its files as versions: version {publishedVersion(node.path)} is the official one">v{publishedVersion(node.path)}</span>{/if}
                  {#if todoIn(node.path).length}<span class="unread" title={folderTodo(node.path)}>●</span>{/if}
                  {@render chips(node.path)}
                  {#if !expanded.has(node.path) && busyIn(node.path)}<span class="spinner" title="Something is under way in here"></span>{/if}
                </button>
                {#if expanded.has(node.path)}
                  <ul class="children" style:--guide="{15 + depth * 14}px">{@render branch(node.children, depth + 1, node.path)}</ul>
                {/if}
              {:else}
{#if uploadAt(node.path)}
                {@const up = uploadAt(node.path)!}
                <button
                  class="row file uploading"
                  class:failed={up.state === 'failed'}
                  style:padding-left="{22 + depth * 14}px"
                  title={up.message}
                  onclick={() => { if (up.state === 'failed') onDismissUpload?.(node.path); }}
                ><span class="label">{node.name}</span>{@render chips(node.path)}</button>
              {:else}
                <button
                  class="row file"
                  class:current={node.path === current}
                  style:padding-left="{22 + depth * 14}px"
                  class:conflict={conflictOriginal(node.name) !== null}
                  class:hidden-file={isHiddenFile(node.path) && !virtualFiles[node.path]}
                  class:dragged={dragging?.path === node.path}
                  class:to-read={todoSet.has(node.path)}
                  title={todoSet.has(node.path) ? `${fileTitle(node)}\n${fileTodo(node.path)}` : fileTitle(node)}
                  draggable={canChange(node) && !!onMove}
                  onclick={event => onOpen(node.path, { newWindow: isNewWindowClick(event) })}
                  onauxclick={event => { if (event.button === 1) onOpen(node.path, { newWindow: true }); }}
                  oncontextmenu={event => showMenu(event, node)}
                  onkeydown={event => onRowKeydown(event, node)}
                  ondragstart={event => onDragStart(event, node)}
                  ondragend={onDragEnd}
                  ondragover={event => onDragOver(event, parentOf(node.path))}
                  ondrop={event => void onDrop(event)}
                >{#if todoSet.has(node.path)}<span class="unread before" aria-label={unreadSet.has(node.path) ? 'To read' : reviewSet.has(node.path) ? 'To review' : 'Sent back to you'}>●</span>{/if}<span class="label">{#if conflictOriginal(node.name) !== null}<span class="warn">⚠</span>{/if}{isHiddenFile(node.path) ? node.name : displayName(node.name)}{#if virtualFiles[node.path]}<span class="badge virtual" aria-label="Virtual file">{virtualFiles[node.path].source ? 'linked' : 'virtual'}</span>{/if}{#if approvedSet.has(node.path)}<span class="approved" title="Approved by a reviewer" aria-label="Approved">✓</span>{/if}</span>{@render chips(node.path)}</button>
              {/if}
              {/if}
            </li>
          {/each}
        {/snippet}
        {@render branch(tree, 0, '')}
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
  /* An open folder's contents hang from a line under its arrow (0.33.0), so it is clear which
     folder a file such as .metatrash.json belongs to however deep the tree goes. */
  ul.children { position: relative; }
  ul.children::before {
    content: ''; position: absolute; top: 0; bottom: 4px; left: var(--guide);
    border-left: 1px solid var(--side-border); pointer-events: none;
  }
  .row {
    display: block; width: 100%; text-align: left; padding: 3px 10px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .row:hover { background: var(--side-hover); }
  .row.current { background: var(--side-accent-soft); color: var(--side-accent); font-weight: 600; }
  .row.drop, .scroll.drop-root { background: var(--side-accent-soft); box-shadow: inset 0 0 0 1px var(--side-accent); }
  .row.dragged { opacity: .5; }
  .field.rename { display: block; margin: 1px 0; padding: 2px 6px; }
  .badge {
    margin-left: 6px; padding: 0 5px; font-size: 10px; border-radius: 3px;
    color: var(--side-muted); border: 1px solid var(--side-border);
  }
  .badge.published { color: var(--side-accent); border-color: var(--side-accent); }
  .badge.virtual { font-size: 9px; }
  /* A published file still to read, and the folders holding one. */
  .unread { margin-left: 6px; font-size: 9px; vertical-align: 1px; color: #d93025; }
  .unread.before { margin: 0 5px 0 -12px; }
  .approved { margin-left: 6px; color: #1e8e3e; font-weight: 700; }
  :global([data-theme="dark"]) .approved { color: #5bb974; }
  .row.file.to-read { font-weight: 600; }
  /* Activity (0.30.0): chips after a file's name, a line at the top of the list. */
  .row.file { display: flex; align-items: center; gap: 4px; }
  .row.file .label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .row.file.uploading { cursor: default; color: var(--side-muted); }
  .row.file.uploading.failed { cursor: pointer; }
  .chip {
    flex: none; padding: 0 5px; font-size: 10px; font-weight: 400; line-height: 15px; border-radius: 8px;
    color: var(--side-accent); background: var(--side-accent-soft); white-space: nowrap;
  }
  .chip.good { color: #1e7e34; background: rgba(30, 126, 52, .12); }
  .chip.warn { color: #9a5b00; background: rgba(178, 106, 0, .14); }
  .chip.bad { color: #c5221f; background: rgba(217, 48, 37, .12); }
  :global([data-theme="dark"]) .chip.good { color: #7fd18f; }
  :global([data-theme="dark"]) .chip.warn { color: #f0b45a; }
  :global([data-theme="dark"]) .chip.bad { color: #f28b82; }
  .who {
    display: inline-flex; align-items: center; justify-content: center; flex: none;
    width: 18px; height: 18px; border-radius: 50%; font-size: 9px; font-weight: 700;
    color: #fff; background: var(--side-accent);
  }
  :global([data-theme="dark"]) .who { color: #1d1a22; }
  .who.small { width: 15px; height: 15px; font-size: 8px; }
  .activity {
    display: flex; align-items: center; gap: 8px; margin: 0 8px 6px; padding: 5px 8px;
    font-size: 11px; color: var(--side-fg); background: var(--side-hover); border-radius: 5px;
  }
  .activity .what-now { flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: 6px; }
  .activity .people { display: flex; gap: 2px; margin-left: auto; }
  .spinner {
    display: inline-block; flex: none; width: 9px; height: 9px; margin-left: 6px; vertical-align: -1px;
    border: 1.5px solid var(--side-accent-soft); border-top-color: var(--side-accent); border-radius: 50%;
    animation: spin .9s linear infinite;
  }
  .activity .spinner { margin-left: 0; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .spinner { animation: none; } }
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
  /* Listed only with View > Show Hidden Files. */
  .row.file.hidden-file { opacity: 0.6; }
  .row.recent :global(.kind) { margin-top: 2px; color: var(--side-muted); }
  .row.recent :global(.kind.space) { color: var(--side-accent); }
  .what { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
</style>
