// The Backend for Slate Viewer: Tauri commands (src-tauri) and plugins.

import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { homeDir } from '@tauri-apps/api/path';
import { Menu, NativeIcon, type MenuOptions } from '@tauri-apps/api/menu';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { open, save, message, type MessageDialogOptions } from '@tauri-apps/plugin-dialog';
import { openUrl, openPath, revealItemInDir } from '@tauri-apps/plugin-opener';
import { isSeparator, type MenuEntry } from '../menu';
import type { Receipt, SubmitResult, SubmitRefusal } from '../forms';
import type { Policies, ReaderReport } from '../policies';
import type { HistoryPage } from '../history';
import type { VirtualFile } from '../space';
import type { Backend } from './types';

const appWindow = getCurrentWindow();

/** mtsync submit/review: its exit status, its JSON output and its error text. */
type Outcome = { ok: boolean; json: string; message: string };

function outcome(out: Outcome): SubmitResult {
  let parsed: unknown = null;
  try { parsed = out.json ? JSON.parse(out.json) : null; } catch { /* not JSON */ }
  if (out.ok && parsed) return { ok: true, receipt: parsed as Receipt };
  const error = (parsed as { error?: SubmitRefusal } | null)?.error;
  return { ok: false, error: error ?? { code: '', message: out.message || 'The form could not be sent.' } };
}

function toNative(entries: MenuEntry[]): MenuOptions['items'] {
  return entries.map(entry => {
    if (isSeparator(entry)) return { item: 'Separator' as const };
    const text = entry.keys ? `${entry.text}\t${entry.keys}` : entry.text;
    if (entry.items) return { text, enabled: entry.enabled, items: toNative(entry.items) };
    // macOS has no file or cloud icon for menus; Folder and Network are the nearest.
    const icon = entry.icon === 'folder' ? NativeIcon.Folder : entry.icon === 'space' ? NativeIcon.Network : undefined;
    if (icon) return { text, enabled: entry.enabled, icon, action: entry.action };
    return { text, enabled: entry.enabled, checked: entry.checked, action: entry.action };
  }) as MenuOptions['items'];
}

let menuGeneration = 0;

