// Everything the UI asks of the world outside the webview, in one interface. The desktop app
// answers it with Tauri (desktop.ts); the metatrash.com build will answer it with fetch calls to
// the site (web.ts). Nothing outside this folder imports @tauri-apps.

import type { MenuEntry } from '../menu';
import type { SearchMatch } from '../types';
import type { FolderDescription, MtsyncInfo, MtsyncOutput, Registration, SpaceRow, VirtualFile } from '../space';
import type { HistoryPage } from '../history';
import type { Receipt, SubmitResult } from '../forms';
import type { Policies, ReaderReport } from '../policies';
import type { UpdateCheck } from '../UpdateDialog.svelte';

export interface LoadedDocument { path: string; text: string; hasBom: boolean }
export interface FolderListing { files: string[]; emptyFolders: string[]; truncated: boolean }

/** What this build can do. The same components read it to show or hide what only one build has. */
export interface Capabilities {
  /** 'desktop' for Slate Viewer, 'web' for metatrash.com. */
  kind: 'desktop' | 'web';
  /** More than one window, and the window's own controls (minimise, close, title). */
  windows: boolean;
  /** The File/Edit/View/… menu bar. */
  menuBar: boolean;
  /** Help > Check for Updates and the update offer. */
  updates: boolean;
  /** mtsync on this computer: setting it up, Sync menu, its log. */
  syncService: boolean;
  /** Show in Explorer, open other files with their own apps, the log folder, default apps. */
  fileManager: boolean;
}

export interface FileFilter { name: string; extensions: string[] }

/** A question or notice. With `buttons`, the result is the label of the button pressed. */
export interface MessageOptions {
  title?: string;
  kind?: 'info' | 'warning' | 'error';
  buttons?: { ok: string; cancel?: string } | { yes: string; no: string; cancel?: string };
}

/** Events the other side sends: a watched file or folder changed, sync state, an update, a sign-in link. */
export interface BackendEvents {
  'document-changed': void;
  'folder-changed': void;
  'sync-state-changed': void;
  'update-available': UpdateCheck;
  'mtsync-login-url': string;
}

export type Unlisten = () => void;

export interface Backend {
  readonly capabilities: Capabilities;

  /** Files and folders, by full path. */
  files: {
    read(path: string): Promise<LoadedDocument>;
    write(path: string, text: string, hasBom: boolean): Promise<void>;
    list(root: string, hidden: boolean): Promise<FolderListing>;
    search(root: string, query: string, hidden: boolean): Promise<{ matches: SearchMatch[]; truncated: boolean }>;
    /** Makes `name` in `folder` with a `# title` heading; returns its full path. */
    createNote(folder: string, name: string, title: string): Promise<string>;
    /** Returns the new folder's full path. */
    createFolder(parent: string, name: string): Promise<string>;
    rename(from: string, to: string): Promise<void>;
    /** `spaceNames`: keep the copy's name to what Metatrash accepts. Returns the copy's full path. */
    duplicate(path: string, spaceNames: boolean): Promise<string>;
    /** To the recycle bin. */
    trash(path: string): Promise<void>;
    deleteConflictCopy(path: string): Promise<void>;
    /** Stores `bytes` as `folder/name` beside `documentPath`; returns the path relative to the document. */
    saveAttachment(documentPath: string, folder: string, name: string, bytes: number[]): Promise<string>;
    folderDescriptions(root: string): Promise<FolderDescription[]>;
    /** Sends 'document-changed' when this file changes (null stops). */
    watchDocument(path: string | null): Promise<void>;
    /** Sends 'folder-changed' when anything under this folder changes (null stops). */
    watchFolder(root: string | null): Promise<void>;
    /** A URL the webview can load the file from (pictures in notes). */
    url(path: string): string;
    homeDir(): Promise<string>;
  };

