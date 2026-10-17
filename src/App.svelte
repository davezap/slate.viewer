<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { invoke, convertFileSrc } from '@tauri-apps/api/core';
  import { getVersion } from '@tauri-apps/api/app';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { getCurrentWebview } from '@tauri-apps/api/webview';
  import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
  import { open as openDialog, save as saveDialog, message } from '@tauri-apps/plugin-dialog';
  import { openUrl, openPath, revealItemInDir } from '@tauri-apps/plugin-opener';
  import type { SlateCompareEndDetail, SlateEditorApi, SlateOutline, SlateOutlineHeading, SlateUploadedAttachment, SlateWorkspaceMode } from '../public/slate/slate-editor';
  import { basename, dirname, extname, joinPath, toLocalPath } from './lib/paths';
  import { detectFormat, toFileText, NEW_FILE_FORMAT, type FileFormat } from './lib/document';
  import { recentFileList, recentFolderList, byDate, type RecentEntry } from './lib/recent';
  import {
    themePref, setThemePref, zoomPref, setZoomPref, ZOOM_MIN, ZOOM_MAX, sidebarWidthPref, setSidebarWidthPref,
    sectionsPref, setSectionsPref, sectionWeightsPref, setSectionWeightsPref, activityLabelsPref, setActivityLabelsPref,
    SECTION_IDS, type ThemePref, type SectionId,
  } from './lib/prefs';
  import { resolveWikiLink, noteFileName } from './lib/wiki';
  import type { SearchMatch } from './lib/types';
  import ActivityBar from './lib/ActivityBar.svelte';
  import SidePanel from './lib/SidePanel.svelte';
  import FilesSection from './lib/FilesSection.svelte';
  import SearchSection from './lib/SearchSection.svelte';
  import OutlineSection from './lib/OutlineSection.svelte';
  import TitleBar from './lib/TitleBar.svelte';
  import { customTitleBar, setNativeMenu, type MenuItem } from './lib/menu';
  import FindBar from './lib/FindBar.svelte';
  import OpenSpace from './lib/OpenSpace.svelte';
  import {
    mtsync, sameFolder, describeState, lastSyncTime, spacePathProblem, spaceSafeName, conflictOriginal, isSignedOut, SPACE_FILE_LIMIT,
    DEFAULT_SERVER, type SpaceRef, type FolderDescription } from './lib/space';
  import QuickOpen from './lib/QuickOpen.svelte';
  import HistoryPanel from './lib/HistoryPanel.svelte';
  import { revisionText, versionLabel, type HistoryEntry } from './lib/history';

  interface LoadedDocument { path: string; text: string; hasBom: boolean }
  interface FolderListing { files: string[]; truncated: boolean }
  /** The open folder is a Metatrash space that mtsync keeps in sync. */
  interface OpenedSpace { space: string; server: string; access: string; folder: string; state: string }
  const MARKDOWN_EXTENSIONS = ['md', 'markdown', 'mdown', 'mkd'];
  const MARKDOWN_FILTERS = [{ name: 'Markdown', extensions: MARKDOWN_EXTENSIONS }, { name: 'All files', extensions: ['*'] }];
  const ATTACHMENT_FOLDER = 'assets';

  const appWindow = getCurrentWindow();
  const systemDark = matchMedia('(prefers-color-scheme: dark)');

  let host: HTMLDivElement;
  let editor: SlateEditorApi | null = null;

  let path = $state<string | null>(null);
  let format: FileFormat = { ...NEW_FILE_FORMAT };
  let baseline = '';
  let dirty = $state(false);
  let missingOnDisk = $state(false);
  let history = $state<string[]>([]);
  let forward = $state<string[]>([]);
  let findBar = $state<ReturnType<typeof FindBar>>();
  let titleBar = $state<ReturnType<typeof TitleBar>>();
  let recent = $state<RecentEntry[]>(recentFileList.list());
  let recentFolders = $state<RecentEntry[]>(recentFolderList.list());

  // Folder mode
  let root = $state<string | null>(null);
  let folderFiles = $state<string[]>([]);
  let folderTruncated = $state(false);
  let searchQuery = $state('');

  // Metatrash spaces (through mtsync)
  let openedSpace = $state<OpenedSpace | null>(null);
  /** When this window last saved into the space: the status shows Syncing… until mtsync finishes a pass after it. */
  let syncPendingSince = $state<number | null>(null);
  let spaceDialog = $state(false);
  let descriptions = $state<FolderDescription[]>([]);
  let revealFolder = $state<string | null>(null);
  let docBytes = $state(0);
  /** The file's text as it was on disk when loaded or last saved, to notice changes made elsewhere. */
  let diskText: string | null = null;
  let quickOpen = $state(false);

  // Opened from Explorer (a file or folder on the command line): start read only, with the
  // sections closed and the icon bar without labels. Nothing of this is saved as a preference.
  const launched = window.__SLATE_VIEWER_LAUNCHED__ === true;

  // Sidebar: an icon bar whose buttons switch sections on and off; the ones on stack in the panel.
  let sections = $state(launched ? { files: false, search: false, outline: false, history: false } : sectionsPref());
  let sectionWeights = $state(sectionWeightsPref());
  let activityLabels = $state(launched ? false : activityLabelsPref());
  let sidebarWidth = $state(sidebarWidthPref());
  let searchSection = $state<ReturnType<typeof SearchSection>>();
  let outline = $state<SlateOutline | null>(null);
  let activeHeading = $state<string | null>(null);
  const openSections = $derived(SECTION_IDS.filter(id => sections[id]));
  let theme = $state<ThemePref>(themePref());
  let readOnly = $state(false);
  let zoom = zoomPref();

  const name = $derived(path ? basename(path) : 'Untitled');
  const folder = () => (path ? dirname(path) : null);

  /** The open document relative to the folder root, or null when it is outside it. */
  const currentRelative = $derived.by(() => {
    if (!root || !path) return null;
    const base = root.replace(/[\\/]+$/, '').replace(/\\/g, '/').toLowerCase() + '/';
    const doc = path.replace(/\\/g, '/');
    return doc.toLowerCase().startsWith(base) ? doc.slice(base.length) : null;
  });

  $effect(() => {
    const flags = `${dirty ? '• ' : ''}${name}${missingOnDisk ? ' (deleted on disk)' : ''}${readOnly ? ' [read only]' : ''}${root ? ` - ${basename(root)}` : ''}`;
    void appWindow.setTitle(`${flags} - Slate Viewer`);
  });

  // ---- Guards ---------------------------------------------------------------

  // A dialog-opening action can be triggered twice by one key press (menu + key handler,
  // or Slate's own Ctrl+S plus ours), so each action ignores repeats while it runs.
  const running = new Set<string>();
  async function once(key: string, action: () => Promise<unknown>) {
    if (running.has(key)) return;
    running.add(key);
    try { await action(); } finally { running.delete(key); }
  }

  async function showError(error: unknown) {
    await message(String(error), { title: 'Slate Viewer', kind: 'error' });
  }

  // ---- Loading and saving -------------------------------------------------

  function watch(target: string | null) {
    invoke('watch_document', { path: target }).catch(console.error);
  }

  function setDocument(doc: LoadedDocument) {
    path = doc.path;
    format = detectFormat(doc.text, doc.hasBom);
    diskText = doc.text;
    missingOnDisk = false;
    headingPinned = false;
    watch(doc.path);
  }

  /** Loads a file into this window, replacing the current (clean) document. */
  async function loadHere(target: string, { pushHistory = true } = {}) {
    if (!editor) return;
    try {
      const doc = await invoke<LoadedDocument>('read_document', { path: target });
      if (pushHistory && path) { history = [...history, path]; forward = []; }
      setDocument(doc);
      await editor.setMarkdown(doc.text);
      baseline = editor.getMarkdown();
      dirty = false;
      recentFileList.remember(doc.path);
      recent = recentFileList.list();
      void offerConflictResolve();
    } catch (error) {
      recentFileList.forget(target);
      recent = recentFileList.list();
      await showError(error);
    }
  }

  /** Opens a new window, keeping this window's folder in its sidebar. */
  function openWindow(target: string | null) {
    return invoke('open_window', { path: target, folder: root });
  }

  /**
   * Opens a file here when this window has nothing unsaved. Otherwise, in folder mode
   * it asks to save first (the sidebar belongs to this window); outside it, a new window opens.
   */
  async function openDocument(target: string) {
    if (!dirty) await loadHere(target);
    else if (root) { if (await confirmDiscard()) await loadHere(target); }
    else await openWindow(target);
  }

  async function writeTo(target: string): Promise<boolean> {
    if (!editor) return false;
    const markdown = editor.getMarkdown();
    if (target === path && lockReason) {
      await message(`${lockReason} Your changes can't be saved here.`, { title: 'Slate Viewer', kind: 'info' });
      return false;
    }
    const text = toFileText(markdown, format);
    const inSpace = spaceRelative(target);
    if (inSpace !== null && !(await spaceAllowsSave(target, inSpace, text))) return false;
    // Spaces store UTF-8 without a byte order mark.
    const hasBom = inSpace !== null ? false : format.hasBom;
    if (target === path && !(await diskUnchangedOrConfirmed())) return false;
    // Saving the same text gives mtsync nothing to upload, so there's no pass to wait for.
    const sameAsDisk = target === path && diskText === text;
    try {
      await invoke('write_document', { path: target, text, hasBom });
    } catch (error) {
      await showError(error);
      return false;
    }
    if (inSpace !== null && !sameAsDisk) syncPendingSince = Date.now();
    if (target !== path) watch(target);
    path = target;
    format = { ...format, hasBom };
    diskText = text;
    baseline = markdown;
    dirty = false;
    missingOnDisk = false;
    historyStamp += 1;
    recentFileList.remember(target);
    recent = recentFileList.list();
    return true;
  }

  /**
   * At save time, makes sure nobody else changed the file since it was loaded (Metatrash, an agent,
   * another program). Resolves true to go ahead and overwrite.
   */
  async function diskUnchangedOrConfirmed(): Promise<boolean> {
    if (!path || diskText === null) return true;
    let current: LoadedDocument;
    try {
      current = await invoke<LoadedDocument>('read_document', { path });
    } catch {
      return true; // deleted: saving recreates it, so the user's edit wins
    }
    if (current.text === diskText) return true;
    const where = openedSpace && spaceRelative(path) !== null ? 'in Metatrash' : 'on disk';
    const choice = await message(`${name} changed ${where} while you were editing.\n\nCompare the two versions, or keep yours and replace theirs?`, {
      title: 'Slate Viewer',
      kind: 'warning',
      buttons: { yes: 'Compare', no: 'Keep Mine', cancel: 'Cancel' },
    });
    if (choice === 'Keep Mine') return true;
    if (choice === 'Compare') await compareWithDisk(current);
    return false;
  }

  async function save(): Promise<boolean> {
    return path ? writeTo(path) : saveAs();
  }

  async function saveAs(): Promise<boolean> {
    const target = await saveDialog({ defaultPath: path ?? 'Untitled.md', filters: MARKDOWN_FILTERS });
    return target ? writeTo(target) : false;
  }

  async function chooseAndOpen() {
    const picked = await openDialog({ multiple: true, directory: false, filters: MARKDOWN_FILTERS });
    const files = Array.isArray(picked) ? picked : picked ? [picked] : [];
    for (const [i, file] of files.entries()) {
      if (i === 0) await openDocument(file);
      else await openWindow(file);
    }
  }

  // ---- Folder mode ------------------------------------------------------------

  async function openFolder(dir: string, { showFiles = true } = {}) {
    try {
      const listing = await invoke<FolderListing>('list_folder', { root: dir });
      root = dir;
      folderFiles = listing.files;
      folderTruncated = listing.truncated;
      if (showFiles) setSection('files', true);
      recentFolderList.remember(dir);
      recentFolders = recentFolderList.list();
      invoke('watch_folder', { root: dir }).catch(console.error);
      void detectSpace(dir);
    } catch (error) {
      recentFolderList.forget(dir);
      recentFolders = recentFolderList.list();
      await showError(error);
    }
  }

  async function chooseFolder() {
    const picked = await openDialog({ directory: true, multiple: false });
    if (typeof picked === 'string') await openFolder(picked);
  }

  function closeFolder() {
    root = null;
    folderFiles = [];
    openedSpace = null;
    descriptions = [];
    quickOpen = false;
    invoke('watch_folder', { root: null }).catch(console.error);
  }

  let folderRefreshTimer: ReturnType<typeof setTimeout> | undefined;
  function onFolderChange() {
    clearTimeout(folderRefreshTimer);
    folderRefreshTimer = setTimeout(() => void refreshFolder(), 300);
  }

  async function refreshFolder() {
    if (!root) return;
    const listed = root;
    try {
      const listing = await invoke<FolderListing>('list_folder', { root: listed });
      if (listed !== root) return;
      folderFiles = listing.files;
      folderTruncated = listing.truncated;
      void offerConflictResolve();
    } catch {
      // The folder itself went away.
      closeFolder();
    }
  }

  /** Opens a file from the sidebar or Go to File; `find` highlights a search term once loaded. */
  async function openFromFolder(relative: string, { newWindow = false, find, line }: { newWindow?: boolean; find?: string; line?: number } = {}) {
    if (!root) return;
    const target = joinPath(root, relative);
    if (newWindow) { await openWindow(target); return; }
    if (target !== path) await openDocument(target);
    if (find && target === path) await findBar?.open(find, line ? line - 1 : undefined);
  }

  async function createNote(noteName: string): Promise<string | null> {
    const inFolder = folder() && (currentRelative !== null || !root) ? folder() : root;
    if (!inFolder) {
      await message('Save this document first, so the new note has a folder to go in.', { title: 'Slate Viewer', kind: 'info' });
      return null;
    }
    // In a space, names can't have spaces or capitals beyond ASCII: "My Note" becomes my-note.md.
    const inSpace = spaceRelative(joinPath(inFolder, 'x.md')) !== null;
    const fileName = inSpace ? spaceSafeName(noteName) : noteName;
    try {
      const created = await invoke<string>('create_note', { folder: inFolder, name: fileName, title: noteName });
      await refreshFolder();
      return created;
    } catch (error) {
      await showError(error);
      return null;
    }
  }

  async function createNoteFromSidebar(noteName: string): Promise<boolean> {
    const created = await createNote(noteName);
    if (created) await openDocument(created);
    return created !== null;
  }

  function searchFolder(query: string) {
    return invoke<{ matches: SearchMatch[]; truncated: boolean }>('search_folder', { root, query });
  }

  async function showSearch() {
    setSection('search', true);
    await tick();
    await searchSection?.focus();
  }

  // ---- Sidebar sections --------------------------------------------------------

  function setSection(id: SectionId, on: boolean, { remember = true } = {}) {
    if (sections[id] === on) return;
    sections = { ...sections, [id]: on };
    // Only this section's change is saved, so a window opened from Explorer (sections closed)
    // doesn't overwrite the others' saved state.
    if (remember) setSectionsPref({ ...sectionsPref(), [id]: on });
    // Slate keeps its own idea of whether the outline is showing (Ctrl+Shift+O inside the editor).
    if (id === 'outline' && editor && editor.isOutlineOpen() !== on) editor.setOutlineOpen(on);
  }

  function toggleSection(id: SectionId) {
    setSection(id, !sections[id]);
  }

  function toggleActivityLabels() {
    activityLabels = !activityLabels;
    setActivityLabelsPref(activityLabels);
  }

  // After a click in Document Nav the clicked heading stays highlighted (even when the document
  // can't scroll far enough to bring it to the top) until the reader scrolls or types.
  let headingPinned = false;

  function revealHeading(heading: SlateOutlineHeading) {
    editor?.revealLine(heading.line);
    activeHeading = heading.id;
    headingPinned = true;
  }

  function unpinHeading() {
    headingPinned = false;
  }

  /** Highlights the heading at the top of the view as the document scrolls (in any mode). */
  let headingFrame = 0;
  function trackActiveHeading() {
    cancelAnimationFrame(headingFrame);
    headingFrame = requestAnimationFrame(() => {
      if (headingPinned || !editor || !outline || !sections.outline) return;
      const top = editor.getTopLine();
      let first: string | null = null;
      let found: string | null = null;
      const visit = (headings: SlateOutlineHeading[]) => {
        for (const heading of headings) {
          first ??= heading.id;
          if (heading.line <= top) found = heading.id;
          visit(heading.children);
        }
      };
      visit(outline.headings);
      activeHeading = found ?? first;
    });
  }

  function startResize(event: PointerEvent) {
    const handle = event.currentTarget as HTMLElement;
    handle.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startWidth = sidebarWidth;
    const move = (e: PointerEvent) => { sidebarWidth = Math.min(600, Math.max(160, startWidth + e.clientX - startX)); };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      setSidebarWidthPref(sidebarWidth);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up, { once: true });
  }

  // ---- Wiki links ---------------------------------------------------------------

  async function followWikiLink(target: string, newWindow: boolean) {
    const docFolder = folder();
    let found: string | null = null;
    if (root) {
      found = resolveWikiLink(target, folderFiles, root, path);
    } else if (docFolder) {
      const candidate = joinPath(docFolder, `${noteFileName(target)}.md`);
      found = await invoke('read_document', { path: candidate }).then(() => candidate, () => null);
    }

    if (!found) {
      const inSpace = openedSpace !== null && currentRelative !== null;
      const fileName = `${inSpace ? spaceSafeName(noteFileName(target)) : noteFileName(target)}.md`;
      const choice = await message(`There is no note called "${target}" yet.\n\nCreate ${fileName}?`, {
        title: 'Slate Viewer',
        kind: 'info',
        buttons: { ok: 'Create', cancel: 'Cancel' },
      });
      if (choice !== 'Create') return;
      found = await createNote(noteFileName(target));
      if (!found) return;
    }
    if (newWindow) await openWindow(found);
    else await openDocument(found);
  }

  /** Back and Forward step through the documents opened in this window (links, sidebar, Open). */
  async function goBack() {
    const previous = history.at(-1);
    if (!previous || !(await confirmDiscard())) return;
    const leaving = path;
    history = history.slice(0, -1);
    await loadHere(previous, { pushHistory: false });
    if (leaving) forward = [...forward, leaving];
  }

  async function goForward() {
    const next = forward.at(-1);
    if (!next || !(await confirmDiscard())) return;
    const leaving = path;
    forward = forward.slice(0, -1);
    await loadHere(next, { pushHistory: false });
    if (leaving) history = [...history, leaving];
  }

  /** Asks about unsaved changes. Resolves true when it is fine to discard the document. */
  async function confirmDiscard(): Promise<boolean> {
    if (!dirty) return true;
    const choice = await message(`Do you want to save the changes to ${name}?`, {
      title: 'Slate Viewer',
      kind: 'warning',
      buttons: { yes: 'Save', no: "Don't Save", cancel: 'Cancel' },
    });
    if (choice === 'Save') return save();
    return choice === "Don't Save";
  }

  // ---- Changes made by other programs ------------------------------------------

  let diskCheckTimer: ReturnType<typeof setTimeout> | undefined;
  let diskPromptOpen = false;

  function onDiskChange() {
    clearTimeout(diskCheckTimer);
    diskCheckTimer = setTimeout(() => void checkDisk(), 250);
  }

  async function checkDisk() {
    if (!editor || !path || diskPromptOpen) return;
    const watched = path;
    let doc: LoadedDocument;
    try {
      doc = await invoke<LoadedDocument>('read_document', { path: watched });
    } catch {
      // Deleted or renamed away. Keep the text and treat it as unsaved, so closing asks first.
      missingOnDisk = true;
      dirty = true;
      return;
    }
    if (watched !== path) return;
    missingOnDisk = false;

    const current = editor.getMarkdown();
    if (doc.text === toFileText(current, format) && doc.hasBom === format.hasBom) {
      // Our own save, or someone saved exactly what we have.
      baseline = current;
      dirty = false;
      return;
    }

    if (dirty) {
      diskPromptOpen = true;
      const where = openedSpace && spaceRelative(watched) !== null ? 'in Metatrash' : 'by another program';
      const choice = await message(`${name} changed ${where} while you were editing.\n\nCompare the two versions, use theirs and lose your changes here, or keep yours (saving replaces theirs)?`, {
        title: 'Slate Viewer',
        kind: 'warning',
        buttons: { yes: 'Compare', no: 'Use Theirs', cancel: 'Keep Mine' },
      }).finally(() => { diskPromptOpen = false; });
      if (watched !== path) return;
      if (choice === 'Compare') { await compareWithDisk(doc); return; }
      if (choice !== 'Use Theirs') {
        // Keep Mine: the user has seen theirs, so the next save replaces it without asking again.
        diskText = doc.text;
        return;
      }
    }
    await reloadFrom(doc);
    void offerConflictResolve();
  }

  // ---- Comparing versions (Slate's Compare) ----------------------------------------

  /** While merging a sync conflict copy into its original: both full paths. */
  let resolving: { copy: string; original: string } | null = null;
  /** Conflict copies this window has already offered to resolve, so it asks once each. */
  const offeredConflicts = new Set<string>();

  /** Shows the file's current text beside the user's unsaved edits, to merge in place. */
  async function compareWithDisk(doc: LoadedDocument) {
    if (!editor || !path) return;
    // The user is looking at this version now, so saving the merge mustn't warn about it again.
    diskText = doc.text;
    const label = openedSpace && spaceRelative(path) !== null ? 'Metatrash version' : 'Disk version';
    try {
      await editor.compare(doc.text, { label });
    } catch (error) {
      await showError(error);
    }
  }

  function folderOf(relative: string) {
    return relative.slice(0, relative.lastIndexOf('/') + 1);
  }

  /** The open document's conflict pair in the folder (relative paths), newest copy first. */
  function conflictPair(): { copy: string; original: string } | null {
    const rel = currentRelative;
    if (!rel) return null;
    const dir = folderOf(rel).toLowerCase();
    const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
    const originalName = conflictOriginal(basename(rel));
    if (originalName) {
      const original = folderFiles.find(f => same(f, folderOf(rel) + originalName));
      return original ? { copy: rel, original } : null;
    }
    const copies = folderFiles
      .filter(f => same(folderOf(f), dir) && same(conflictOriginal(basename(f)) ?? '', basename(rel)))
      .sort()
      .reverse();
    return copies.length ? { copy: copies[0], original: rel } : null;
  }

  /**
   * When the open file is a sync conflict copy, or has one (mtsync keeps the user's version as
   * `name.conflict-….md` when the file changed on both sides), offers to merge them once.
   */
  async function offerConflictResolve() {
    if (!editor || !root || readOnly || resolving || diskPromptOpen || editor.isComparing()) return;
    const pair = conflictPair();
    if (!pair || offeredConflicts.has(pair.copy)) return;
    offeredConflicts.add(pair.copy);
    const original = basename(pair.original);
    const choice = await message(`${basename(pair.copy)} holds your version of ${original}: sync kept it because ${original} also changed in the space.\n\nCompare the two and merge them into ${original}?`, {
      title: 'Slate Viewer',
      kind: 'warning',
      buttons: { ok: 'Compare', cancel: 'Not Now' },
    });
    if (choice === 'Compare' && root) await resolveConflict(joinPath(root, pair.copy), joinPath(root, pair.original));
  }

  /** Opens the original and compares it with the conflict copy; the user merges into the original. */
  async function resolveConflict(copyPath: string, originalPath: string) {
    if (!editor) return;
    let copy: LoadedDocument;
    try {
      copy = await invoke<LoadedDocument>('read_document', { path: copyPath });
    } catch (error) {
      await showError(error);
      return;
    }
    if (path !== originalPath) {
      if (!(await confirmDiscard())) return;
      await loadHere(originalPath);
      if (path !== originalPath) return;
    }
    resolving = { copy: copyPath, original: originalPath };
    try {
      await editor.compare(copy.text, { label: 'Your copy' });
    } catch (error) {
      resolving = null;
      await showError(error);
    }
  }

  // ---- Version history (a space file's earlier versions, through mtsync) -----------

  /** Bumped when the open file is saved or reloaded, so the history list refreshes. */
  let historyStamp = $state(0);
  /** The revision Slate is comparing with, while it is. */
  let historyRevision = $state<string | null>(null);
  const historyFile = $derived(path && openedSpace && spaceRelative(path) !== null ? path : null);

  async function compareWithRevision(entry: HistoryEntry) {
    if (!editor || !path) return;
    if (readOnly) {
      await message(lockReason
        ? `${lockReason} Earlier versions can only be compared with a document you can edit.`
        : 'Turn off Read Only (Ctrl+Shift+R) to compare with an earlier version.', { title: 'Slate Viewer', kind: 'info' });
      return;
    }
    const file = path;
    let text: string;
    try {
      text = await revisionText(entry, file);
    } catch (error) {
      await showError(error);
      return;
    }
    if (path !== file) return;
    resolving = null;
    try {
      await editor.compare(text, { label: versionLabel(entry.timestamp) });
      historyRevision = entry.revision;
    } catch (error) {
      await showError(error);
    }
  }

  async function onCompareEnd(detail: SlateCompareEndDetail) {
    if (!editor) return;
    historyRevision = null;
    // Merged back to exactly what is on disk: nothing left to save.
    if (diskText !== null && toFileText(editor.getMarkdown(), format) === diskText) baseline = editor.getMarkdown();
    dirty = missingOnDisk || editor.getMarkdown() !== baseline;
    const job = resolving;
    resolving = null;
    if (!job || detail.reason !== 'done' || path !== job.original) return;

    // Done merging a conflict: save the original, then (only if the user says so) delete the copy.
    const copyName = basename(job.copy);
    const choice = await message(dirty
      ? `Save ${name} and delete the conflict copy ${copyName}?\n\nDeleting the copy removes it from the space too.`
      : `Delete the conflict copy ${copyName}?\n\nIt is removed from the space too.`, {
      title: 'Slate Viewer',
      kind: 'info',
      buttons: dirty
        ? { yes: 'Save and Delete Copy', no: 'Save Only', cancel: 'Cancel' }
        : { ok: 'Delete Copy', cancel: 'Keep Copy' },
    });
    if (choice !== 'Save and Delete Copy' && choice !== 'Save Only' && choice !== 'Delete Copy') return;
    if (dirty && !(await save())) return;
    if (choice === 'Save Only') return;
    try {
      await invoke('delete_conflict_copy', { path: job.copy });
    } catch (error) {
      await showError(error);
    }
    await refreshFolder();
  }

  async function reloadFrom(doc: LoadedDocument) {
    if (!editor) return;
    const scroller = host.querySelector<HTMLElement>('#previewPane');
    const scrollTop = scroller?.scrollTop ?? 0;
    setDocument(doc);
    await editor.setMarkdown(doc.text);
    baseline = editor.getMarkdown();
    dirty = false;
    historyStamp += 1;
    if (scroller) scroller.scrollTop = scrollTop;
  }

  // ---- View ---------------------------------------------------------------------

  function applyTheme() {
    const resolved = theme === 'system' ? (systemDark.matches ? 'dark' : 'light') : theme;
    host.dataset.theme = resolved;
    document.documentElement.dataset.theme = resolved;
    void appWindow.setTheme(theme === 'system' ? null : theme).catch(() => {});
  }

  /** Windows start hidden (see open_document_window in lib.rs) until the theme is applied. */
  let windowShown = false;
  function showWindow() {
    if (windowShown) return;
    windowShown = true;
    void appWindow.show().catch(() => {});
  }

  function chooseTheme(next: ThemePref) {
    theme = next;
    setThemePref(next);
    applyTheme();
  }

  async function setMode(mode: SlateWorkspaceMode) {
    if (!editor || (readOnly && mode !== 'preview')) return;
    await editor.setWorkspaceMode(mode);
    findBar?.refresh();
  }

  /**
   * Opened from Explorer: read only, sections closed. A folder with several notes shows Files and
   * Document Nav (and its README.md, if it has one); a folder with a single note opens that note.
   */
  async function applyLaunchLayout(launchFolder: string | null | undefined) {
    if (!editor) return;
    if (launchFolder && root) {
      if (folderFiles.length === 1) {
        await openFromFolder(folderFiles[0]);
      } else {
        setSection('files', true, { remember: false });
        if (folderFiles.length > 1) {
          setSection('outline', true, { remember: false });
          const readme = folderFiles.find(file => file.toLowerCase() === 'readme.md');
          if (readme && !path) await openFromFolder(readme);
        }
      }
    }
    if (!readOnly) {
      readOnly = true;
      editor.setInteractiveTasks(true);
      await editor.setReadOnly(true);
    }
  }

  async function toggleReadOnly() {
    if (!editor) return;
    if (lockReason && readOnly) {
      await message(lockReason, { title: 'Slate Viewer', kind: 'info' });
      return;
    }
    readOnly = !readOnly;
    // Read only is "checklist mode": text is locked, task boxes still tick (and mark the file changed).
    editor.setInteractiveTasks(readOnly);
    await editor.setReadOnly(readOnly);
  }

  // ---- Metatrash spaces ---------------------------------------------------------

  /** Why the open document can't be edited (a read-only space, the space's own README), or null. */
  const lockReason = $derived.by(() => {
    if (!openedSpace || !path) return null;
    const rel = currentRelative;
    if (rel === null) return null;
    if (openedSpace.access === 'read only') return `${openedSpace.space} is a read-only space.`;
    if (rel === 'README.md') return "The space's README is managed on metatrash.com, so it opens read only.";
    return null;
  });

  // Lock (and unlock) the editor as documents in and out of a locked space open.
  let lockedByUs = false;
  $effect(() => {
    const locked = lockReason !== null;
    if (!editor) return;
    if (locked && !readOnly) {
      lockedByUs = true;
      readOnly = true;
      editor.setInteractiveTasks(false);
      void editor.setReadOnly(true);
    } else if (!locked && lockedByUs) {
      lockedByUs = false;
      readOnly = false;
      void editor.setReadOnly(false);
    }
  });

  /** `target` relative to the open space's folder (with /), or null when it is outside. */
  function spaceRelative(target: string): string | null {
    if (!openedSpace) return null;
    const base = openedSpace.folder.replace(/[\\/]+$/, '').replace(/\\/g, '/');
    const doc = target.replace(/\\/g, '/');
    return doc.toLowerCase().startsWith(base.toLowerCase() + '/') ? doc.slice(base.length + 1) : null;
  }

  /** The space rules mtsync enforces, checked before saving rather than silently not syncing. */
  async function spaceAllowsSave(target: string, rel: string, text: string): Promise<boolean> {
    const refuse = async (why: string) => {
      await message(why, { title: 'Slate Viewer', kind: 'warning' });
      return false;
    };
    if (target !== path) {
      const problem = spacePathProblem(rel);
      if (problem) {
        const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/') + 1) : '';
        const suggestion = dir + spaceSafeName(basename(rel).replace(/\.[^.]+$/, '')) + (extname(rel) ? `.${extname(rel)}` : '.md');
        return refuse(`${problem}\n\nMetatrash wouldn't sync this file. Try a name like "${suggestion}".`);
      }
      const clash = folderFiles.find(f => f !== rel && f.toLowerCase() === rel.toLowerCase());
      if (clash) return refuse(`"${clash}" already exists. Spaces treat names that differ only by capitals as different files, but Windows doesn't, so pick another name.`);
    }
    const bytes = new TextEncoder().encode(text).length;
    if (bytes > SPACE_FILE_LIMIT) {
      return refuse(`This note is ${Math.ceil(bytes / 1024)} KB. Metatrash spaces hold files up to 64 KB, so it wouldn't sync. Split it into smaller notes first.`);
    }
    return true;
  }

  /** If `dir` is a folder mtsync syncs, remembers which space it is and starts showing its status. */
  async function detectSpace(dir: string) {
    openedSpace = null;
    syncPendingSince = null;
    descriptions = [];
    try {
      const info = await mtsync.info();
      if (!info.path) return;
      const registration = (await mtsync.list()).find(r => sameFolder(r.folder, dir));
      // Remember which kind it is, for the icons in the recent lists.
      recentFolderList.setKind(dir, registration ? 'space' : 'folder');
      recentFolders = recentFolderList.list();
      if (!registration || dir !== root) return;
      const server = registration.server ?? DEFAULT_SERVER;
      const access = await mtsync.spaces(server).then(rows => rows.find(r => r.space === registration.space)?.access ?? 'read and write', () => 'read and write');
      if (dir !== root) return;
      openedSpace = { space: registration.space, server, access, folder: registration.folder, state: registration.state };
      void loadDescriptions();
    } catch {
      // mtsync missing or failing: an ordinary folder.
    }
  }

  /** Marks the recent folders mtsync syncs as spaces (and the rest as folders), for their icons. */
  async function markRecentSpaces() {
    try {
      if (!recentFolders.length || !(await mtsync.info()).path) return;
      const registrations = await mtsync.list();
      for (const entry of recentFolderList.list()) {
        recentFolderList.setKind(entry.path, registrations.some(r => sameFolder(r.folder, entry.path)) ? 'space' : 'folder');
      }
      recentFolders = recentFolderList.list();
    } catch {
      // mtsync missing or failing: keep what was remembered.
    }
  }

  async function loadDescriptions() {
    if (!root) return;
    descriptions = await invoke<FolderDescription[]>('folder_descriptions', { root }).catch(() => []);
  }

  async function refreshSpaceState() {
    if (!openedSpace) return;
    const space = openedSpace;
    const registration = await mtsync.list().then(list => list.find(r => sameFolder(r.folder, space.folder)), () => undefined);
    if (openedSpace !== space) return;
    const state = registration?.state ?? 'service not running';
    openedSpace = { ...space, state };
    if (syncPendingSince !== null && !syncStillPending(state, syncPendingSince)) {
      syncPendingSince = null;
      historyStamp += 1; // the save has reached the space, so it is in the history now
    }
  }

  /**
   * True until mtsync reports a pass that ended after `since` (in a later second, as the state has
   * no milliseconds). mtsync checks the folder every 5 s and waits for a file to settle, so a pass
   * normally lands within about 15 s; it gives up after 30 s, so a save mtsync skips can't leave it stuck.
   */
  function syncStillPending(state: string, since: number): boolean {
    if (!state.startsWith('in sync') || Date.now() - since > 30_000) return false;
    const last = lastSyncTime(state);
    return last === null || last < Math.floor(since / 1000) * 1000 + 1000;
  }

  // Check often while a save is on its way up, otherwise every few seconds.
  $effect(() => {
    if (!openedSpace?.folder) return;
    const timer = setInterval(() => void refreshSpaceState(), syncPendingSince !== null ? 1500 : 7000);
    return () => clearInterval(timer);
  });

  /** What the open folder is, for the icon by its name: known once mtsync answers, remembered from last time until then. */
  const rootKind = $derived.by(() => {
    if (openedSpace) return 'space' as const;
    const known = root ? recentFolders.find(e => sameFolder(e.path, root!))?.kind : undefined;
    return known === 'space' ? 'space' as const : 'folder' as const;
  });

  const conflictCount = $derived(openedSpace ? folderFiles.filter(f => conflictOriginal(basename(f)) !== null).length : 0);

  const syncStatus = $derived.by(() => {
    if (!openedSpace) return null;
    const syncing = syncPendingSince !== null && syncStillPending(openedSpace.state, syncPendingSince);
    const { label, tone } = syncing ? { label: 'Syncing…', tone: 'busy' as const } : describeState(openedSpace.state);
    const parts = [label];
    if (conflictCount) parts.push(`${conflictCount} conflict${conflictCount === 1 ? '' : 's'}`);
    if (currentRelative !== null && docBytes > SPACE_FILE_LIMIT * 0.85) parts.push(`${Math.ceil(docBytes / 1024)} of 64 KB`);
    return {
      label: parts.join(' · '),
      tone: conflictCount || docBytes > SPACE_FILE_LIMIT ? ('warn' as const) : tone,
      title: `${openedSpace.space}${openedSpace.access === 'read only' ? ' (read only)' : ''}: ${openedSpace.state}`,
    };
  });

  /** The status chip: starts the service, signs in again, or shows the sync log. */
  async function onSyncClick() {
    if (!openedSpace) return;
    const state = openedSpace.state;
    try {
      if (state.startsWith('service not running')) {
        await mtsync.start();
        await refreshSpaceState();
      } else if (isSignedOut(state)) {
        spaceDialog = true;
      } else {
        const log = await mtsync.log(30);
        await message(`${openedSpace.space}: ${state}\n\n${log.trim().split('\n').slice(-30).join('\n') || 'The sync log is empty.'}`, { title: 'Metatrash Sync', kind: 'info' });
      }
    } catch (error) {
      await showError(error);
    }
  }

  /** Open Space… found or set up the space's folder: open it, then the note from the address. */
  async function onSpaceOpened(dir: string, ref: SpaceRef) {
    spaceDialog = false;
    await openFolder(dir);
    if (root !== dir) return;
    const wanted = ref.path.replace(/\/+$/, '');
    if (ref.path.endsWith('/') && wanted) { revealFolder = wanted; return; }
    // The first download can take a while; open the note as soon as it appears.
    const target = wanted || 'README.md';
    const deadline = Date.now() + (wanted ? 5 * 60_000 : 60_000);
    while (root === dir && Date.now() < deadline) {
      if (folderFiles.includes(target)) {
        if (!path && !dirty) await openFromFolder(target);
        else if (wanted) await openFromFolder(target);
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
      await refreshFolder();
    }
  }

  function toggleOutline() {
    toggleSection('outline');
  }

  function setZoom(next: number) {
    zoom = Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next)) * 10) / 10;
    setZoomPref(zoom);
    void getCurrentWebview().setZoom(zoom);
  }

  async function print() {
    if (!editor) return;
    const previous = editor.getWorkspaceMode();
    if (previous !== 'preview') {
      await editor.setWorkspaceMode('preview');
      window.addEventListener('afterprint', () => {
        if (!readOnly) void editor?.setWorkspaceMode(previous);
      }, { once: true });
    }
    window.print();
  }

  const isWindows = /Windows/i.test(navigator.userAgent);

  /** Windows doesn't let apps make themselves the default, so this opens Settings at Slate Viewer's page. */
  async function openDefaultApps() {
    await invoke('open_default_apps_settings').catch(showError);
  }

  async function showAbout() {
    const version = await getVersion().catch(() => '?');
    await message(`Slate Viewer ${version}\nSlate editor ${editor?.version ?? '?'}`, { title: 'About Slate Viewer', kind: 'info' });
  }

  // ---- Menu -------------------------------------------------------------------

  const separator = { separator: true } as const;

  // Drawn by TitleBar on Windows and Linux; the native menu on macOS.
  const menu = $derived.by((): MenuItem[] => [
      {
        text: '&File',
        items: [
          { text: '&New Window', keys: 'Ctrl+N', action: () => void newWindow() },
          { text: '&Open…', keys: 'Ctrl+O', action: () => void once('open', chooseAndOpen) },
          { text: 'Open &Folder…', keys: 'Ctrl+Alt+O', action: () => void once('open', chooseFolder) },
          { text: 'Open Metatrash S&pace…', keys: 'Ctrl+Alt+M', action: () => { spaceDialog = true; } },
          {
            text: 'Open &Recent',
            enabled: recent.length + recentFolders.length > 0,
            items: [
              ...byDate(recent, recentFolders).map(entry => ({
                text: entry.path.replace(/&/g, '&&'),
                icon: entry.kind,
                action: () => void (entry.kind === 'file' ? openDocument(entry.path) : openFolder(entry.path)),
              })),
              separator,
              {
                text: '&Clear Recent',
                action: () => { recentFileList.clear(); recentFolderList.clear(); recent = []; recentFolders = []; },
              },
            ],
          },
          { text: 'Close Fol&der', enabled: root !== null, action: closeFolder },
          separator,
          { text: '&Save', keys: 'Ctrl+S', action: () => void once('save', save) },
          { text: 'Save &As…', keys: 'Ctrl+Shift+S', action: () => void once('save', saveAs) },
          separator,
          { text: '&Print…', keys: 'Ctrl+P', action: () => void once('print', print) },
          separator,
          ...(isWindows ? [{ text: 'Make Slate Viewer the &Default for .md Files…', action: () => void openDefaultApps() }, separator] : []),
          { text: '&Close Window', keys: 'Ctrl+W', action: () => void appWindow.close() },
        ],
      },
      {
        text: '&View',
        items: [
          { text: '&Edit', keys: 'Ctrl+1', enabled: !readOnly, action: () => void setMode('edit') },
          { text: '&Preview', keys: 'Ctrl+2', action: () => void setMode('preview') },
          { text: '&Source', keys: 'Ctrl+3', enabled: !readOnly, action: () => void setMode('source') },
          separator,
          { text: 'Read Only (&Checklist Mode)', keys: 'Ctrl+Shift+R', checked: readOnly, action: () => void toggleReadOnly() },
          { text: '&Files', keys: 'Ctrl+Shift+E', checked: sections.files, action: () => toggleSection('files') },
          { text: 'Searc&h', checked: sections.search, action: () => toggleSection('search') },
          { text: 'Document &Navigation', keys: 'Ctrl+Shift+O', checked: sections.outline, action: toggleOutline },
          { text: 'Version Histor&y', keys: 'Ctrl+Shift+H', checked: sections.history, action: () => toggleSection('history') },
          { text: 'Sidebar &Labels', checked: activityLabels, action: toggleActivityLabels },
          separator,
          {
            text: '&Theme',
            items: [
              { text: 'Match &System', checked: theme === 'system', action: () => chooseTheme('system') },
              { text: '&Light', checked: theme === 'light', action: () => chooseTheme('light') },
              { text: '&Dark', checked: theme === 'dark', action: () => chooseTheme('dark') },
            ],
          },
          separator,
          { text: 'Zoom &In', keys: 'Ctrl+=', action: () => setZoom(zoom + 0.1) },
          { text: 'Zoom O&ut', keys: 'Ctrl+-', action: () => setZoom(zoom - 0.1) },
          { text: '&Actual Size', keys: 'Ctrl+0', action: () => setZoom(1) },
        ],
      },
      {
        text: '&Go',
        items: [
          { text: 'F&ind in Document…', keys: 'Ctrl+F', action: () => void findBar?.open() },
          { text: 'Go to &File…', keys: 'Ctrl+T', enabled: root !== null, action: () => { quickOpen = true; } },
          { text: 'Find in F&older…', keys: 'Ctrl+Shift+F', action: () => void showSearch() },
          separator,
          { text: '&Back', keys: 'Alt+Left', enabled: history.length > 0, action: () => void once('nav', goBack) },
          { text: 'For&ward', keys: 'Alt+Right', enabled: forward.length > 0, action: () => void once('nav', goForward) },
        ],
      },
      {
        text: '&Help',
        items: [
          { text: 'Check for &Updates…', action: () => void invoke('check_for_updates').catch(console.error) },
          { separator: true },
          { text: '&About Slate Viewer', action: () => void showAbout() },
        ],
      },
  ]);

  $effect(() => {
    if (!customTitleBar) void setNativeMenu(menu, appWindow).catch(console.error);
  });

  function newWindow() {
    return once('new-window', () => openWindow(null));
  }

  // ---- Slate hooks ----------------------------------------------------------

  function resolveUrl(url: string, { kind }: { kind: 'image' | 'link' }) {
    if (kind !== 'image') return null;
    const local = toLocalPath(url, folder());
    return local ? convertFileSrc(local) : null;
  }

  async function handleAttachments(files: File[]): Promise<SlateUploadedAttachment[] | null> {
    if (!path) {
      await message('Save this document first, so attachments can be stored next to it.', { title: 'Slate Viewer', kind: 'info' });
      return null;
    }
    const results: SlateUploadedAttachment[] = [];
    for (const file of files) {
      const fileName = /^image\.(png|jpe?g|gif|webp)$/i.test(file.name) || !file.name
        ? `pasted-${new Date().toISOString().replace(/[:.]/g, '-')}.${file.type.split('/')[1] || 'png'}`
        : file.name;
      const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
      const relative = await invoke<string>('save_attachment', {
        documentPath: path, folder: ATTACHMENT_FOLDER, name: fileName, bytes,
      });
      results.push({ file, url: encodeURI(relative), label: fileName.replace(/\.[^.]+$/, '') });
    }
    return results;
  }

  /** Links never navigate the webview: web links go to the browser, .md links open here. */
  async function followLink(url: string, newWindow: boolean) {
    if (/^(https?|mailto):/i.test(url)) {
      await openUrl(url);
      return;
    }
    const local = toLocalPath(url, folder());
    if (!local) return;
    if (MARKDOWN_EXTENSIONS.includes(extname(local))) {
      if (newWindow) await openWindow(local);
      else await openDocument(local);
      return;
    }
    try {
      await openPath(local);
    } catch {
      // Not a file type we hand to other apps (or it is missing): show it in Explorer instead.
      await revealItemInDir(local).catch(showError);
    }
  }

  type ClickedLink = { url: string; wiki?: undefined } | { url?: undefined; wiki: string };

  function linkFromEvent(event: MouseEvent): ClickedLink | null {
    const anchor = (event.target as Element | null)?.closest?.('a, .wiki-link');
    if (!(anchor instanceof HTMLElement) || !host.contains(anchor)) return null;
    if (anchor.classList.contains('wiki-link')) {
      const wiki = anchor.dataset.noteName || anchor.textContent || '';
      return wiki ? { wiki } : null;
    }
    if (anchor.dataset.attachmentId) return null;
    const url = anchor.dataset.mdUrl ?? anchor.getAttribute('href') ?? '';
    if (!url || url.startsWith('#')) return null;
    return { url };
  }

  function follow(link: ClickedLink, newWindow: boolean) {
    return link.wiki !== undefined ? followWikiLink(link.wiki, newWindow) : followLink(link.url, newWindow);
  }

  function onHostClick(event: MouseEvent) {
    const link = linkFromEvent(event);
    if (!link || !editor) return;
    const modifier = event.ctrlKey || event.metaKey;
    // In Edit and Source a plain click places the caret, as in Slate itself; Ctrl+click follows.
    if (editor.getWorkspaceMode() !== 'preview' && !modifier) return;
    event.preventDefault();
    event.stopPropagation();
    void follow(link, modifier || event.shiftKey);
  }

  function onHostAuxClick(event: MouseEvent) {
    const link = linkFromEvent(event);
    if (!link || event.button !== 1) return;
    event.preventDefault();
    void follow(link, true);
  }

  let findRefreshTimer: ReturnType<typeof setTimeout> | undefined;
  function scheduleFindRefresh() {
    clearTimeout(findRefreshTimer);
    findRefreshTimer = setTimeout(() => findBar?.refresh(), 120);
  }

  /** The mouse's own back and forward buttons. */
  function onMouseUp(event: MouseEvent) {
    if (event.button !== 3 && event.button !== 4) return;
    event.preventDefault();
    void once('nav', event.button === 3 ? goBack : goForward);
  }

  // ---- Keyboard ---------------------------------------------------------------

  function onKeydown(event: KeyboardEvent) {
    if (event.altKey && !event.ctrlKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault();
      void once('nav', event.key === 'ArrowLeft' ? goBack : goForward);
      return;
    }
    // Alt+F, Alt+V… open the title bar's menus.
    if (event.altKey && !event.ctrlKey && !event.metaKey && event.key.length === 1 && titleBar?.openMenuByKey(event.key)) {
      event.preventDefault();
      return;
    }
    if (event.key === 'F3') {
      event.preventDefault();
      if (!findBar?.isOpen()) void findBar?.open();
      else if (event.shiftKey) findBar.previous();
      else findBar.next();
      return;
    }
    const key = event.key.toLowerCase();
    const shift = event.shiftKey;
    const handle = (action: () => unknown) => { event.preventDefault(); void action(); };
    if ((event.ctrlKey || event.metaKey) && event.altKey && event.code === 'KeyO') {
      handle(() => once('open', chooseFolder));
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.altKey && event.code === 'KeyM') {
      handle(() => { spaceDialog = true; });
      return;
    }
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;

    if (root && key === 't' && !shift) { handle(() => { quickOpen = true; }); return; }
    if (key === 'f' && shift) { handle(showSearch); return; }
    // Our own find bar searches the document only (the webview's built-in one searches the whole window).
    if (key === 'f' && !shift) { handle(() => findBar?.open()); return; }
    if (key === 'e' && shift) { handle(() => toggleSection('files')); return; }
    if (key === 'h' && shift) { handle(() => toggleSection('history')); return; }
    // Inside the editor Slate handles Ctrl+Shift+O itself and tells us with slate:outline-toggle.
    if (key === 'o' && shift && !event.defaultPrevented) { handle(toggleOutline); return; }

    if (key === 'o' && !shift) handle(() => once('open', chooseAndOpen));
    else if (key === 'n' && !shift) handle(newWindow);
    else if (key === 'w' && !shift) handle(() => appWindow.close());
    else if (key === 'p' && !shift) handle(() => once('print', print));
    // Inside the editor Slate handles Ctrl+S and sends slate:save-request instead.
    else if (key === 's' && !event.defaultPrevented) handle(() => once('save', shift ? saveAs : save));
    else if (key === 'r' && shift) handle(toggleReadOnly);
    else if (event.code === 'Digit1' && !shift) handle(() => setMode('edit'));
    else if (event.code === 'Digit2' && !shift) handle(() => setMode('preview'));
    else if (event.code === 'Digit3' && !shift) handle(() => setMode('source'));
    else if (key === '=' || key === '+') handle(() => setZoom(zoom + 0.1));
    else if (key === '-' || key === '_') handle(() => setZoom(zoom - 0.1));
    else if (key === '0' && !shift) handle(() => setZoom(1));
  }

  onMount(() => {
    const cleanups: Array<() => void> = [];
    let disposed = false;

    host.addEventListener('click', onHostClick, true);
    void markRecentSpaces();
    host.addEventListener('auxclick', onHostAuxClick, true);
    host.addEventListener('slate:change', () => {
      if (editor) dirty = missingOnDisk || editor.getMarkdown() !== baseline;
      if (editor && openedSpace) docBytes = new TextEncoder().encode(editor.getMarkdown()).length;
      scheduleFindRefresh();
    });
    host.addEventListener('slate:outline', event => {
      outline = (event as CustomEvent<SlateOutline>).detail;
      trackActiveHeading();
      scheduleFindRefresh(); // sent after every render, so the document's text nodes are new
    });
    host.addEventListener('slate:compare-end', event => {
      void onCompareEnd((event as CustomEvent<SlateCompareEndDetail>).detail);
    });
    host.addEventListener('slate:outline-toggle', event => {
      setSection('outline', (event as CustomEvent<{ open: boolean }>).detail.open);
    });
    host.addEventListener('scroll', trackActiveHeading, true);
    for (const type of ['wheel', 'keydown', 'pointerdown']) host.addEventListener(type, unpinHeading, true);
    host.addEventListener('slate:save-request', event => {
      const wantsSaveAs = (event as CustomEvent<{ saveAs: boolean }>).detail.saveAs;
      void once('save', wantsSaveAs ? saveAs : save);
    });
    const onSystemTheme = () => { if (theme === 'system') applyTheme(); };
    systemDark.addEventListener('change', onSystemTheme);
    cleanups.push(() => systemDark.removeEventListener('change', onSystemTheme));

    (async () => {
      editor = await window.SlateMarkdownEditor.mount(host, {
        markdown: '',
        persist: false,
        persistSettings: true,
        showReadyToast: false,
        attachmentHandler: handleAttachments,
        resolveUrl,
        outlinePanel: false,
        outlineOpen: sections.outline,
      });
      outline = editor.getOutline();
      applyTheme();
      showWindow();
      if (zoom !== 1) void getCurrentWebview().setZoom(zoom);
      baseline = editor.getMarkdown();
      const initialFolder = window.__SLATE_VIEWER_INITIAL_FOLDER__;
      if (initialFolder) await openFolder(initialFolder, { showFiles: !launched });
      const initial = window.__SLATE_VIEWER_INITIAL_FILE__;
      if (initial) await loadHere(initial);
      if (launched && (initial || initialFolder)) await applyLaunchLayout(initialFolder);

      cleanups.push(await getCurrentWebviewWindow().listen('document-changed', onDiskChange));
      cleanups.push(await getCurrentWebviewWindow().listen('folder-changed', onFolderChange));
      cleanups.push(await appWindow.onCloseRequested(async event => {
        if (!dirty) return;
        event.preventDefault();
        if (await confirmDiscard()) await appWindow.destroy();
      }));
      if (disposed) cleanups.forEach(fn => fn());
    })().catch(error => {
      showWindow();
      showError(error);
    });
    // In case Slate never finishes mounting, don't leave an invisible window behind.
    const showTimer = setTimeout(showWindow, 3000);
    cleanups.push(() => clearTimeout(showTimer));

    return () => {
      disposed = true;
      cleanups.forEach(fn => fn());
    };
  });