export const desktop: Backend = {
  capabilities: { kind: 'desktop', windows: true, menuBar: true, updates: true, syncService: true, fileManager: true },

  files: {
    read: path => invoke('read_document', { path }),
    write: (path, text, hasBom) => invoke('write_document', { path, text, hasBom }),
    list: (root, hidden) => invoke('list_folder', { root, hidden }),
    search: (root, query, hidden) => invoke('search_folder', { root, query, hidden }),
    createNote: (folder, name, title) => invoke('create_note', { folder, name, title }),
    createFolder: (parent, name) => invoke('create_folder', { parent, name }),
    rename: (from, to) => invoke('rename_path', { from, to }),
    duplicate: (path, spaceNames) => invoke('duplicate_file', { path, spaceNames }),
    trash: path => invoke('trash_path', { path }),
    deleteConflictCopy: path => invoke('delete_conflict_copy', { path }),
    saveAttachment: (documentPath, folder, name, bytes) => invoke('save_attachment', { documentPath, folder, name, bytes }),
    folderDescriptions: root => invoke('folder_descriptions', { root }),
    watchDocument: path => invoke('watch_document', { path }),
    watchFolder: root => invoke('watch_folder', { root }),
    url: path => convertFileSrc(path),
    homeDir: () => homeDir(),
  },

  sync: {
    info: () => invoke('mtsync_info'),
    setup: () => invoke('mtsync_setup'),
    spaces: server => invoke('mtsync_spaces', { server }),
    list: () => invoke('mtsync_list'),
    whoami: server => invoke('mtsync_whoami', { server }),
    add: (space, folder, server) => invoke('mtsync_add', { space, folder, server }),
    start: () => invoke('mtsync_start'),
    log: lines => invoke('mtsync_log', { lines }),
    syncNow: folder => invoke('mtsync_sync', { folder }),
    virtual: async folder => JSON.parse(await invoke<string>('mtsync_virtual', { folder })) as VirtualFile[],
    text: file => invoke('mtsync_text', { file }),
    login: server => invoke('mtsync_login', { server }),
    cancelLogin: () => invoke('mtsync_cancel_login'),
    history: async (file, limit, offset) => JSON.parse(await invoke<string>('mtsync_history', { file, limit, offset })) as HistoryPage,
    show: (file, revision) => invoke('mtsync_show', { file, revision }),
    submit: async (file, answers, version) =>
      outcome(await invoke<Outcome>('mtsync_submit', { file, answers: JSON.stringify(answers), version })),
    review: async (file, review) => outcome(await invoke<Outcome>('mtsync_review', { file, review: JSON.stringify(review) })),
    submissions: async folder => {
      const out = JSON.parse(await invoke<string>('mtsync_submissions', { folder })) as { submissions?: Receipt[] };
      return out.submissions ?? [];
    },
    submission: async (folder, id) => JSON.parse(await invoke<string>('mtsync_submissions', { folder, id })) as Receipt,
    policies: async folder => JSON.parse(await invoke<string>('mtsync_policies', { folder })) as Policies,
    acknowledge: (file, version) => invoke('mtsync_ack', { file, version }),
    readers: async folder => JSON.parse(await invoke<string>('mtsync_readers', { folder })) as ReaderReport,
  },

  app: {
    version: () => getVersion(),
    logFault: (kind, message) => invoke('log_fault', { kind, message }),
    openWindow: (path, folder) => invoke('open_window', { path, folder }),
    openDefaultAppsSettings: () => invoke('open_default_apps_settings'),
    openLogFolder: () => invoke('open_log_folder'),
    toggleDevtools: () => invoke('toggle_devtools'),
    setAttentionBadge: count => invoke('set_attention_badge', { count }),
    changeNotes: () => invoke('change_notes'),
    changeNote: version => invoke('change_note', { version }),
    checkForUpdates: () => invoke('check_for_updates'),
    skipUpdate: version => invoke('skip_update', { version }),
    installUpdate: () => invoke('install_update'),
  },

  window: {
    setTitle: title => appWindow.setTitle(title),
    setTheme: theme => appWindow.setTheme(theme),
    // Shows it in front: a window opened from Explorer while the app runs would otherwise stay behind.
    show: () => invoke<void>('show_window').catch(() => appWindow.show()),
    close: () => appWindow.close(),
    destroy: () => appWindow.destroy(),
    minimize: () => appWindow.minimize(),
    toggleMaximize: () => appWindow.toggleMaximize(),
    isMaximized: () => appWindow.isMaximized(),
    onResized: handler => appWindow.onResized(() => handler()),
    onCloseRequested: handler => appWindow.onCloseRequested(handler),
    setZoom: zoom => getCurrentWebview().setZoom(zoom),
    setMenu: async entries => {
      const mine = ++menuGeneration;
      const menu = await Menu.new({ items: toNative(entries) });
      if (mine === menuGeneration) await menu.setAsWindowMenu(appWindow);
    },
  },

  dialogs: {
    message: (text, options) => message(text, options as MessageDialogOptions),
    openFiles: async filters => {
      const picked = await open({ multiple: true, directory: false, filters });
      return Array.isArray(picked) ? picked : picked ? [picked] : [];
    },
    openFolder: async defaultPath => {
      const picked = await open({ directory: true, multiple: false, defaultPath });
      return typeof picked === 'string' ? picked : null;
    },
    saveFile: options => save(options),
  },

  opener: {
    url: url => openUrl(url),
    path: path => openPath(path),
    reveal: path => revealItemInDir(path),
  },

  on: (event, handler) => getCurrentWebviewWindow().listen(event, e => handler(e.payload as never)),
};