  /** Metatrash spaces, through mtsync on the desktop. `file` and `folder` are full paths in a synced folder. */
  sync: {
    info(): Promise<MtsyncInfo>;
    /** Downloads mtsync from the latest Metatrash release (checksum checked), installs it and starts its service. */
    setup(): Promise<string>;
    /** `server` is null for metatrash.com. */
    spaces(server: string | null): Promise<SpaceRow[]>;
    list(): Promise<Registration[]>;
    /** mtsync -json whoami as text, or null when it can't say. */
    whoami(server: string | null): Promise<string | null>;
    add(space: string, folder: string, server: string | null): Promise<MtsyncOutput>;
    start(): Promise<void>;
    log(lines: number): Promise<string>;
    syncNow(folder: string): Promise<void>;
    virtual(folder: string): Promise<VirtualFile[]>;
    /** The space's text for a synced file (a PDF's Markdown). */
    text(file: string): Promise<string>;
    login(server: string | null): Promise<void>;
    cancelLogin(): Promise<void>;
    history(file: string, limit: number, offset: number): Promise<HistoryPage>;
    /** The file's text at a revision, as stored in the space. */
    show(file: string, revision: string): Promise<string>;
    submit(file: string, answers: unknown, version: number | null): Promise<SubmitResult>;
    review(file: string, review: unknown): Promise<SubmitResult>;
    submissions(folder: string): Promise<Receipt[]>;
    submission(folder: string, id: string): Promise<Receipt>;
    policies(folder: string): Promise<Policies>;
    acknowledge(file: string, version: number): Promise<void>;
    readers(folder: string): Promise<ReaderReport>;
  };

  /** The app itself. */
  app: {
    version(): Promise<string>;
    /** Adds a line to the fault log (Help > Open Log Folder). */
    logFault(kind: string, message: string): Promise<void>;
    /** A new window on `path` (or empty), in `folder` mode when given. */
    openWindow(path: string | null, folder: string | null): Promise<void>;
    openDefaultAppsSettings(): Promise<void>;
    openLogFolder(): Promise<void>;
    toggleDevtools(): Promise<void>;
    /** Puts `count` on the taskbar button, or clears it at 0. */
    setAttentionBadge(count: number): Promise<void>;
    changeNotes(): Promise<string[]>;
    changeNote(version: string): Promise<string>;
    checkForUpdates(): Promise<UpdateCheck>;
    skipUpdate(version: string): Promise<void>;
    installUpdate(): Promise<void>;
  };

  /** This window. */
  window: {
    setTitle(title: string): Promise<void>;
    /** null follows the system. */
    setTheme(theme: 'light' | 'dark' | null): Promise<void>;
    /** Shows it in front. */
    show(): Promise<void>;
    close(): Promise<void>;
    /** Closes without asking onCloseRequested again. */
    destroy(): Promise<void>;
    minimize(): Promise<void>;
    toggleMaximize(): Promise<void>;
    isMaximized(): Promise<boolean>;
    onResized(handler: () => void): Promise<Unlisten>;
    /** `handler` calls preventDefault() to keep the window open. */
    onCloseRequested(handler: (event: { preventDefault(): void }) => void | Promise<void>): Promise<Unlisten>;
    setZoom(zoom: number): Promise<void>;
    /** The native menu (macOS, where the app doesn't draw its own menu bar). */
    setMenu(entries: MenuEntry[]): Promise<void>;
  };

  dialogs: {
    message(text: string, options?: MessageOptions): Promise<string>;
    /** Full paths, or none when cancelled. */
    openFiles(filters: FileFilter[]): Promise<string[]>;
    openFolder(defaultPath?: string): Promise<string | null>;
    saveFile(options: { title?: string; defaultPath?: string; filters?: FileFilter[] }): Promise<string | null>;
  };

  /** Handing things to other apps. */
  opener: {
    url(url: string): Promise<void>;
    /** Opens a file with its own app. */
    path(path: string): Promise<void>;
    /** Shows it in Explorer (Finder). */
    reveal(path: string): Promise<void>;
  };

  on<K extends keyof BackendEvents>(event: K, handler: (payload: BackendEvents[K]) => void): Promise<Unlisten>;
}