</script>

<svelte:window onkeydown={onKeydown} onmouseup={onMouseUp} />

<div class="shell">
<TitleBar
  bind:this={titleBar}
  {menu}
  title={name}
  detail={root ? basename(root) : path ? basename(dirname(path)) : undefined}
  {dirty}
  backTo={history.length ? basename(history[history.length - 1]) : null}
  forwardTo={forward.length ? basename(forward[forward.length - 1]) : null}
  onBack={() => void once('nav', goBack)}
  onForward={() => void once('nav', goForward)}
  onFind={() => void findBar?.open()}
  sync={syncStatus}
  onSync={() => void onSyncClick()}
/>
<div class="layout">
  <ActivityBar {sections} expanded={activityLabels} onToggle={toggleSection} onToggleExpanded={toggleActivityLabels} />
  {#if openSections.length}
    <div class="side" style:width="{sidebarWidth}px">
      <SidePanel
        open={openSections}
        weights={sectionWeights}
        onWeightsChange={weights => { sectionWeights = weights; setSectionWeightsPref(weights); }}
      >
        {#snippet section(id: SectionId)}
          {#if id === 'files'}
            <FilesSection
              {root}
              files={folderFiles}
              truncated={folderTruncated}
              current={currentRelative}
              {recentFolders}
              {rootKind}
              onOpen={(relative, options) => void openFromFolder(relative, options)}
              onCreate={createNoteFromSidebar}
              onCloseFolder={closeFolder}
              onChooseFolder={() => void once('open', chooseFolder)}
              onOpenFolder={dir => void openFolder(dir)}
              {descriptions}
              reveal={revealFolder}
              onOpenSpace={() => (spaceDialog = true)}
            />
          {:else if id === 'search'}
            <SearchSection
              bind:this={searchSection}
              bind:query={searchQuery}
              {root}
              onOpen={(relative, options) => void openFromFolder(relative, options)}
              onSearch={searchFolder}
            />
          {:else if id === 'history'}
            <HistoryPanel
              file={historyFile}
              stamp={historyStamp}
              comparing={historyRevision}
              onCompare={entry => void compareWithRevision(entry)}
            />
          {:else}
            <OutlineSection {outline} active={activeHeading} onReveal={revealHeading} />
          {/if}
        {/snippet}
      </SidePanel>
    </div>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="resizer" onpointerdown={startResize}></div>
  {/if}
  <div class="editor">
    <div class="host" bind:this={host}></div>
    <FindBar bind:this={findBar} getHost={() => host} getEditor={() => editor} inEditor={() => editor?.getWorkspaceMode() !== 'preview'} />
  </div>
</div>
</div>

{#if spaceDialog}
  <OpenSpace onOpened={(folder, ref) => void onSpaceOpened(folder, ref)} onClose={() => (spaceDialog = false)} />
{/if}

{#if quickOpen && root}
  <QuickOpen
    files={folderFiles}
    onClose={() => (quickOpen = false)}
    onPick={(relative, newWindow) => { quickOpen = false; void openFromFolder(relative, { newWindow }); }}
  />
{/if}

<style>
  .shell { display: flex; flex-direction: column; height: 100%; }
  .layout { flex: 1; min-height: 0; display: flex; }
  .side { flex: none; height: 100%; border-right: 1px solid var(--side-border); }
  .resizer { flex: none; width: 5px; margin-left: -3px; cursor: col-resize; z-index: 1; }
  .resizer:hover { background: var(--side-accent-soft); }
  .editor { position: relative; flex: 1; min-width: 0; height: 100%; }
  .host { height: 100%; }
</style>
