<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { invoke, convertFileSrc } from '@tauri-apps/api/core';
  import { getVersion } from '@tauri-apps/api/app';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { getCurrentWebview } from '@tauri-apps/api/webview';
  import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
  import { open as openDialog, save as saveDialog, message } from '@tauri-apps/plugin-dialog';
  import { openUrl, openPath, revealItemInDir } from '@tauri-apps/plugin-opener';
  import type { SlateChangesEndDetail, SlateCompareEndDetail, SlateEditorApi, SlateFillEndDetail, SlateForm, SlateFormAnswers, SlateFormSubmitDetail, SlateModeChangeDetail, SlateOutline, SlateOutlineHeading, SlateUploadedAttachment, SlateWorkspaceMode } from '../public/slate/slate-editor';
  import { basename, dirname, extname, joinPath, toLocalPath } from './lib/paths';
  import { detectFormat, toFileText, NEW_FILE_FORMAT, type FileFormat } from './lib/document';
  import { recentFileList, recentFolderList, byDate, type RecentEntry } from './lib/recent';
  import {
    themePref, setThemePref, zoomPref, setZoomPref, ZOOM_MIN, ZOOM_MAX, sidebarWidthPref, setSidebarWidthPref,
    sectionsPref, setSectionsPref, sectionWeightsPref, setSectionWeightsPref, activityLabelsPref, setActivityLabelsPref,
    outlinePinnedPref, setOutlinePinnedPref, pinnedOutlineWidthPref, setPinnedOutlineWidthPref, showHiddenPref, setShowHiddenPref,
    SECTION_IDS, type ThemePref, type SectionId,
  } from './lib/prefs';
  import { resolveWikiLink, noteFileName } from './lib/wiki';
  import { firstNote, isHiddenFile, isSpaceFolderFile, type SearchMatch } from './lib/types';
  import ActivityBar from './lib/ActivityBar.svelte';
  import SidePanel from './lib/SidePanel.svelte';
  import FilesSection from './lib/FilesSection.svelte';
  import SearchSection from './lib/SearchSection.svelte';
  import OutlineSection from './lib/OutlineSection.svelte';
  import TitleBar from './lib/TitleBar.svelte';
  import { customTitleBar, setNativeMenu, type MenuEntry, type MenuItem } from './lib/menu';
  import ContextMenu from './lib/ContextMenu.svelte';
  import FindBar from './lib/FindBar.svelte';
  import OpenSpace from './lib/OpenSpace.svelte';
  import UpdateDialog, { type UpdateCheck } from './lib/UpdateDialog.svelte';
  import FolderProperties from './lib/FolderProperties.svelte';
  import {
    mtsync, sameFolder, describeState, lastSyncTime, spacePathProblem, spaceSafeName, conflictOriginal, isSignedOut, SPACE_FILE_LIMIT,
    DEFAULT_SERVER, fileLock, type SpaceRef, type FolderDescription } from './lib/space';
  import QuickOpen from './lib/QuickOpen.svelte';
  import HistoryPanel from './lib/HistoryPanel.svelte';
  import { entryLabel, fileHistory, findPublishedEntry, formatWhen, revisionText, versionLabel, type HistoryEntry } from './lib/history';
  import { lastSession, saveSession, placeView, savePlaceView, type PlaceView } from './lib/session';
  import PolicyBanner from './lib/PolicyBanner.svelte';
  import { acknowledge, fetchPolicies, outstandingFiles, policyFor, quizFor, quizzesCovering, setAttentionBadge, type Policies } from './lib/policies';
  import FormBanner from './lib/FormBanner.svelte';
  import SubmissionsDialog from './lib/SubmissionsDialog.svelte';
  import {
    answerKeyName, answerKeyText, clearDraft, fetchReceipt, fetchReceipts, loadDraft, parseFiledCopy, reviewCopy, saveDraft, submitForm,
    type FiledCopy, type FormDraft, type Receipt, type Review } from './lib/forms';
  import ReviewBanner from './lib/ReviewBanner.svelte';
  import { SETTINGS_FILE, effectiveSettings, folderChain, frozenKeys, printImage, publishText, toSavedVersion } from './lib/folderSettings';

  interface LoadedDocument { path: string; text: string; hasBom: boolean }
  interface FolderListing { files: string[]; emptyFolders: string[]; truncated: boolean }
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
  /** Folders with no files in them yet (relative), so they still show in Files. */
  let emptyFolders = $state<string[]>([]);
  let folderTruncated = $state(false);
  let searchQuery = $state('');

  // Metatrash spaces (through mtsync)
  let openedSpace = $state<OpenedSpace | null>(null);
  /** When this window last saved into the space: the status shows Syncing… until mtsync finishes a pass after it. */
  let syncPendingSince = $state<number | null>(null);
  let spaceDialog = $state(false);
  /** The update dialog: `initial` is what the timer's check found, null while Help's check runs. */
  let updateDialog = $state<{ initial: UpdateCheck | null } | null>(null);
  let descriptions = $state<FolderDescription[]>([]);
  /** The folder whose Properties are open (relative, "" for the top of the space), or null. */
  let propertiesFor = $state<string | null>(null);
  let revealFolder = $state<string | null>(null);
  let docBytes = $state(0);
  /** The file's text as it was on disk when loaded or last saved, to notice changes made elsewhere. */
  let diskText: string | null = null;
  let quickOpen = $state(false);

  // Opened from Explorer (a file or folder on the command line). A file opens read only.
  const launched = window.__SLATE_VIEWER_LAUNCHED__ === true;
  // The first window of a launch with nothing on the command line picks up where the last session left off.
  const resumeSession = window.__SLATE_VIEWER_RESUME__ === true;

  // Sidebar: an icon bar whose buttons switch sections on and off; the ones on stack in the panel.
  // Which are on (like the labels and the pinned Document Nav) is one setting for every window.
  let sections = $state(sectionsPref());
  let sectionWeights = $state(sectionWeightsPref());
  let activityLabels = $state(activityLabelsPref());
  let sidebarWidth = $state(sidebarWidthPref());
  let searchSection = $state<ReturnType<typeof SearchSection>>();
  let outline = $state<SlateOutline | null>(null);
  let activeHeading = $state<string | null>(null);
  // Document Nav can be pinned in its own column left of the document; sections.outline then
  // says whether that column is expanded or folded to a strip.
  let outlinePinned = $state(outlinePinnedPref());
  let pinnedOutlineWidth = $state(pinnedOutlineWidthPref());
  const openSections = $derived(SECTION_IDS.filter(id => sections[id] && !(id === 'outline' && outlinePinned)));
  let theme = $state<ThemePref>(themePref());
  let showHidden = $state(showHiddenPref());
  let readOnly = $state(false);
  let zoom = $state(zoomPref());

  const name = $derived(path ? basename(path) : 'Untitled');
  const folder = () => (path ? dirname(path) : null);

  /** `file` relative to the folder `dir` (with /), or null when it is outside it. */
  function relativeIn(dir: string, file: string): string | null {
    const base = dir.replace(/[\\/]+$/, '').replace(/\\/g, '/').toLowerCase() + '/';
    const doc = file.replace(/\\/g, '/');
    return doc.toLowerCase().startsWith(base) ? doc.slice(base.length) : null;
  }

  /** The open document relative to the folder root, or null when it is outside it. */
  const currentRelative = $derived(root && path ? relativeIn(root, path) : null);

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

  /** Adds a line to the fault log (Help > Open Log Folder). */
  function logFault(kind: string, text: string) {
    invoke('log_fault', { kind, message: text }).catch(() => {});
  }

  async function showError(error: unknown) {
    logFault('error', String(error));
    await message(String(error), { title: 'Slate Viewer', kind: 'error' });
  }

  // ---- Loading and saving -------------------------------------------------

  function watch(target: string | null) {
    invoke('watch_document', { path: target }).catch(console.error);
  }

  function setDocument(doc: LoadedDocument) {
    // The changes shown were for the text being replaced.
    if (editor?.isShowingChanges()) editor.hideChanges();
    // Another file: stop filling in the form (its answers stay as a draft). The same file
    // reloaded keeps the answers on screen.
    if (editor?.isFilling() && doc.path !== path) editor.endFill();
    if (doc.path !== path) sentForm = null;
    publishedView = null;
    path = doc.path;
    format = detectFormat(doc.text, doc.hasBom);
    diskText = doc.text;
    missingOnDisk = false;
    headingPinned = false;
    watch(doc.path);
  }

  /** Loads a file into this window, replacing the current (clean) document. `quiet` skips the error message. */
  async function loadHere(target: string, { pushHistory = true, quiet = false } = {}) {
    if (!editor) return;
    try {
      const doc = await invoke<LoadedDocument>('read_document', { path: target });
      rememberPlace();
      if (pushHistory && path) { history = [...history, path]; forward = []; }
      setDocument(doc);
      await editor.setMarkdown(doc.text);
      baseline = editor.getMarkdown();
      dirty = false;
      checkForm();
      recentFileList.remember(doc.path);
      recent = recentFileList.list();
      rememberSession();
      void offerConflictResolve();
      void syncPublishedView();
    } catch (error) {
      recentFileList.forget(target);
      recent = recentFileList.list();
      if (!quiet) await showError(error);
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
    rememberSession();
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

  /**
   * Shows a dialog, ignoring repeats while one is open. Only the dialog is guarded, not the work
   * after it, so a slow open can never leave Open and Open Folder doing nothing.
   */
  async function pick<T>(show: () => Promise<T>): Promise<T | null> {
    let picked: T | null = null;
    await once('dialog', async () => { picked = await show(); });
    return picked;
  }

  async function chooseAndOpen() {
    const picked = await pick(() => openDialog({ multiple: true, directory: false, filters: MARKDOWN_FILTERS }));
    const files = Array.isArray(picked) ? picked : picked ? [picked] : [];
    for (const [i, file] of files.entries()) {
      if (i === 0) await openDocument(file);
      else await openWindow(file);
    }
  }

  // ---- Where the user left off ----------------------------------------------------

  /** True while a saved place is being put back, so the half-restored state isn't saved over it. */
  let restoring = false;
  let placeTimer: ReturnType<typeof setTimeout> | undefined;

  /** Saves how the open folder (or, without one, the open file) is left: its file, mode, scroll and cursor. */
  function rememberPlace() {
    clearTimeout(placeTimer);
    const key = root ?? path;
    if (!editor || restoring || !key) return;
    savePlaceView(key, { file: path, mode: editor.getWorkspaceMode(), topLine: editor.getTopLine(), selection: editor.getSourceSelection() });
  }

  function schedulePlaceSave() {
    if (restoring) return;
    clearTimeout(placeTimer);
    placeTimer = setTimeout(rememberPlace, 500);
  }

  /** Records this window's folder and file as the session the next plain launch resumes. */
  function rememberSession() {
    if (!restoring) saveSession({ folder: root, file: path });
  }

  /** Runs `action` without saving the place it passes through on the way. */
  async function whileRestoring(action: () => Promise<unknown>) {
    restoring = true;
    try {
      await action();
    } finally {
      restoring = false;
      clearTimeout(placeTimer);
    }
  }

  /** Puts a saved mode, scroll position and cursor back on the open document. */
  async function restoreView(view: PlaceView) {
    if (!editor) return;
    if (view.mode !== editor.getWorkspaceMode()) await setMode(view.mode);
    await tick();
    editor.restoreView({ selection: view.selection, topLine: view.topLine, focus: editor.getWorkspaceMode() !== 'preview' });
  }

  /**
   * Picks up where the folder was left: its file, mode, scroll and cursor. The first time (or when
   * that file is gone) it opens the README, or the folder's only note, and shows Preview.
   */
  async function enterFolder(dir: string) {
    if (!editor) return;
    const saved = placeView(dir);
    const inFolder = (file: string | null | undefined) => {
      const rel = file ? relativeIn(dir, file) : null;
      return rel !== null ? folderFiles.find(f => f.toLowerCase() === rel.toLowerCase()) ?? null : null;
    };
    const savedFile = inFolder(saved?.file);
    const notes = folderFiles.filter(f => !isHiddenFile(f));
    const target = savedFile ?? notes.find(f => f.toLowerCase() === 'readme.md') ?? (notes.length === 1 ? notes[0] : null);
    await whileRestoring(async () => {
      if (target && !(path && sameFolder(path, joinPath(dir, target)))) {
        if (!(await confirmDiscard())) return;
        await loadHere(joinPath(dir, target));
      }
      if (saved && savedFile && path && sameFolder(path, joinPath(dir, savedFile))) await restoreView(saved);
      else await setMode(saved?.mode ?? 'preview');
    });
  }

  /** A plain launch: reopens the last session's folder (where it was left) or file. */
  async function resumeLastSession() {
    const session = lastSession();
    if (session?.folder) {
      await openFolder(session.folder, { showFiles: false, quiet: true });
    } else if (session?.file) {
      const file = session.file;
      await whileRestoring(async () => {
        await loadHere(file, { pushHistory: false, quiet: true });
        const view = path ? placeView(path) : null;
        if (view) await restoreView(view);
      });
    }
  }

  // ---- Folder mode ------------------------------------------------------------

  /**
   * Shows `dir` in the sidebar. With `restore` it then picks up where the folder was left
   * (see enterFolder); `quiet` skips the message when it can't be opened.
   */
  async function openFolder(dir: string, { showFiles = true, restore = true, quiet = false } = {}) {
    // A later Open Folder (or Close Folder) wins over one still listing.
    const request = ++folderRequest;
    const started = performance.now();
    let listing: FolderListing;
    try {
      listing = await invoke<FolderListing>('list_folder', { root: dir, hidden: showHidden });
    } catch (error) {
      if (request !== folderRequest) return;
      recentFolderList.forget(dir);
      recentFolders = recentFolderList.list();
      if (!quiet) await showError(error);
      return;
    }
    const seconds = (performance.now() - started) / 1000;
    if (seconds > 3) logFault('slow', `Listing ${dir} took ${seconds.toFixed(1)} s (${listing.files.length} files${listing.truncated ? ', stopped early' : ''}).`);
    if (request !== folderRequest) return;
    const reopened = root !== null && sameFolder(root, dir);
    if (!reopened) rememberPlace();
    root = dir;
    folderFiles = listing.files;
    emptyFolders = listing.emptyFolders;
    folderTruncated = listing.truncated;
    if (showFiles) setSection('files', true);
    recentFolderList.remember(dir);
    recentFolders = recentFolderList.list();
    invoke('watch_folder', { root: dir }).catch(console.error);
    void detectSpace(dir);
    if (restore && !reopened) await enterFolder(dir);
    rememberSession();
  }

  let folderRequest = 0;

  async function chooseFolder() {
    const picked = await pick(() => openDialog({ directory: true, multiple: false }));
    if (typeof picked === 'string') await openFolder(picked);
  }

  function closeFolder() {
    folderRequest += 1;
    rememberPlace();
    root = null;
    folderFiles = [];
    emptyFolders = [];
    openedSpace = null;
    descriptions = [];
    policies = null;
    propertiesFor = null;
    quickOpen = false;
    invoke('watch_folder', { root: null }).catch(console.error);
    rememberSession();
  }

  let folderRefreshTimer: ReturnType<typeof setTimeout> | undefined;
  function onFolderChange() {
    clearTimeout(folderRefreshTimer);
    folderRefreshTimer = setTimeout(() => void refreshFolder(), 300);
  }

  /** One listing at a time: changes that arrive meanwhile are picked up by one more listing after it. */
  let refreshing: Promise<void> | null = null;
  let refreshAgain = false;

  function refreshFolder(): Promise<void> {
    if (refreshing) {
      refreshAgain = true;
      return refreshing;
    }
    refreshing = (async () => {
      do {
        refreshAgain = false;
        await listFolderAgain();
      } while (refreshAgain);
    })().finally(() => { refreshing = null; });
    return refreshing;
  }

  async function listFolderAgain() {
    if (!root) return;
    const listed = root;
    const request = folderRequest;
    try {
      const listing = await invoke<FolderListing>('list_folder', { root: listed, hidden: showHidden });
      if (listed !== root || request !== folderRequest) return;
      folderFiles = listing.files;
      emptyFolders = listing.emptyFolders;
      folderTruncated = listing.truncated;
      // Settings can change with any sync (or a save from Properties).
      if (openedSpace) { void loadDescriptions(); schedulePolicies(); }
      void offerConflictResolve();
    } catch {
      // The folder itself went away.
      if (listed === root && request === folderRequest) closeFolder();
    }
  }

  /** Opens a file from the sidebar or Go to File; `find` highlights a search term once loaded. */
  async function openFromFolder(relative: string, { newWindow = false, find, line }: { newWindow?: boolean; find?: string; line?: number } = {}) {
    if (!root) return;
    const target = joinPath(root, relative);
    // A hidden file that isn't text (an image, a PDF) opens in its own app, as a link to it does.
    if (!MARKDOWN_EXTENSIONS.includes(extname(target).toLowerCase()) && !(await invoke('read_document', { path: target }).then(() => true, () => false))) {
      await openPath(target).catch(() => revealItemInDir(target).catch(showError));
      return;
    }
    if (newWindow) { await openWindow(target); return; }
    if (target !== path) await openDocument(target);
    if (find && target === path) await findBar?.open(find, line ? line - 1 : undefined);
  }

  /** Where a new note goes by default: beside the open document, or at the top of the open folder. */
  function defaultNoteFolder(): string | null {
    return folder() && (currentRelative !== null || !root) ? folder() : root;
  }

  async function createNote(noteName: string, inFolder = defaultNoteFolder()): Promise<string | null> {
    if (!inFolder) {
      await message('Save this document first, so the new note has a folder to go in.', { title: 'Slate Viewer', kind: 'info' });
      return null;
    }
    // In a space, names can't have spaces or capitals beyond ASCII: "My Note" becomes my-note.md.
    const inSpace = spaceRelative(joinPath(inFolder, 'x.md')) !== null;
    if (inSpace && openedSpace?.access === 'read only') {
      await message(`${openedSpace.space} is a read-only space, so notes can't be added to it.`, { title: 'Slate Viewer', kind: 'info' });
      return null;
    }
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

  /** The Files section's name box: creates the note in `relativeFolder` ("" = the root) and opens it for editing. */
  async function createNoteFromSidebar(noteName: string, relativeFolder: string): Promise<boolean> {
    if (!root) return false;
    const created = await createNote(noteName, relativeFolder ? joinPath(root, relativeFolder) : root);
    if (created) await openNewNote(created);
    return created !== null;
  }

  /** Opens a note just created and puts the cursor at its end in Edit, ready to type. */
  async function openNewNote(created: string) {
    await openDocument(created);
    if (path !== created || !editor || readOnly) return;
    await setMode('edit');
    const end = editor.getMarkdown().length;
    editor.restoreView({ selection: [end, end], topLine: 0, focus: true });
  }

  let filesSection = $state<ReturnType<typeof FilesSection>>();

  /**
   * File > New File: in folder mode, asks for a name in the Files section (beside the open note,
   * or at the top of the folder with `inRoot`); otherwise asks where to save it.
   */
  async function newFile(inRoot = false) {
    if (root) {
      if (!canManageFiles) { await refuseReadOnly(); return; }
      setSection('files', true);
      await tick();
      await filesSection?.startCreate(inRoot ? '' : currentFolderRelative());
      return;
    }
    const docFolder = folder();
    const target = await pick(() => saveDialog({
      title: 'New File',
      defaultPath: docFolder ? joinPath(docFolder, 'Untitled.md') : 'Untitled.md',
      filters: MARKDOWN_FILTERS,
    }));
    if (!target) return;
    const noteName = basename(target).replace(/\.(md|markdown|mdown|mkd)$/i, '');
    const created = await createNote(noteName, dirname(target));
    if (created) await openNewNote(created);
  }

  /** File > New Folder: asks for a name in the Files section, beside the open note or at the top. */
  async function newFolder() {
    if (!root) return;
    if (!canManageFiles) { await refuseReadOnly(); return; }
    setSection('files', true);
    await tick();
    await filesSection?.startCreate(currentFolderRelative(), 'folder');
  }

  /** The open document's folder relative to the root, or "" (the root) when it is outside it. */
  function currentFolderRelative(): string {
    return currentRelative !== null ? currentRelative.slice(0, Math.max(0, currentRelative.lastIndexOf('/'))) : '';
  }

  // ---- Managing files (the Files section) ----------------------------------------

  /** Files can be added, renamed, moved and deleted anywhere but in a read-only space. */
  const canManageFiles = $derived(openedSpace?.access !== 'read only');
  /**
   * Files that stay where they are: every folder of a space keeps its AGENTS.md and .metatrash.json,
   * and files its settings lock for everyone (readOnly) can't change at all.
   */
  const lockedForEveryone = (relative: string) => openedSpace !== null && fileLock(descriptions, relative) === 'everyone';
  const lockedFiles = $derived(openedSpace ? folderFiles.filter(f => isSpaceFolderFile(f) || lockedForEveryone(f)) : []);
  const folderFileReason = 'every folder in a Metatrash space keeps its AGENTS.md and .metatrash.json (they can be rewritten, and go when the folder is deleted)';
  const everyoneReason = 'is read-only for everyone in this space: a readOnly entry in its folder\'s .metatrash.json locks it. Lift the lock there to change it';
  /** Why `relative` (a file, or a folder and everything in it) can't be renamed, moved or deleted, or null. */
  function lockedWhy(relative: string, isFolder: boolean): string | null {
    if (!openedSpace) return null;
    if (!isFolder) {
      if (lockedForEveryone(relative)) return `${relative} ${everyoneReason}.`;
      if (isSpaceFolderFile(relative)) return `${relative}: ${folderFileReason}.`;
      return null;
    }
    const inside = folderFiles.find(f => f.startsWith(relative + '/') && lockedForEveryone(f));
    return inside ? `${relative} holds ${inside}, which ${everyoneReason}.` : null;
  }
  const trashName = /Windows/i.test(navigator.userAgent) ? 'Recycle Bin' : 'Trash';

  async function refuseReadOnly() {
    await message(`${openedSpace?.space ?? 'This'} is a read-only space, so its files can't be changed here.`, { title: 'Slate Viewer', kind: 'info' });
  }

  /** The open folder is (inside) a Metatrash space, so names follow the space rules. */
  const rootInSpace = () => root !== null && spaceRelative(joinPath(root, 'x.md')) !== null;

  /** True when `file` is `target` or inside it (full paths, any slashes, any capitals). */
  function within(file: string, target: string): boolean {
    const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
    return norm(file) === norm(target) || norm(file).startsWith(norm(target) + '/');
  }

  /** Why `relative` (a file, or a folder's files once moved there) can't go in the space, or null. */
  function spaceProblem(relative: string, isFolder: boolean, from: string | null): string | null {
    if (!rootInSpace()) return null;
    const own = spacePathProblem(isFolder ? `${relative}/x.md` : relative);
    if (own || !isFolder || from === null) return own;
    const prefix = from.toLowerCase() + '/';
    for (const file of folderFiles) {
      if (!file.toLowerCase().startsWith(prefix)) continue;
      const problem = spacePathProblem(relative + file.slice(from.length));
      if (problem) return `${file}: ${problem}`;
    }
    return null;
  }

  /** Stops watching the open document while its folder is renamed or deleted (Windows refuses otherwise). */
  async function releaseDocument(target: string): Promise<boolean> {
    if (!path || !within(path, target)) return false;
    await invoke('watch_document', { path: null }).catch(() => {});
    return true;
  }

  /** Creates a folder from the Files section's name box; returns it (relative) or null. */
  async function createFolder(typed: string, relativeFolder: string): Promise<string | null> {
    if (!root) return null;
    if (!canManageFiles) { await refuseReadOnly(); return null; }
    const folderName = rootInSpace() ? spaceSafeName(typed) : typed.trim();
    const rel = relativeFolder ? `${relativeFolder}/${folderName}` : folderName;
    const problem = spaceProblem(rel, true, null);
    if (problem) {
      await message(`${problem}\n\nMetatrash wouldn't sync notes in it.`, { title: 'Slate Viewer', kind: 'warning' });
      return null;
    }
    try {
      await invoke<string>('create_folder', { parent: relativeFolder ? joinPath(root, relativeFolder) : root, name: folderName });
    } catch (error) {
      await showError(error);
      return null;
    }
    await refreshFolder();
    return rel;
  }

  /**
   * Renames a file or folder in place. A file keeps its extension unless the new name has one;
   * in a space the name is made space-safe, as for new notes. Returns the new relative path, or null.
   */
  async function renameEntry(relative: string, isFolder: boolean, typed: string): Promise<string | null> {
    let newName = typed.trim();
    if (!isFolder) {
      const hasExtension = /\.(md|markdown|mdown|mkd)$/i.test(newName);
      const stem = hasExtension ? newName.replace(/\.[^.]+$/, '') : newName;
      const extension = hasExtension ? newName.slice(stem.length) : (/\.[^./]+$/.exec(basename(relative))?.[0] ?? '.md');
      newName = (rootInSpace() ? spaceSafeName(stem) : stem.trim()) + extension;
    } else if (rootInSpace()) {
      newName = spaceSafeName(newName);
    }
    if (newName === basename(relative)) return relative;
    const parent = relative.slice(0, Math.max(0, relative.lastIndexOf('/')));
    return relocate(relative, isFolder, parent ? `${parent}/${newName}` : newName);
  }

  /** Drag and drop in Files: moves a file or folder into `toFolder` ("" for the root). */
  async function moveEntry(relative: string, isFolder: boolean, toFolder: string): Promise<string | null> {
    const name = basename(relative);
    return relocate(relative, isFolder, toFolder ? `${toFolder}/${name}` : name);
  }

  /**
   * Renames or moves `relative` to `target` (both relative to the root). The open document follows
   * along, unsaved changes and all; saving afterwards writes to its new place. mtsync sees a file
   * that moved with the same content as a move, so it keeps its history in the space.
   */
  async function relocate(relative: string, isFolder: boolean, target: string): Promise<string | null> {
    if (!root) return null;
    if (!canManageFiles) { await refuseReadOnly(); return null; }
    const lockedNote = lockedWhy(relative, isFolder);
    if (lockedNote) {
      await message(`Can't rename or move it. ${lockedNote}`, { title: 'Slate Viewer', kind: 'info' });
      return null;
    }
    const problem = spaceProblem(target, isFolder, relative);
    if (problem) {
      await message(`${problem}\n\nMetatrash wouldn't sync it there.`, { title: 'Slate Viewer', kind: 'warning' });
      return null;
    }
    const from = joinPath(root, relative);
    const to = joinPath(root, target);
    const released = await releaseDocument(from);
    try {
      await invoke('rename_path', { from, to });
    } catch (error) {
      if (released && path) watch(path);
      await showError(error);
      return null;
    }
    const moved = (file: string) => (within(file, from) ? to + file.slice(from.length) : file);
    history = history.map(moved);
    forward = forward.map(moved);
    for (const entry of recentFileList.list()) {
      if (within(entry.path, from)) { recentFileList.forget(entry.path); recentFileList.remember(moved(entry.path)); }
    }
    recent = recentFileList.list();
    if (released && path) {
      path = moved(path);
      watch(path);
      recentFileList.remember(path);
      recent = recentFileList.list();
      rememberSession();
      rememberPlace();
    }
    await refreshFolder();
    return target;
  }

  /** Copies a note beside itself ("plan copy.md", or "plan-copy.md" in a space). */
  async function duplicateEntry(relative: string) {
    if (!root) return;
    if (!canManageFiles) { await refuseReadOnly(); return; }
    try {
      await invoke<string>('duplicate_file', { path: joinPath(root, relative), spaceNames: rootInSpace() });
    } catch (error) {
      await showError(error);
      return;
    }
    await refreshFolder();
  }

  /** Deletes a file or folder (and everything in it) to the Recycle Bin, after asking. */
  async function deleteEntry(relative: string, isFolder: boolean) {
    if (!root) return;
    if (!canManageFiles) { await refuseReadOnly(); return; }
    const lockedNote = lockedWhy(relative, isFolder);
    if (lockedNote) {
      await message(`Can't delete it. ${lockedNote}`, { title: 'Slate Viewer', kind: 'info' });
      return;
    }
    const target = joinPath(root, relative);
    const notes = isFolder ? folderFiles.filter(f => f.toLowerCase().startsWith(relative.toLowerCase() + '/')).length : 0;
    const openInside = path !== null && within(path, target);
    const lines = [
      isFolder
        ? `Delete the folder ${basename(relative)} and everything in it${notes ? ` (${notes} note${notes === 1 ? '' : 's'})` : ''}?`
        : `Delete ${basename(relative)}?`,
      `It goes to the ${trashName}, so you can get it back from there.${rootInSpace() ? ' It is deleted from the space too.' : ''}`,
    ];
    if (openInside && dirty) lines.push(`${name} has unsaved changes, which will be lost.`);
    const choice = await message(lines.join('\n\n'), {
      title: 'Slate Viewer',
      kind: 'warning',
      buttons: { ok: 'Delete', cancel: 'Cancel' },
    });
    if (choice !== 'Delete') return;
    const released = await releaseDocument(target);
    try {
      await invoke('trash_path', { path: target });
    } catch (error) {
      if (released && path) watch(path);
      await showError(error);
      return;
    }
    history = history.filter(file => !within(file, target));
    forward = forward.filter(file => !within(file, target));
    for (const entry of recentFileList.list()) if (within(entry.path, target)) recentFileList.forget(entry.path);
    recent = recentFileList.list();
    if (released) await leaveDeletedDocument();
    await refreshFolder();
  }

  /** After the open document was deleted: back to the note before it, or an empty page. */
  async function leaveDeletedDocument() {
    if (!editor) return;
    dirty = false; // the user agreed to lose any changes
    const previous = history.at(-1);
    if (previous) {
      history = history.slice(0, -1);
      await loadHere(previous, { pushHistory: false, quiet: true });
      if (path === previous) return;
    }
    path = null;
    format = { ...NEW_FILE_FORMAT };
    diskText = null;
    missingOnDisk = false;
    watch(null);
    await editor.setMarkdown('');
    baseline = editor.getMarkdown();
    dirty = false;
    checkForm();
    rememberSession();
  }

  function searchFolder(query: string) {
    return invoke<{ matches: SearchMatch[]; truncated: boolean }>('search_folder', { root, query, hidden: showHidden });
  }

  async function showSearch() {
    setSection('search', true);
    await tick();
    await searchSection?.focus();
  }

  // ---- Sidebar sections --------------------------------------------------------

  function setSection(id: SectionId, on: boolean) {
    if (sections[id] === on) return;
    sections = { ...sections, [id]: on };
    // Only this section's change is saved, so another window's changes to the others are kept.
    setSectionsPref({ ...sectionsPref(), [id]: on });
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

  /** Pinning moves Document Nav out of the sidebar's stack to a column left of the document; unpinning puts it back. */
  function toggleOutlinePinned() {
    outlinePinned = !outlinePinned;
    setOutlinePinnedPref(outlinePinned);
    setSection('outline', true);
    trackActiveHeading();
  }

  function startPinnedResize(event: PointerEvent) {
    const handle = event.currentTarget as HTMLElement;
    handle.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startWidth = pinnedOutlineWidth;
    const move = (e: PointerEvent) => { pinnedOutlineWidth = Math.min(500, Math.max(140, startWidth + e.clientX - startX)); };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      setPinnedOutlineWidthPref(pinnedOutlineWidth);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up, { once: true });
  }

  // After a click in Document Nav the clicked heading stays highlighted (even when the document
  // can't scroll far enough to bring it to the top) until the reader scrolls or types.
  let headingPinned = false;

  function revealHeading(heading: SlateOutlineHeading) {
    editor?.revealLine(heading.line);
    activeHeading = heading.id;
    headingPinned = true;
  }

  /** GitHub-style heading anchor, as Metatrash's website makes them. */
  function headingSlug(text: string) {
    return text.toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').trim().replace(/\s/g, '-');
  }

  /** Goes to a link's #anchor in this document: a heading (`#bug-reported`) or a line (`#L12`). */
  function revealAnchor(anchor: string) {
    if (!editor || !anchor) return;
    const line = /^L(\d+)$/i.exec(anchor);
    if (line) {
      editor.revealLine(Math.max(0, Number(line[1]) - 1));
      return;
    }
    const wanted = headingSlug(anchor);
    const find = (headings: SlateOutlineHeading[]): SlateOutlineHeading | null => {
      for (const heading of headings) {
        if (heading.id === anchor || headingSlug(heading.title) === wanted) return heading;
        const child = find(heading.children);
        if (child) return child;
      }
      return null;
    };
    const heading = find(editor.getOutline().headings);
    if (heading) revealHeading(heading);
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
    if (publishedView?.path === watched) {
      // The published text stays on screen; the change may be a new version, so ask Metatrash.
      diskText = doc.text;
      schedulePolicies(1000);
      return;
    }

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
    syncFormView();
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
    checkForm();
    historyStamp += 1;
    if (scroller) scroller.scrollTop = scrollTop;
  }

  // ---- Show Changes (Slate 0.17.0): what changed since another version, read only ------

  let showingChanges = $state(false);
  /** The history versions picked to show changes from and to (to: null is the text on screen). */
  let changesFrom = $state<HistoryEntry | null>(null);
  let changesTo = $state<HistoryEntry | null>(null);
  let changesRequest = 0;

  function sameText(a: string, b: string) {
    const tidy = (text: string) => text.replace(/\r\n?/g, '\n').replace(/\s+$/, '');
    return tidy(a) === tidy(b);
  }

  async function showChangesFrom(fromText: string, label: string, to?: { text: string; label: string }) {
    if (!editor) return;
    await editor.showChanges(fromText, { label, to: to?.text ?? null, toLabel: to?.label });
    showingChanges = true;
  }

  /** History: a click shows changes since that version; Ctrl+click picks the version they go up to. */
  async function pickVersion(entry: HistoryEntry, second: boolean) {
    if (!editor || !path) return;
    let from = changesFrom;
    let to = changesTo;
    if (second && from && from.revision !== entry.revision) {
      to = to?.revision === entry.revision ? null : entry;
    } else if (!second && from?.revision === entry.revision && !to && showingChanges) {
      editor.hideChanges();
      return;
    } else {
      from = entry;
      to = null;
    }
    // From the older to the newer, whichever was picked first.
    if (to && Date.parse(to.timestamp) < Date.parse(from!.timestamp)) [from, to] = [to, from];
    const request = ++changesRequest;
    const file = path;
    try {
      const [fromText, toText] = await Promise.all([revisionText(from!, file), to ? revisionText(to, file) : null]);
      if (request !== changesRequest || path !== file) return;
      await showChangesFrom(fromText, entryLabel(from!), to && toText !== null ? { text: toText, label: entryLabel(to) } : undefined);
      changesFrom = from;
      changesTo = to;
    } catch (error) {
      if (request === changesRequest) await showError(error);
    }
  }

  /** Changes from the file as published in `version` of its folder to the text on screen; false when it wasn't in it. */
  async function showChangesSinceVersion(version: number, label = `version ${version}`): Promise<boolean> {
    if (!path) return false;
    const file = path;
    const request = ++changesRequest;
    const entry = await findPublishedEntry(file, version);
    if (!entry || request !== changesRequest || path !== file) return false;
    const text = await revisionText(entry, file);
    if (request !== changesRequest || path !== file) return false;
    await showChangesFrom(text, label);
    changesFrom = entry;
    changesTo = null;
    return true;
  }

  /** The policy bar's buttons: changes since an earlier published version. */
  async function changesSince(version: number, label: string) {
    try {
      if (!(await showChangesSinceVersion(version, label))) {
        await message(`This file isn't in version ${version} of its folder, so there is nothing to compare with.`, { title: 'Slate Viewer', kind: 'info' });
      }
    } catch (error) {
      await showError(error);
    }
  }

  /**
   * The ± Changes toggle (and Ctrl+Shift+D): a draft shows its changes since the published
   * version; a published text, its changes since the version before; any other file, its changes
   * since it was last saved to the space (or, when it is that, since the save before).
   */
  async function showDefaultChanges() {
    if (!editor || !path) return;
    const file = path;
    const request = ++changesRequest;
    const stale = () => request !== changesRequest || path !== file;
    try {
      const found = currentPolicy;
      if (found?.file) {
        const { folder, file: published } = found;
        if (publishedView?.path !== file && published.draft && published.publishedFile) {
          const text = await invoke<string>('mtsync_show', { file: published.publishedFile, revision: folder.revision });
          if (stale()) return;
          await showChangesFrom(text, `version ${folder.version}`);
          return;
        }
        if (folder.version > 1 && (await showChangesSinceVersion(folder.version - 1))) return;
        if (stale()) return;
      }
      const page = await fileHistory(file, 0);
      if (stale()) return;
      const usable = page.entries.filter(entry => entry.operation !== 'delete' && entry.file);
      const current = editor.getMarkdown();
      for (const [index, entry] of usable.slice(0, 2).entries()) {
        const text = await revisionText(entry, file);
        if (stale()) return;
        if (index === 0 && sameText(text, current) && usable.length > 1) continue;
        await showChangesFrom(text, entryLabel(entry));
        changesFrom = entry;
        changesTo = null;
        return;
      }
      await message('There is no earlier version of this file to compare with yet.', { title: 'Slate Viewer', kind: 'info' });
    } catch (error) {
      if (!stale()) await showError(error);
    }
  }

  async function toggleChanges() {
    if (!editor) return;
    if (editor.isShowingChanges()) editor.hideChanges();
    else if (historyFile) await showDefaultChanges();
  }

  function onChangesEnd(_detail: SlateChangesEndDetail) {
    syncFormView();
    changesRequest += 1;
    showingChanges = false;
    changesFrom = null;
    changesTo = null;
  }

  // Slate's ± Changes toggle, for files that have a history in the space.
  $effect(() => {
    const offered = historyFile !== null;
    editor?.setChangesToggle(offered ? () => showDefaultChanges() : null);
  });

  // ---- Published versions and read confirmations (Metatrash 0.48.0) ------------------

  /** The space's published folders and what this person still has to read, from mtsync. */
  let policies = $state<Policies | null>(null);
  /** Why they couldn't be read (mtsync too old, signed out), shown on files in a publishing folder. */
  let policiesProblem = $state<string | null>(null);
  /** The open file shows its published text rather than the file on disk. */
  let publishedView = $state<{ path: string; version: number; revision: string } | null>(null);
  /** Files whose draft the person chose to see in this window. */
  const draftChosen = new Set<string>();
  let confirming = $state(false);
  let policiesTimer: ReturnType<typeof setTimeout> | undefined;
  let policiesRequest = 0;
  let publishedRequest = 0;

  const unreadFiles = $derived(outstandingFiles(policies));
  const currentPolicy = $derived(currentRelative !== null && !isSpaceFolderFile(currentRelative) ? policyFor(policies, currentRelative) : null);
  /** A publishing folder (by its settings) holds the open file, but mtsync couldn't say more. */
  const policyNotice = $derived.by(() => {
    if (!policiesProblem || policies || currentRelative === null || isSpaceFolderFile(currentRelative)) return null;
    const rel = currentRelative;
    return descriptions.some(d => d.publishedVersion && rel.startsWith(d.folder)) ? policiesProblem : null;
  });

  async function loadPolicies() {
    clearTimeout(policiesTimer);
    const space = openedSpace;
    if (!space) return;
    const request = ++policiesRequest;
    try {
      const found = await fetchPolicies(space.folder);
      if (request !== policiesRequest || openedSpace?.folder !== space.folder) return;
      policies = found;
      policiesProblem = null;
    } catch (error) {
      if (request !== policiesRequest || openedSpace?.folder !== space.folder) return;
      // Keep what was known (offline for a moment); an older mtsync or server just has none.
      policiesProblem = String(error);
    }
    await syncPublishedView();
  }

  /** Asks again shortly, once a burst of changes (a sync pass) has settled. */
  function schedulePolicies(delay = 3000) {
    if (!openedSpace) return;
    clearTimeout(policiesTimer);
    policiesTimer = setTimeout(() => void loadPolicies(), delay);
  }

  // Published versions can change without a file changing here (someone confirms, a new member).
  $effect(() => {
    if (!openedSpace?.folder) return;
    const timer = setInterval(() => void loadPolicies(), 5 * 60_000);
    return () => clearInterval(timer);
  });

  // The red number on the taskbar button: published files this person still has to read.
  $effect(() => {
    void setAttentionBadge(policies?.outstanding ?? 0).catch(() => {});
  });

  /**
   * Shows the open file's published text when it has a draft (unless the person chose the draft),
   * and goes back to the file when it no longer has one.
   */
  async function syncPublishedView() {
    if (!editor || !path) return;
    const target = path;
    const found = currentPolicy;
    const file = found?.file;
    const want = !!(found && file?.draft && file.publishedFile && !draftChosen.has(target));
    const showing = publishedView?.path === target ? publishedView : null;
    if (showing && want && showing.revision === found!.folder.revision) return;
    if (showing && !want) { await showFileOnDisk(); return; }
    if (!want || dirty) return;
    const request = ++publishedRequest;
    let text: string;
    try {
      text = await invoke<string>('mtsync_show', { file: file!.publishedFile, revision: found!.folder.revision });
    } catch (error) {
      logFault('published', String(error));
      return;
    }
    if (request !== publishedRequest || path !== target || dirty) return;
    if (editor.isShowingChanges()) editor.hideChanges();
    publishedView = { path: target, version: found!.folder.version, revision: found!.folder.revision };
    await editor.setMarkdown(text);
    baseline = editor.getMarkdown();
    dirty = false;
    checkForm();
  }

  /** Back from the published text to the file as it is now. */
  async function showFileOnDisk() {
    if (!path) return;
    const target = path;
    try {
      const doc = await invoke<LoadedDocument>('read_document', { path: target });
      if (path === target) await reloadFrom(doc);
    } catch (error) {
      await showError(error);
    }
  }

  async function showDraft() {
    if (!path) return;
    draftChosen.add(path);
    await showFileOnDisk();
  }

  async function showPublished() {
    if (!path) return;
    if (dirty) {
      await message('Save or undo your changes first, then show the published version.', { title: 'Slate Viewer', kind: 'info' });
      return;
    }
    draftChosen.delete(path);
    await syncPublishedView();
  }

  /** I Have Read This: Metatrash records that this person read the published text. */
  async function confirmRead() {
    const found = currentPolicy;
    if (!found?.file || !path || confirming) return;
    confirming = true;
    try {
      await acknowledge(found.file.file ?? path, found.folder.version);
      await loadPolicies();
    } catch (error) {
      await loadPolicies();
      await showError(error);
    } finally {
      confirming = false;
    }
  }

  // ---- Forms (Metatrash 0.49.0, Slate 0.19.0) ------------------------------------------
  // A form's Preview is the form, ready to fill in (Slate's inPreview fill mode); Edit and
  // Source show the template. Where it can't be sent from here, the fields show greyed out.

  /** The open document as a form template (front matter with a form key), or null. */
  let currentForm = $state<SlateForm | null>(null);
  /** The answers kept on this computer for the open form, until they are sent. */
  let formDraft = $state<FormDraft | null>(null);
  /** What this window sent for the open form, shown on its bar until another file opens. */
  let sentForm = $state<{ path: string; receipt: Receipt } | null>(null);
  /** The form being filled in: the file its draft belongs to (null when not filling). */
  let fillingPath: string | null = null;
  /** Slate shows the form with its inputs (fill mode). */
  let filling = $state(false);
  /** Fill mode shows the fields greyed out: the form can't be sent from here just now. */
  let fillReadOnly = $state(false);
  /** Edit, Preview or Source, as Slate last reported it. */
  let workspaceMode = $state<SlateWorkspaceMode>('preview');
  let formSync: Promise<void> = Promise.resolve();
  /** The answers were sent, so ending fill mode keeps no draft. */
  let fillSent = false;
  let submissionsDialog = $state<{ id?: string } | null>(null);
  let formTimer: ReturnType<typeof setTimeout> | undefined;
  let draftTimer: ReturnType<typeof setTimeout> | undefined;

  function checkForm() {
    clearTimeout(formTimer);
    currentForm = editor && path ? editor.getForm() : null;
    const copy = editor && path && !currentForm ? parseFiledCopy(editor.getMarkdown()) : null;
    if (copy?.submission !== filedCopy?.submission) reviewProblem = '';
    // The copy synced back with the review this window saved.
    if (reviewedText && (reviewedText.path !== path || (copy && copy.reviewedAt === parseFiledCopy(reviewedText.text)?.reviewedAt))) reviewedText = null;
    filedCopy = copy;
    formDraft = currentForm && path ? loadDraft(path) : null;
    syncFormView();
  }

  function scheduleFormCheck() {
    clearTimeout(formTimer);
    formTimer = setTimeout(checkForm, 400);
  }

  /** Why the open form can't be sent from this window, or null. */
  const formUnavailable = $derived.by(() => {
    if (!currentForm || !path) return null;
    if (!openedSpace || spaceRelative(path) === null) return 'Open it from its Metatrash space (File > Open Metatrash Space) to fill it in and send it.';
    return null;
  });

  /** Why the open form shows greyed out instead of ready to fill in, or null. */
  function fillBlocked(): string | null {
    if (formUnavailable) return 'Open it from its Metatrash space to fill it in.';
    if (dirty) return 'Save your changes to the form to fill it in.';
    // In a published folder, the form people fill in is the published one (Metatrash 0.50.0).
    if (currentPolicy?.file?.draft && publishedView?.path !== path) return 'This is a draft of the form. Choose Show Published Version to fill it in.';
    const quiz = currentQuiz?.quiz;
    if (quiz?.status === 'passed') return 'You have passed this quiz.';
    if (quiz?.status === 'waiting') return 'Your answers are waiting for a reviewer to mark them.';
    if (quiz?.status === 'failed' && quiz.retryAt && Date.parse(quiz.retryAt) > quizClock) return `Not passed. You can try again from ${formatWhen(quiz.retryAt)}.`;
    // Metatrash 0.51.0: the policies it covers are read first (readFirst, the default).
    if (quiz?.readFirst && quiz.toRead?.length) return `Read ${quiz.toRead.length === 1 ? 'the policy' : `the ${quiz.toRead.length} policies`} it covers first: ${quiz.toRead.map(p => p.split('/').pop()).join(', ')}.`;
    return null;
  }

  /** The quizzes that cover the open file, with this person's state in each (Metatrash 0.51.0). */
  const coveringQuizzes = $derived(currentRelative !== null ? quizzesCovering(policies, currentRelative) : []);

  /** The open quiz, with this person's state in it (Metatrash 0.50.0). */
  const currentQuiz = $derived(currentPolicy && currentRelative !== null ? quizFor(currentPolicy.folder, currentRelative) : null);
  /** Moves on when a failed quiz can be taken again. */
  let quizClock = $state(Date.now());

  $effect(() => {
    const at = currentQuiz?.quiz.status === 'failed' && currentQuiz.quiz.retryAt ? Date.parse(currentQuiz.quiz.retryAt) : NaN;
    if (!(at > Date.now())) return;
    const timer = setTimeout(() => { quizClock = Date.now(); void loadPolicies(); }, Math.min(at - Date.now() + 1000, 2 ** 31 - 1));
    return () => clearTimeout(timer);
  });

  /** Shows the open form, in Preview, ready to fill in (or greyed out); one at a time. */
  function syncFormView() {
    formSync = formSync.then(applyFormView, applyFormView);
  }

  async function applyFormView() {
    if (!editor) return;
    const mode = editor.getWorkspaceMode();
    workspaceMode = mode;
    const wanted = currentForm !== null && !currentForm.error && path !== null && mode === 'preview'
      && !editor.isShowingChanges() && !editor.isComparing();
    if (!wanted || !path) return;
    const blocked = fillBlocked();
    const readOnly = blocked !== null;
    if (filling && fillingPath === path && fillReadOnly === readOnly) return;
    if (filling) {
      // Another way of showing the same form: keep what was typed.
      clearTimeout(draftTimer);
      if (fillingPath && !fillReadOnly && !fillSent) saveDraft(fillingPath, editor.getFormAnswers());
    }
    const draft = readOnly ? null : loadDraft(path);
    const sent = sentForm?.path === path;
    fillingPath = path;
    fillReadOnly = readOnly;
    fillSent = false;
    try {
      filling = true;
      await editor.startFill({
        inPreview: true,
        readOnly,
        answers: draft?.answers,
        status: blocked
          ?? (draft ? `Your draft from ${formatWhen(new Date(draft.savedAt).toISOString())}.`
            : sent ? 'Sent. You can fill it in again to send another.'
              : 'Your answers are kept on this computer until you send them.'),
      });
    } catch (error) {
      fillingPath = null;
      filling = false;
      console.error(error);
    }
  }

  // Saving, a lost space or the published text decide whether the form can be filled in.
  $effect(() => {
    void [dirty, formUnavailable, publishedView, currentQuiz?.quiz.status, currentQuiz?.quiz.retryAt, currentQuiz?.quiz.toRead?.length, currentPolicy?.file?.draft, quizClock];
    untrack(() => { if (currentForm) syncFormView(); });
  });

  /** Fill In from Edit or Source: the form is filled in in Preview. */
  async function fillInForm() {
    if (!editor || !currentForm) return;
    if (editor.getWorkspaceMode() !== 'preview') await setMode('preview');
    syncFormView();
  }

  function onFormInput(answers: SlateFormAnswers) {
    const file = fillingPath;
    if (!file || fillReadOnly) return;
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      saveDraft(file, answers);
      if (file === path) formDraft = loadDraft(file);
    }, 600);
  }

  function onFillEnd(detail: SlateFillEndDetail) {
    clearTimeout(draftTimer);
    const file = fillingPath;
    fillingPath = null;
    filling = false;
    if (file && !fillSent && !fillReadOnly) saveDraft(file, detail.answers);
    fillReadOnly = false;
    fillSent = false;
    if (file === path) formDraft = file ? loadDraft(file) : null;
    // After sending, the form comes back empty, ready for another.
    if (detail.reason === 'host' && file === path) syncFormView();
  }

  /** Send: mtsync checks the template is the one on screen, and Metatrash files the copy. */
  async function sendForm(detail: SlateFormSubmitDetail) {
    if (!editor || !fillingPath) return;
    const file = fillingPath;
    editor.setFormStatus('Sending…', { busy: true });
    // A form in a published folder is sent as published, in this version of its folder.
    const relative = spaceRelative(file);
    const published = relative !== null ? policyFor(policies, relative) : null;
    const version = published?.file && !(published.file.draft && publishedView?.path !== file) ? published.folder.version : undefined;
    let result;
    try {
      result = await submitForm(file, detail.answers, version);
    } catch (error) {
      editor.setFormStatus(String(error), { kind: 'error', busy: false });
      return;
    }
    if (fillingPath !== file) return;
    if (result.ok) {
      fillSent = true;
      clearDraft(file);
      sentForm = { path: file, receipt: result.receipt };
      editor.endFill();
      // Sending it counted as reading it, or a quiz was marked: the dot and the bars catch up.
      if (result.receipt.acknowledged || result.receipt.quiz) void loadPolicies();
      return;
    }
    const { code, message: text, fields } = result.error;
    if (code === 'invalid_answers' && fields?.length) {
      editor.setFormProblems(fields);
      editor.setFormStatus(fields.length === 1 ? '1 answer needs fixing.' : `${fields.length} answers need fixing.`, { kind: 'error', busy: false });
    } else if (code === 'template_changed') {
      editor.setFormStatus(version !== undefined
        ? 'A new version of this form was published since it was opened. Wait for it to sync, check your answers and send again.'
        : 'This form was changed in the space since it was opened. Wait for it to sync, check your answers and send again.', { kind: 'error', busy: false });
      void loadPolicies();
    } else if (['quiz_passed', 'quiz_waiting', 'retry_later', 'not_published', 'read_first'].includes(code)) {
      editor.setFormStatus(text, { kind: 'error', busy: false });
      void loadPolicies();
    } else {
      editor.setFormStatus(text || 'The form could not be sent.', { kind: 'error', busy: false });
    }
  }

  async function discardDraft() {
    if (!path) return;
    const choice = await message('Forget the answers saved on this computer for this form?', {
      title: 'Slate Viewer',
      kind: 'warning',
      buttons: { ok: 'Discard Draft', cancel: 'Keep' },
    });
    if (choice !== 'Discard Draft' || !path) return;
    clearTimeout(draftTimer);
    clearDraft(path);
    formDraft = null;
    if (editor?.isFilling() && fillingPath === path && !fillReadOnly) {
      await editor.setFormAnswers({});
      editor.setFormStatus('Your answers are kept on this computer until you send them.');
    }
  }

  /** After a failed quiz: the answers last sent, with the wrong ones marked (only which, never the right answer). */
  async function fixAnswers() {
    if (!editor || !path || !openedSpace || !currentRelative || !editor.isFilling() || fillReadOnly) return;
    const target = path;
    const relative = currentRelative;
    let last: Receipt | null = null;
    try {
      const found = (await fetchReceipts(openedSpace.folder)).find(r => r.template === relative && r.quiz);
      if (found) last = await fetchReceipt(openedSpace.folder, found.id);
    } catch (error) {
      editor.setFormStatus(String(error), { kind: 'error' });
      return;
    }
    if (path !== target || !editor.isFilling()) return;
    if (!last?.answers) {
      editor.setFormStatus('Your last answers to this quiz could not be found.', { kind: 'error' });
      return;
    }
    await editor.setFormAnswers(last.answers);
    saveDraft(target, editor.getFormAnswers());
    formDraft = loadDraft(target);
    const wrong = Object.entries(last.marks ?? {}).filter(([, m]) => m === false).map(([name]) => ({ name, message: 'This answer was not right.' }));
    editor.setFormProblems(wrong);
    editor.setFormStatus(wrong.length === 1 ? 'Your last answers: 1 was not right.' : `Your last answers: ${wrong.length} were not right.`);
  }

  /** After a failed quiz: an empty form. */
  async function startAgain() {
    if (!editor || !path || !editor.isFilling() || fillReadOnly) return;
    clearTimeout(draftTimer);
    clearDraft(path);
    formDraft = null;
    await editor.setFormAnswers({});
    editor.setFormProblems([]);
    editor.setFormStatus('Your answers are kept on this computer until you send them.');
  }

  // ---- Reviews (Metatrash 0.50.0) ------------------------------------------------------
  // A copy of a form filed in a review space names its submission in its front matter. Someone
  // who can write to that space reviews it there: approve or decline a form, tick a quiz's
  // written answers. A quiz copy with the right answers becomes the quiz's answer key.

  /** The open document as a filed copy, or null. */
  let filedCopy = $state<FiledCopy | null>(null);
  let reviewing = $state(false);
  let reviewProblem = $state('');
  /** What the last review here said, until the copy syncs back. */
  let reviewedText = $state<{ path: string; text: string } | null>(null);
  const shownCopy = $derived(reviewedText && reviewedText.path === path ? parseFiledCopy(reviewedText.text) : filedCopy);
  const canReview = $derived(shownCopy !== null && path !== null && openedSpace !== null && spaceRelative(path) !== null && canManageFiles);

  async function sendReview(review: Review) {
    if (!path || reviewing) return;
    const target = path;
    reviewing = true;
    reviewProblem = '';
    try {
      const result = await reviewCopy(target, review);
      if (result.ok) {
        if (result.receipt.text) reviewedText = { path: target, text: result.receipt.text };
      } else {
        reviewProblem = result.error.message || 'The review could not be saved.';
      }
    } catch (error) {
      reviewProblem = String(error);
    } finally {
      reviewing = false;
    }
  }

  /** Use This as Answers: the copy, without its submission, becomes `<space>-<form>-answers.md` beside it. */
  async function useAsAnswers() {
    const copy = shownCopy;
    if (!path || !copy || !copy.quiz) return;
    const target = joinPath(dirname(path), answerKeyName(copy));
    const exists = await invoke<LoadedDocument>('read_document', { path: target }).then(() => true, () => false);
    const choice = await message(`${exists ? 'Replace the answer key for' : 'Use these answers as the answer key for'} ${copy.title || copy.form}?\n\nIt is saved as ${basename(target)} in this folder. Once it syncs, Metatrash marks everyone's answers to this text of the quiz with it; when the quiz is published again with changes, send it again with the right answers to make a new key.`, {
      title: 'Slate Viewer',
      kind: 'info',
      buttons: { ok: exists ? 'Replace' : 'Use as Answers', cancel: 'Cancel' },
    });
    if (choice !== (exists ? 'Replace' : 'Use as Answers')) return;
    try {
      const doc = await invoke<LoadedDocument>('read_document', { path });
      await invoke('write_document', { path: target, text: answerKeyText(doc.text), hasBom: false });
      syncPendingSince = Date.now();
    } catch (error) {
      await showError(error);
    }
  }

  function showSubmissions(id?: string) {
    if (!openedSpace) return;
    submissionsDialog = { id };
  }

  /** Waits (up to about 40 s) for mtsync to send this window's saves to the space. */
  async function waitForSync() {
    for (let i = 0; i < 25 && syncPendingSince !== null; i++) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      await refreshSpaceState();
    }
  }

  /**
   * Publishes the next version of a folder ("" for the top of the space): raises publishedVersion
   * in its .metatrash.json, so the files as the space has them now become the official text.
   */
  async function publishFolder(relative: string) {
    if (!root || !openedSpace || !canManageFiles) return;
    const dir = root;
    const prefix = relative ? relative + '/' : '';
    const label = relative || openedSpace.space;
    const readText = (rel: string) => invoke<LoadedDocument>('read_document', { path: joinPath(dir, rel) }).then(d => d.text, () => null);
    const chain = folderChain(prefix);
    const texts = new Map(await Promise.all(chain.map(async f => [f, await readText(f + SETTINGS_FILE)] as const)));
    const frozen = frozenKeys(texts, prefix);
    if (frozen.has('publishedVersion')) {
      await message(`Publishing ${label} is locked for everyone. Lift the lock in its Properties (Security) first.`, { title: 'Slate Viewer', kind: 'info' });
      return;
    }
    const current = toSavedVersion(texts.get(prefix) ?? null);
    const asks = descriptions.find(d => d.folder === prefix)?.acknowledge === true;
    let askToRead = false;
    if (current === null) {
      const canAsk = openedSpace.space !== 'public' && !frozen.has('services');
      const choice = await message(`Publish version 1 of ${label}?\n\nIts files as they are now become the official text, which everyone opens by default. Later edits are a draft until you publish the next version.${canAsk ? '\n\nAlso ask everyone in the space to confirm they have read its Markdown files?' : ''}`, {
        title: 'Slate Viewer',
        kind: 'info',
        buttons: canAsk ? { yes: 'Publish and Ask to Read', no: 'Publish Only', cancel: 'Cancel' } : { ok: 'Publish', cancel: 'Cancel' },
      });
      if (choice !== 'Publish and Ask to Read' && choice !== 'Publish Only' && choice !== 'Publish') return;
      askToRead = choice === 'Publish and Ask to Read';
    } else {
      const next = `Publish Version ${current + 1}`;
      const choice = await message(`Publish version ${current + 1} of ${label}?\n\nIts files as they are now replace version ${current} as the official text.${asks ? ' Everyone is asked to read the files that changed.' : ''}`, {
        title: 'Slate Viewer',
        kind: 'info',
        buttons: { ok: next, cancel: 'Cancel' },
      });
      if (choice !== next) return;
    }
    // Unsaved edits go first, and must reach the space before the version does.
    if (dirty && !(await confirmDiscard())) return;
    await waitForSync();
    try {
      const now = await readText(prefix + SETTINGS_FILE);
      await invoke('write_document', { path: joinPath(dir, prefix + SETTINGS_FILE), text: publishText(now, prefix, askToRead), hasBom: false });
    } catch (error) {
      await showError(error);
      return;
    }
    syncPendingSince = Date.now();
    void loadDescriptions();
  }

  // ---- View ---------------------------------------------------------------------

  function applyTheme() {
    const resolved = theme === 'system' ? (systemDark.matches ? 'dark' : 'light') : theme;
    host.dataset.theme = resolved;
    document.documentElement.dataset.theme = resolved;
    // Paper is a light theme as far as the window frame goes.
    void appWindow.setTheme(theme === 'system' ? null : theme === 'dark' ? 'dark' : 'light').catch(() => {});
  }

  /** Windows start hidden (see open_document_window in lib.rs) until the theme is applied. */
  let windowShown = false;
  function showWindow() {
    if (windowShown) return;
    windowShown = true;
    // Shows it in front: a window opened from Explorer while the app runs would otherwise stay behind.
    invoke('show_window').catch(() => appWindow.show().catch(() => {}));
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
    schedulePlaceSave();
  }

  /** A file opened from Explorer opens for reading: Read Only checklist mode, in Preview. */
  async function openForReading() {
    if (!editor || readOnly) return;
    readOnly = true;
    editor.setInteractiveTasks(true);
    await editor.setReadOnly(true);
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

  /** Why the open document can't be edited (a read-only space), or null. */
  const lockReason = $derived.by(() => {
    if (!openedSpace || !path) return null;
    const rel = currentRelative;
    if (rel === null) return null;
    if (publishedView?.path === path) return 'You are reading the published version. Choose Show Draft above the document to see the file as it is now, and edit it.';
    if (openedSpace.access === 'read only') return `${openedSpace.space} is a read-only space.`;
    if (lockedForEveryone(rel)) return `${rel} ${everyoneReason}.`;
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
    policies = null;
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
      void loadPolicies();
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
    const dir = root;
    const found = await invoke<FolderDescription[]>('folder_descriptions', { root: dir }).catch(() => []);
    if (dir === root) descriptions = found;
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
      schedulePolicies(500); // and a published version, if it was one, is known there
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
    if (policies?.outstanding) parts.push(`${policies.outstanding} to read`);
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
    const deadline = Date.now() + (wanted ? 5 * 60_000 : 60_000);
    while (root === dir && Date.now() < deadline) {
      const target = wanted || firstNote(folderFiles);
      if (target && folderFiles.includes(target)) {
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

  /** View > Show Hidden Files: AGENTS.md, .metatrash.json, images and other files that aren't notes. */
  function toggleShowHidden() {
    showHidden = !showHidden;
    setShowHiddenPref(showHidden);
    void refreshFolder();
  }

  function setZoom(next: number) {
    zoom = Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next)) * 10) / 10;
    setZoomPref(zoom);
    void getCurrentWebview().setZoom(zoom);
  }

  const resetZoomText = $derived(`&Reset Zoom${zoom === 1 ? '' : ` (${Math.round(zoom * 100)}%)`}`);

  /**
   * Ctrl+mouse wheel zooms, a step per wheel notch. A touchpad sends many small steps
   * (pinching sends Ctrl+wheel too), so those add up to a notch first.
   */
  let wheelSum = 0;
  function onZoomWheel(event: WheelEvent) {
    if (!(event.ctrlKey || event.metaKey) || event.deltaY === 0) return;
    event.preventDefault();
    wheelSum = Math.abs(event.deltaY) >= 50 ? event.deltaY : wheelSum + event.deltaY;
    if (Math.abs(wheelSum) < 50) return;
    setZoom(zoom + (wheelSum < 0 ? 0.1 : -0.1));
    wheelSum = 0;
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
    await diagramsDrawn();
    await addPrintImage();
    window.print();
  }

  let printTitle: HTMLStyleElement | null = null;
  let printImageBox: HTMLElement | null = null;
  let printLinks: Array<{ link: Element; attribute: string; value: string }> = [];

  function beforePrint() {
    setPrintTitle();
    absoluteLinksForPrint();
  }

  function afterPrint() {
    for (const { link, attribute, value } of printLinks) link.setAttribute(attribute, value);
    printLinks = [];
    printImageBox?.remove();
    printImageBox = null;
  }

  /**
   * In a Metatrash space, the image the document's folder settings name (print.image) goes at the
   * top of the printout, above the title, on the first page only; it is never put in the file.
   * Waits (up to 5 s) for it to load, and prints without it if it can't.
   */
  async function addPrintImage() {
    printImageBox?.remove();
    printImageBox = null;
    const relative = path ? spaceRelative(path) : null;
    const pane = host.querySelector<HTMLElement>('#previewPane');
    if (!openedSpace || relative === null || !pane) return;
    const dir = openedSpace.folder;
    const folder = relative.includes('/') ? relative.slice(0, relative.lastIndexOf('/') + 1) : '';
    const readText = (rel: string) => invoke<LoadedDocument>('read_document', { path: joinPath(dir, rel) }).then(d => d.text, () => null);
    const chain = folderChain(folder);
    const texts = new Map(await Promise.all(chain.map(async f => [f, await readText(f + SETTINGS_FILE)] as const)));
    const address = printImage(effectiveSettings(texts, folder));
    if (!address) return;
    const box = document.createElement('div');
    box.className = 'print-image';
    const image = box.appendChild(document.createElement('img'));
    image.alt = '';
    image.src = address;
    pane.prepend(box);
    printImageBox = box;
    const loaded = await Promise.race([
      image.decode().then(() => true, () => false),
      new Promise<boolean>(resolve => setTimeout(() => resolve(false), 5000)),
    ]);
    if (!loaded && printImageBox === box) {
      box.remove();
      printImageBox = null;
    }
  }

  /** Puts the document's name in the print footer (app.css): its first # heading, or its file name. */
  function setPrintTitle() {
    const heading = host.querySelector<HTMLElement>('#previewPane h1')?.innerText.trim();
    const title = (heading || name.replace(/\.[^.]+$/, '')).replace(/\s+/g, ' ');
    printTitle ??= document.head.appendChild(document.createElement('style'));
    printTitle.textContent = `@page { @bottom-left { content: ${JSON.stringify(title)}; } }`;
  }

  /**
   * In a Metatrash space, the printout's links to other files point at them on the website
   * (server/spaces/owner/slug/path), so they work from a PDF wherever it's opened, for anyone
   * who may read the space. Links put back after printing.
   */
  function absoluteLinksForPrint() {
    const relative = path ? spaceRelative(path) : null;
    if (!openedSpace || relative === null) return;
    const page = `${openedSpace.server}/spaces/${openedSpace.space}/${relative.split('/').map(encodeURIComponent).join('/')}`;
    // Diagrams' links are SVG <a> elements, whose link may be in xlink:href.
    for (const link of host.querySelectorAll('#previewPane a')) {
      const attribute = link.hasAttribute('href') ? 'href' : link.hasAttribute('xlink:href') ? 'xlink:href' : null;
      if (!attribute) continue;
      const value = link.getAttribute(attribute) ?? '';
      const target = (link as HTMLElement).dataset?.mdUrl ?? value;
      // Web addresses (and mailto: and the like) already work; #heading links stay in the document.
      if (!target || target.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
      let absolute: string;
      try { absolute = new URL(target, page).href; } catch { continue; }
      printLinks.push({ link, attribute, value });
      link.setAttribute(attribute, absolute);
    }
  }

  /** Waits (up to 5 s) for Preview's diagrams to be drawn, so a print doesn't catch their source. */
  async function diagramsDrawn() {
    const pending = () => [...host.querySelectorAll<HTMLElement>('.slate-diagram')]
      .some(diagram => !diagram.dataset.renderedTheme && !diagram.closest('.editor-pane'));
    const until = Date.now() + 5000;
    while (pending() && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 50));
    // One frame for the drawn SVGs to lay out.
    await new Promise(resolve => requestAnimationFrame(resolve));
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
          { text: 'New F&ile…', keys: 'Ctrl+Alt+N', action: () => void newFile() },
          { text: 'New File in Roo&t…', enabled: root !== null && canManageFiles, action: () => void newFile(true) },
          { text: 'New Fo&lder…', enabled: root !== null && canManageFiles, action: () => void newFolder() },
          { text: '&Open…', keys: 'Ctrl+O', action: () => void chooseAndOpen() },
          { text: 'Open &Folder…', keys: 'Ctrl+Alt+O', action: () => void chooseFolder() },
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
          { text: 'Fill In For&m', enabled: currentForm !== null && !currentForm.error && workspaceMode !== 'preview', action: () => void fillInForm() },
          { text: 'My Su&bmissions…', enabled: openedSpace !== null, action: () => showSubmissions() },
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
          { text: 'Show Ch&anges', keys: 'Ctrl+Shift+D', checked: showingChanges, enabled: showingChanges || historyFile !== null, action: () => void toggleChanges() },
          separator,
          { text: 'Read Only (&Checklist Mode)', keys: 'Ctrl+Shift+R', checked: readOnly, action: () => void toggleReadOnly() },
          { text: '&Files', keys: 'Ctrl+Shift+E', checked: sections.files, action: () => toggleSection('files') },
          { text: 'Searc&h', checked: sections.search, action: () => toggleSection('search') },
          { text: 'Document &Navigation', keys: 'Ctrl+Shift+O', checked: sections.outline, action: toggleOutline },
          { text: 'Pin Document Navi&gation', checked: outlinePinned, action: toggleOutlinePinned },
          { text: 'Version Histor&y', keys: 'Ctrl+Shift+H', checked: sections.history, action: () => toggleSection('history') },
          { text: 'Sidebar &Labels', checked: activityLabels, action: toggleActivityLabels },
          { text: 'Show Hidden Fil&es', checked: showHidden, action: toggleShowHidden },
          separator,
          {
            text: '&Theme',
            items: [
              { text: 'Match &System', checked: theme === 'system', action: () => chooseTheme('system') },
              { text: '&Light', checked: theme === 'light', action: () => chooseTheme('light') },
              { text: '&Dark', checked: theme === 'dark', action: () => chooseTheme('dark') },
              { text: '&Paper', checked: theme === 'paper', action: () => chooseTheme('paper') },
            ],
          },
          separator,
          { text: 'Zoom &In', keys: 'Ctrl+=', action: () => setZoom(zoom + 0.1) },
          { text: 'Zoom O&ut', keys: 'Ctrl+-', action: () => setZoom(zoom - 0.1) },
          { text: resetZoomText, keys: 'Ctrl+0', enabled: zoom !== 1, action: () => setZoom(1) },
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
          { text: 'Check for &Updates…', action: () => { updateDialog = { initial: null }; } },
          { separator: true },
          { text: 'Open &Log Folder', action: () => void invoke('open_log_folder').catch(showError) },
          { text: '&Developer Tools', action: () => void invoke('toggle_devtools').catch(showError) },
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
    const hash = url.indexOf('#');
    let anchor = hash < 0 ? '' : url.slice(hash + 1);
    try { anchor = decodeURIComponent(anchor); } catch { /* keep it as written */ }
    if (hash === 0) {
      revealAnchor(anchor);
      return;
    }
    if (/^(https?|mailto):/i.test(url)) {
      await openUrl(url).catch(error => showError(`Couldn't open ${url} in the browser.\n\n${error}`));
      return;
    }
    const local = toLocalPath(url, folder());
    if (!local) return;
    if (MARKDOWN_EXTENSIONS.includes(extname(local))) {
      if (newWindow) await openWindow(local);
      else {
        if (local !== path) await openDocument(local);
        // Only once the linked file is the one showing (opening it can be cancelled).
        if (local === path) revealAnchor(anchor);
      }
      return;
    }
    try {
      await openPath(local);
    } catch {
      // Not a file type we hand to other apps (or it is missing): show it in Explorer instead.
      await revealItemInDir(local).catch(showError);
    }
  }

  /** A link in the document: `text` is what it shows; `icon` when the click was on a web link's ↗. */
  type ClickedLink = ({ url: string; wiki?: undefined } | { url?: undefined; wiki: string }) & { text: string; icon: boolean };

  function linkFromEvent(event: MouseEvent): ClickedLink | null {
    const anchor = (event.target as Element | null)?.closest?.('a, .wiki-link, .slate-external-icon');
    // Links drawn inside a diagram are SVG <a> elements, which may carry xlink:href.
    if (!(anchor instanceof HTMLElement || anchor instanceof SVGElement) || !host.contains(anchor)) return null;
    const text = anchor.textContent ?? '';
    if (anchor.classList.contains('wiki-link')) {
      const wiki = anchor.dataset.noteName || text;
      return wiki ? { wiki, text, icon: false } : null;
    }
    if (anchor.dataset.attachmentId) return null;
    const url = anchor.dataset.mdUrl ?? anchor.getAttribute('href') ?? anchor.getAttribute('xlink:href') ?? '';
    if (!url || url === '#') return null;
    return { url, text, icon: anchor.classList.contains('slate-external-icon') };
  }

  function follow(link: ClickedLink, newWindow: boolean) {
    return link.wiki !== undefined ? followWikiLink(link.wiki, newWindow) : followLink(link.url, newWindow);
  }

  function onHostClick(event: MouseEvent) {
    const link = linkFromEvent(event);
    if (!link || !editor) return;
    const modifier = event.ctrlKey || event.metaKey;
    // In Edit and Source a plain click places the caret to edit the link, as in Slate itself;
    // Ctrl+click follows. The ↗ after a web link opens it with a plain click everywhere.
    if (editor.getWorkspaceMode() !== 'preview' && !modifier && !link.icon) {
      // Never let the webview follow it itself (a diagram's link would load into this window,
      // a target="_blank" one would open a new window).
      event.preventDefault();
      return;
    }
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

  // ---- Right-click menu in the document ----------------------------------------------

  let contextMenu = $state<{ x: number; y: number; items: MenuEntry[] } | null>(null);

  /** Text for a menu item: in quotes, cut short, `&` kept literal. */
  function quoted(text: string) {
    return `“${text.length > 32 ? `${text.slice(0, 31)}…` : text}”`.replace(/&/g, '&&');
  }

  /** What to search for to find the other links to the same place. */
  function linkSearchText(link: ClickedLink): string {
    if (link.wiki !== undefined) return `[[${link.wiki}`;
    // A bare www. address is a link to http://www.…, but the notes have it as written.
    if (/^https?:\/\/www\./i.test(link.url) && /^www\./i.test(link.text)) return link.text;
    if (/^[a-z][a-z0-9+.-]*:/i.test(link.url) || link.url.startsWith('#')) return link.url;
    // A file: other notes reach it by other relative paths, so look for its name.
    const file = link.url.split(/[?#]/)[0];
    try { return basename(decodeURI(file)); } catch { return basename(file); }
  }

  async function findInFolder(text: string) {
    setSection('search', true);
    await tick();
    await searchSection?.searchFor(text);
  }

  async function pasteText() {
    editor?.focus();
    try {
      document.execCommand('insertText', false, await navigator.clipboard.readText());
    } catch {
      await message('Press Ctrl+V to paste here.', { title: 'Slate Viewer', kind: 'info' });
    }
  }

  /**
   * Our own menu when there is selected text or a link under the mouse (Find, link actions);
   * otherwise the webview's usual one.
   */
  function onHostContextMenu(event: MouseEvent) {
    if (!editor) return;
    const selection = window.getSelection();
    const selected = selection && !selection.isCollapsed && host.contains(selection.anchorNode) ? selection.toString() : '';
    // Search works line by line, so a selection over several lines finds its first line.
    const find = selected.split(/\r?\n/).map(line => line.trim()).find(Boolean)?.slice(0, 200) ?? '';
    const link = linkFromEvent(event);
    if (!find && !link) return;
    event.preventDefault();

    const editable = !readOnly && editor.getWorkspaceMode() !== 'preview' && !!(event.target as Element).closest?.('.cm-content');
    const items: MenuEntry[] = [];
    const separate = () => { if (items.length && !('separator' in items[items.length - 1])) items.push({ separator: true }); };
    if (find) {
      if (editable) items.push({ text: 'Cu&t', keys: 'Ctrl+X', action: () => { editor?.focus(); document.execCommand('cut'); } });
      items.push({ text: '&Copy', keys: 'Ctrl+C', action: () => void navigator.clipboard.writeText(selected).catch(showError) });
      if (editable) items.push({ text: '&Paste', keys: 'Ctrl+V', action: () => void pasteText() });
      separate();
      if (root) items.push({ text: `&Find ${quoted(find)} in Folder`, keys: 'Ctrl+Shift+F', action: () => void findInFolder(find) });
      items.push({ text: `Find ${quoted(find)} in &Document`, keys: 'Ctrl+F', action: () => void findBar?.open(find) });
    }
    if (link) {
      separate();
      const web = link.url !== undefined && /^(https?|mailto):/i.test(link.url);
      const note = link.wiki !== undefined || (link.url !== undefined && MARKDOWN_EXTENSIONS.includes(extname(link.url.split(/[?#]/)[0])));
      items.push({ text: web ? '&Open Link in Browser' : '&Open Link', action: () => void follow(link, false) });
      if (note) items.push({ text: 'Open in New &Window', action: () => void follow(link, true) });
      items.push({
        text: 'Copy Link &Address',
        action: () => void navigator.clipboard.writeText(link.wiki !== undefined ? `[[${link.wiki}]]` : link.url).catch(showError),
      });
      const others = linkSearchText(link);
      items.push({
        text: 'Find Other &Uses of This Link',
        action: () => void (root ? findInFolder(others) : findBar?.open(others)),
      });
    }
    if (zoom !== 1) {
      separate();
      items.push({ text: resetZoomText, keys: 'Ctrl+0', action: () => setZoom(1) });
    }
    contextMenu = { x: event.clientX, y: event.clientY, items };
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
      handle(chooseFolder);
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.altKey && event.code === 'KeyN') {
      handle(() => newFile());
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
    if (key === 'd' && shift) { handle(toggleChanges); return; }
    // Inside the editor Slate handles Ctrl+Shift+O itself and tells us with slate:outline-toggle.
    if (key === 'o' && shift && !event.defaultPrevented) { handle(toggleOutline); return; }

    if (key === 'o' && !shift) handle(chooseAndOpen);
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
    host.addEventListener('contextmenu', onHostContextMenu);
    // Not passive, so Ctrl+wheel can zoom the window instead of scrolling.
    window.addEventListener('wheel', onZoomWheel, { passive: false });
    cleanups.push(() => window.removeEventListener('wheel', onZoomWheel));
    window.addEventListener('beforeprint', beforePrint);
    window.addEventListener('afterprint', afterPrint);
    cleanups.push(() => window.removeEventListener('beforeprint', beforePrint));
    cleanups.push(() => window.removeEventListener('afterprint', afterPrint));
    host.addEventListener('slate:change', () => {
      if (editor) dirty = missingOnDisk || editor.getMarkdown() !== baseline;
      scheduleFormCheck();
      if (editor && openedSpace) docBytes = new TextEncoder().encode(editor.getMarkdown()).length;
      scheduleFindRefresh();
      schedulePlaceSave();
    });
    host.addEventListener('slate:outline', event => {
      outline = (event as CustomEvent<SlateOutline>).detail;
      trackActiveHeading();
      scheduleFindRefresh(); // sent after every render, so the document's text nodes are new
    });
    host.addEventListener('slate:compare-end', event => {
      void onCompareEnd((event as CustomEvent<SlateCompareEndDetail>).detail);
    });
    host.addEventListener('slate:changes-end', event => {
      onChangesEnd((event as CustomEvent<SlateChangesEndDetail>).detail);
    });
    host.addEventListener('slate:form-input', event => {
      onFormInput((event as CustomEvent<{ name: string; answers: SlateFormAnswers }>).detail.answers);
    });
    host.addEventListener('slate:form-submit', event => {
      void sendForm((event as CustomEvent<SlateFormSubmitDetail>).detail);
    });
    host.addEventListener('slate:fill-end', event => {
      onFillEnd((event as CustomEvent<SlateFillEndDetail>).detail);
    });
    host.addEventListener('slate:mode-change', event => {
      workspaceMode = (event as CustomEvent<SlateModeChangeDetail>).detail.mode;
      syncFormView();
    });
    host.addEventListener('slate:outline-toggle', event => {
      setSection('outline', (event as CustomEvent<{ open: boolean }>).detail.open);
    });
    host.addEventListener('scroll', trackActiveHeading, true);
    // Scrolling, moving the cursor and typing change where the user is in the document.
    for (const type of ['scroll', 'keyup', 'pointerup']) host.addEventListener(type, schedulePlaceSave, true);
    window.addEventListener('pagehide', rememberPlace);
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
      editor.setChangesToggle(historyFile ? () => showDefaultChanges() : null);
      applyTheme();
      showWindow();
      if (zoom !== 1) void getCurrentWebview().setZoom(zoom);
      baseline = editor.getMarkdown();
      const initialFolder = window.__SLATE_VIEWER_INITIAL_FOLDER__;
      const initial = window.__SLATE_VIEWER_INITIAL_FILE__;
      // A folder from Explorer picks up where it was left; New Window and Ctrl+click keep this
      // window's folder without opening anything in it.
      if (initialFolder) await openFolder(initialFolder, { restore: launched && !initial });
      if (initial) {
        // A file from Explorer opens on its own (no folder, whatever the last session had) and
        // replaces the session, but its scroll position and cursor come back.
        await loadHere(initial);
        if (launched && !initialFolder) {
          await openForReading();
          const view = path ? placeView(path) : null;
          if (view) await whileRestoring(() => restoreView(view));
        }
      } else if (!initialFolder && resumeSession) {
        await resumeLastSession();
      }

      cleanups.push(await getCurrentWebviewWindow().listen('document-changed', onDiskChange));
      cleanups.push(await getCurrentWebviewWindow().listen('folder-changed', onFolderChange));
      cleanups.push(await getCurrentWebviewWindow().listen<UpdateCheck>('update-available', event => {
        if (!updateDialog) updateDialog = { initial: event.payload };
      }));
      cleanups.push(await appWindow.onCloseRequested(async event => {
        rememberPlace();
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
              bind:this={filesSection}
              {root}
              files={folderFiles}
              {emptyFolders}
              truncated={folderTruncated}
              current={currentRelative}
              {recentFolders}
              {rootKind}
              onOpen={(relative, options) => void openFromFolder(relative, options)}
              onCreate={createNoteFromSidebar}
              editable={canManageFiles}
              locked={lockedFiles}
              onCreateFolder={createFolder}
              onRename={renameEntry}
              onMove={moveEntry}
              onDuplicate={relative => void duplicateEntry(relative)}
              onDelete={(relative, isFolder) => void deleteEntry(relative, isFolder)}
              onProperties={openedSpace ? (relative => (propertiesFor = relative)) : undefined}
              unread={unreadFiles}
              onPublish={openedSpace ? (relative => void publishFolder(relative)) : undefined}
              onCloseFolder={closeFolder}
              onChooseFolder={() => void chooseFolder()}
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
              from={changesFrom}
              to={changesTo}
              onPick={(entry, second) => void pickVersion(entry, second)}
              onMerge={entry => void compareWithRevision(entry)}
              onClear={() => editor?.hideChanges()}
            />
          {:else}
            <OutlineSection {outline} active={activeHeading} onReveal={revealHeading} onTogglePin={toggleOutlinePinned} />
          {/if}
        {/snippet}
      </SidePanel>
    </div>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="resizer" onpointerdown={startResize}></div>
  {/if}
  {#if outlinePinned}
    {#if sections.outline}
      <div class="pinned-nav" style:width="{pinnedOutlineWidth}px">
        <OutlineSection
          {outline}
          active={activeHeading}
          onReveal={revealHeading}
          pinned
          onTogglePin={toggleOutlinePinned}
          onCollapse={() => setSection('outline', false)}
        />
      </div>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="resizer" onpointerdown={startPinnedResize}></div>
    {:else}
      <button class="nav-strip" title="Show Document Nav (Ctrl+Shift+O)" aria-label="Show Document Nav" onclick={() => setSection('outline', true)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 7l5 5-5 5" /></svg>
        <span>Document Nav</span>
      </button>
    {/if}
  {/if}
  <div class="editor">
    {#if currentPolicy}
      <PolicyBanner
        folder={currentPolicy.folder}
        file={currentPolicy.file}
        viewing={publishedView?.path === path ? 'published' : 'current'}
        busy={confirming}
        onShowDraft={() => void showDraft()}
        onShowPublished={() => void showPublished()}
        onConfirm={() => void confirmRead()}
        quizzes={coveringQuizzes}
        onTakeQuiz={relative => void openFromFolder(relative)}
        onChangesSince={(version, label) => void changesSince(version, label)}
      />
    {:else if policyNotice}
      <p class="policy-notice">This folder publishes versions, but they can't be shown here: {policyNotice}</p>
    {/if}
    {#if currentForm}
      <FormBanner
        form={currentForm}
        unavailable={formUnavailable}
        editing={workspaceMode !== 'preview'}
        draft={formDraft}
        sent={sentForm?.path === path ? sentForm.receipt : null}
        onFill={() => void fillInForm()}
        onDiscardDraft={() => void discardDraft()}
        onSubmissions={showSubmissions}
        quiz={currentQuiz}
        canRetry={currentQuiz?.quiz.status === 'failed' && filling && !fillReadOnly}
        onFixAnswers={() => void fixAnswers()}
        onStartAgain={() => void startAgain()}
      />
    {:else if shownCopy && canReview}
      <ReviewBanner
        copy={shownCopy}
        busy={reviewing}
        problem={reviewProblem}
        onReview={review => void sendReview(review)}
        onUseAsAnswers={() => void useAsAnswers()}
      />
    {/if}
    <div class="host" bind:this={host}></div>
    <FindBar bind:this={findBar} getHost={() => host} getEditor={() => editor} inEditor={() => editor?.getWorkspaceMode() !== 'preview'} />
  </div>
</div>
</div>

{#if spaceDialog}
  <OpenSpace onOpened={(folder, ref) => void onSpaceOpened(folder, ref)} onClose={() => (spaceDialog = false)} />
{/if}

{#if propertiesFor !== null && openedSpace && root}
  <FolderProperties
    {root}
    folder={propertiesFor ? propertiesFor + '/' : ''}
    space={openedSpace}
    {descriptions}
    onClose={() => (propertiesFor = null)}
    onSaved={() => { syncPendingSince = Date.now(); void loadDescriptions(); }}
    onOpenFile={relative => void openFromFolder(relative)}
  />
{/if}

{#if submissionsDialog && openedSpace}
  <SubmissionsDialog folder={openedSpace.folder} space={openedSpace.space} initialId={submissionsDialog.id} onClose={() => (submissionsDialog = null)} />
{/if}

{#if updateDialog}
  <UpdateDialog initial={updateDialog.initial} onClose={() => (updateDialog = null)} />
{/if}

{#if contextMenu}
  {#key contextMenu}
    <ContextMenu x={contextMenu.x} y={contextMenu.y} items={contextMenu.items} onClose={() => (contextMenu = null)} />
  {/key}
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
  .editor { position: relative; flex: 1; min-width: 0; height: 100%; display: flex; flex-direction: column; }
  .pinned-nav {
    flex: none; height: 100%; min-width: 0; border-right: 1px solid var(--side-border);
    background: var(--side-bg); color: var(--side-fg); font: 13px/1.35 Inter, "Segoe UI", system-ui, sans-serif;
  }
  .nav-strip {
    flex: none; display: flex; flex-direction: column; align-items: center; gap: 8px; width: 22px; height: 100%; padding: 8px 0;
    border: 0; border-right: 1px solid var(--side-border); background: var(--side-bg); color: var(--side-muted);
    font: 11px/1 Inter, "Segoe UI", system-ui, sans-serif; letter-spacing: .06em; text-transform: uppercase; cursor: pointer;
  }
  .nav-strip:hover { color: var(--side-fg); background: var(--side-hover); }
  .nav-strip span { writing-mode: vertical-rl; }
  .nav-strip svg { flex: none; width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
  .host { flex: 1; min-height: 0; }
  .policy-notice {
    margin: 0; padding: 7px 14px; font: 13px/1.4 Inter, "Segoe UI", system-ui, sans-serif;
    color: var(--side-muted); background: var(--side-bg); border-bottom: 1px solid var(--side-border);
  }
</style>
