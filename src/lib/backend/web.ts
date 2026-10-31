// The Backend for metatrash.com: the site API (/api/v1/site/, Metatrash 0.72.0) with the
// session cookie. A "folder" is a space, named by the path its website pages use
// (/spaces/owner/slug or /spaces/public), so the components keep joining paths as on the desktop.
// There is no mtsync here: the sync calls answer as if the open space were always in sync,
// which lets the space features (read-only spaces, history, policies, forms) light up.

import type { MenuEntry } from '../menu';
import type { HistoryEntry, HistoryPage } from '../history';
import type { Receipt, SubmitRefusal, SubmitResult } from '../forms';
import type { Policies, ReaderReport } from '../policies';
import type { SpaceRow } from '../space';
import type { Backend, BackendEvents, FileFilter, MessageOptions, Unlisten } from './types';

const API = '/api/v1/site';
const SPACES = '/spaces/';
const POLL_MS = 5000;

interface SiteSession { signedIn: boolean; account?: string; csrf?: string; spaces: { space: string; name: string; owner: string; access: string }[] }

let session: Promise<SiteSession> | null = null;
function siteSession(): Promise<SiteSession> {
  session ??= call<SiteSession>('GET', `${API}/session`).catch(error => { session = null; throw error; });
  return session;
}

/** The space and the path inside it for a full path such as /spaces/owner/slug/notes/a.md. */
function locate(path: string): { space: string; root: string; rel: string } {
  if (!path.startsWith(SPACES)) throw new Error(`${path} is not in a space.`);
  const parts = path.slice(SPACES.length).split('/');
  const owned = parts[0] !== 'public';
  const space = owned ? `${parts[0]}/${parts[1] ?? ''}` : 'public';
  const rest = parts.slice(owned ? 2 : 1).join('/');
  return { space, root: SPACES + space, rel: rest };
}

class SiteError extends Error {
  constructor(message: string, readonly status: number, readonly code: string, readonly detail?: SubmitRefusal) { super(message); }
}

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (method !== 'GET') {
    const { csrf } = await siteSession();
    if (csrf) headers['X-Metatrash-CSRF'] = csrf;
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin' });
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  if (!res.ok) {
    const error = (data as { error?: SubmitRefusal } | null)?.error;
    throw new SiteError(error?.message ?? `The site answered ${res.status}.`, res.status, error?.code ?? '', error);
  }
  return data as T;
}

const spaceUrl = (space: string, resource: string, query: Record<string, string | number | undefined> = {}) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined) q.set(k, String(v));
  const s = q.toString();
  return `${API}/spaces/${space}/${resource}${s ? `?${s}` : ''}`;
};

// The space state each file was last read or written at, for ifInState: a save then
// fails only when that file changed on the server meanwhile.
const fileStates = new Map<string, string>();
const fileIds = new Map<string, string>();

interface ReadResult { state: string; file: { id: string; path: string; text: string } }
interface ListResult { state: string; files: { path: string }[]; nextCursor: string | null; removed?: string[] }
interface Mutation { newState: string; file: { id: string; path: string } }

async function readFile(path: string): Promise<ReadResult> {
  const { space, rel } = locate(path);
  const out = await call<ReadResult>('GET', spaceUrl(space, 'file', { path: rel }));
  fileStates.set(path, out.state);
  fileIds.set(path, out.file.id);
  return out;
}

async function stateFor(path: string): Promise<string> {
  const known = fileStates.get(path);
  if (known) return known;
  const { space } = locate(path);
  return (await call<ListResult>('GET', spaceUrl(space, 'files', { limit: 1 }))).state;
}

/** Saves, creating the file if need be; a file changed on the server meanwhile is refused. */
async function writeFile(path: string, text: string, createOnly = false): Promise<Mutation> {
  const { space, rel } = locate(path);
  const body: Record<string, unknown> = { text, ifInState: await stateFor(path), strict: false };
  if (createOnly) body.createOnly = true;
  try {
    const out = await call<Mutation>('PUT', spaceUrl(space, 'file', { path: rel }), body);
    fileStates.set(path, out.newState);
    fileIds.set(path, out.file.id);
    return out;
  } catch (error) {
    if (error instanceof SiteError && error.status === 409) {
      throw new Error(`${rel} changed on the server while you were editing. Copy your changes, reload the page and add them again.`);
    }
    throw error;
  }
}

// ---- Watching: polls `files?since=` while the page is visible -----------------------

const listeners = new Map<keyof BackendEvents, Set<(payload: never) => void>>();
function emit<K extends keyof BackendEvents>(event: K, payload?: BackendEvents[K]) {
  for (const fn of listeners.get(event) ?? []) fn(payload as never);
}

let watchedRoot: string | null = null;
let watchedState: string | null = null;
let watchedDoc: string | null = null;
let timer: ReturnType<typeof setInterval> | undefined;

async function poll() {
  if (!watchedRoot || !watchedState || document.visibilityState !== 'visible') return;
  const root = watchedRoot;
  const { space } = locate(root);
  try {
    const out = await call<ListResult>('GET', spaceUrl(space, 'files', { since: watchedState }));
    if (root !== watchedRoot) return;
    watchedState = out.state;
    const changed = [...out.files.map(f => f.path), ...(out.removed ?? [])];
    if (!changed.length) return;
    emit('folder-changed');
    if (watchedDoc && changed.some(p => `${root}/${p}` === watchedDoc)) emit('document-changed');
  } catch {
    // Signed out or offline for a moment: try again next time.
  }
}

// ---- In-page dialogs (the site has no native ones) ---------------------------------

function dialog(text: string, options: MessageOptions = {}, input?: string): Promise<string | null> {
  return new Promise(resolve => {
    const back = document.createElement('div');
    back.className = 'web-dialog-backdrop';
    const box = document.createElement('div');
    box.className = `web-dialog ${options.kind ?? 'info'}`;
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    if (options.title) {
      const h = document.createElement('h2');
      h.textContent = options.title;
      box.append(h);
    }
    for (const para of text.split('\n\n')) {
      const p = document.createElement('p');
      p.textContent = para;
      box.append(p);
    }
    let field: HTMLInputElement | null = null;
    if (input !== undefined) {
      field = document.createElement('input');
      field.value = input;
      box.append(field);
    }
    const row = document.createElement('div');
    row.className = 'buttons';
    const b = options.buttons;
    const labels: [string, string | null][] = !b ? [['OK', 'OK']]
      : 'yes' in b ? [[b.yes, b.yes], [b.no, b.no], ...(b.cancel ? [[b.cancel, b.cancel] as [string, string]] : [])]
      : [[b.ok, b.ok], ...(b.cancel ? [[b.cancel, b.cancel] as [string, string]] : [])];
    if (input !== undefined && !b) labels.push(['Cancel', null]);
    const done = (value: string | null) => {
      back.remove();
      document.removeEventListener('keydown', onKey, true);
      resolve(value);
    };
    const cancelValue = labels.length > 1 ? labels[labels.length - 1][1] : labels[0][1];
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); done(input !== undefined ? null : cancelValue); }
      if (event.key === 'Enter' && field && document.activeElement === field) { event.preventDefault(); done(field.value); }
    };
    labels.forEach(([label, value], i) => {
      const button = document.createElement('button');
      button.textContent = label;
      if (i === 0) button.className = 'primary';
      button.onclick = () => done(value === null ? null : field && i === 0 ? field.value : value);
      row.append(button);
    });
    box.append(row);
    back.append(box);
    document.body.append(back);
    document.addEventListener('keydown', onKey, true);
    (field ?? row.querySelector('button'))?.focus();
  });
}

function refusal(error: unknown): SubmitRefusal {
  if (error instanceof SiteError && error.detail) return error.detail;
  return { code: '', message: String((error as Error).message) };
}

const notOnTheSite = (what: string) => Promise.reject(new Error(`${what} isn't available on the website.`));

export const backend: Backend = {
  capabilities: { kind: 'web', windows: false, menuBar: false, updates: false, syncService: false, fileManager: false },

  files: {
    read: async path => {
      const out = await readFile(path);
      return { path, text: out.file.text, hasBom: false };
    },
    write: async (path, text) => { await writeFile(path, text); },
    list: async (root, hidden) => {
      const { space } = locate(root);
      const files: string[] = [];
      let cursor: string | undefined;
      let state = '';
      let truncated = false;
      for (let page = 0; ; page++) {
        const out = await call<ListResult>('GET', spaceUrl(space, 'files', { limit: 100, cursor }));
        state ||= out.state;
        files.push(...out.files.map(f => f.path));
        if (!out.nextCursor) break;
        if (page >= 99) { truncated = true; break; }
        cursor = out.nextCursor;
      }
      if (root === watchedRoot) watchedState = state;
      const shown = hidden ? files : files.filter(f => !f.split('/').some(part => part.startsWith('.')));
      return { files: shown, emptyFolders: [], truncated };
    },
    search: async (root, query) => {
      const { space } = locate(root);
      const out = await call<{ matches: { path: string; line: number; text: string }[]; nextCursor?: string | null }>('GET',
        spaceUrl(space, 'search', { query, ignoreCase: 'true', limit: 200 }));
      return { matches: out.matches.map(({ path, line, text }) => ({ path, line, text })), truncated: out.matches.length >= 200 };
    },
    createNote: async (folder, name, title) => {
      const path = `${folder}/${name}`;
      await writeFile(path, `# ${title}\n`, true);
      return path;
    },
    createFolder: () => notOnTheSite('Making an empty folder'),
    rename: async (from, to) => {
      const a = locate(from), b = locate(to);
      const out = await call<Mutation>('POST', spaceUrl(a.space, 'move'), { from: a.rel, to: b.rel, ifInState: await stateFor(from), strict: false });
      fileStates.delete(from);
      fileStates.set(to, out.newState);
    },
    duplicate: async path => {
      const { text } = (await readFile(path)).file;
      const dot = path.lastIndexOf('.');
      const base = dot > path.lastIndexOf('/') ? path.slice(0, dot) : path;
      const ext = dot > path.lastIndexOf('/') ? path.slice(dot) : '';
      for (let n = 1; n < 100; n++) {
        const copy = `${base}-copy${n > 1 ? `-${n}` : ''}${ext}`;
        try { await writeFile(copy, text, true); return copy; } catch (error) {
          if (!(error instanceof SiteError) || error.status !== 409) throw error;
        }
      }
      throw new Error('Could not find a free name for the copy.');
    },
    trash: async path => {
      const { space, rel } = locate(path);
      await call('DELETE', spaceUrl(space, 'file', { path: rel }), { ifInState: await stateFor(path), strict: false });
      fileStates.delete(path);
    },
    deleteConflictCopy: () => notOnTheSite('Conflict copies'),
    saveAttachment: () => notOnTheSite('Adding pictures'),
    folderDescriptions: async () => [],
    watchDocument: async path => { watchedDoc = path; },
    watchFolder: async root => {
      watchedRoot = root;
      watchedState = null;
      clearInterval(timer);
      if (!root) return;
      const { space } = locate(root);
      watchedState = (await call<ListResult>('GET', spaceUrl(space, 'files', { limit: 1 }))).state;
      timer = setInterval(() => void poll(), POLL_MS);
    },
    url: path => {
      const { root, rel } = locate(path);
      return `${root}/${rel.split('/').map(encodeURIComponent).join('/')}?raw`;
    },
    homeDir: async () => '',
  },

  sync: {
    info: async () => ({ path: 'metatrash.com', version: null, supported: true, minVersion: '', installHint: '' }),
    setup: () => notOnTheSite('Setting up sync'),
    spaces: async (): Promise<SpaceRow[]> => (await siteSession()).spaces.map(s => ({
      space: s.space, name: s.name, access: s.access === 'read_write' ? 'read and write' : 'read only',
    })),
    // The open space is the only "registration", always in sync.
    list: async () => watchedRoot ? [{ folder: watchedRoot, space: locate(watchedRoot).space, state: 'in sync', server: location.origin }] : [],
    whoami: async () => {
      const s = await siteSession();
      return JSON.stringify({ server: location.origin, signedIn: s.signedIn, account: s.account ?? '' });
    },
    add: () => notOnTheSite('Adding a space'),
    start: async () => {},
    log: async () => '',
    syncNow: async () => { await poll(); },
    virtual: async () => [],
    text: async file => (await readFile(file)).file.text,
    login: async () => { location.href = '/login'; },
    cancelLogin: async () => {},
    history: async (file, limit, offset): Promise<HistoryPage> => {
      const { space, root } = locate(file);
      const id = fileIds.get(file) ?? (await readFile(file)).file.id;
      const out = await call<{ space: string; entries: HistoryEntry[]; nextCursor: string | null }>('GET', spaceUrl(space, 'history', { id, limit, offset }));
      const entries = out.entries.map(e => ({ ...e, file: `${root}/${e.path}` }));
      return { space: out.space, folder: root, id, entries, nextOffset: out.nextCursor ? offset + entries.length : null };
    },
    show: async (file, revision) => {
      const { space, rel } = locate(file);
      return (await call<ReadResult>('GET', spaceUrl(space, 'file', { path: rel, revision }))).file.text;
    },
    submit: async (file, answers, version): Promise<SubmitResult> => {
      const { space, rel } = locate(file);
      try {
        const receipt = await call<Receipt>('POST', spaceUrl(space, 'submissions'), { path: rel, answers, ...(version ? { version } : {}) });
        return { ok: true, receipt };
      } catch (error) {
        return { ok: false, error: refusal(error) };
      }
    },
    review: async (file, review): Promise<SubmitResult> => {
      const { space, rel } = locate(file);
      try {
        const receipt = await call<Receipt>('POST', spaceUrl(space, 'reviews'), { path: rel, ...(review as object) });
        return { ok: true, receipt };
      } catch (error) {
        return { ok: false, error: refusal(error) };
      }
    },
    submissions: async folder => (await call<{ submissions?: Receipt[] }>('GET', spaceUrl(locate(folder).space, 'submissions'))).submissions ?? [],
    submission: async (folder, id) => call<Receipt>('GET', spaceUrl(locate(folder).space, 'submissions', { id })),
    policies: async folder => {
      const { space } = locate(folder);
      // The public space keeps no read records, so there is nothing to ask.
      if (space === 'public') return { space, folders: [], outstanding: 0 };
      return call<Policies>('GET', spaceUrl(space, 'acknowledgements'));
    },
    acknowledge: async (file, version) => {
      const { space, rel } = locate(file);
      await call('POST', spaceUrl(space, 'acknowledgements'), { path: rel, version });
    },
    readers: async folder => call<ReaderReport>('GET', spaceUrl(locate(folder).space, 'acknowledgements', { report: 'true' })),
  },

  app: {
    version: async () => import.meta.env.VITE_APP_VERSION ?? '',
    logFault: async (kind, message) => { console.error(`[${kind}]`, message); },
    openWindow: async path => {
      if (!path) return;
      const { root, rel } = locate(path);
      window.open(`/app${root.slice('/spaces'.length)}/${rel}`, '_blank', 'noopener');
    },
    openDefaultAppsSettings: () => notOnTheSite('Default apps'),
    openLogFolder: () => notOnTheSite('The log folder'),
    toggleDevtools: async () => {},
    setAttentionBadge: async () => {},
    changeNotes: async () => [],
    changeNote: () => notOnTheSite('Change notes'),
    checkForUpdates: () => notOnTheSite('Updates'),
    skipUpdate: async () => {},
    installUpdate: () => notOnTheSite('Updates'),
  },

  window: {
    setTitle: async title => { document.title = title.replace(/ - Slate Viewer$/, ' — Metatrash'); },
    setTheme: async () => {},
    show: async () => {},
    close: async () => {},
    destroy: async () => {},
    minimize: async () => {},
    toggleMaximize: async () => {},
    isMaximized: async () => false,
    onResized: async handler => {
      addEventListener('resize', handler);
      return () => removeEventListener('resize', handler);
    },
    onCloseRequested: async handler => {
      // A browser only lets a page ask "Leave site?", so this asks whenever the handler would keep it open.
      const onBefore = (event: BeforeUnloadEvent) => {
        let kept = false;
        void handler({ preventDefault: () => { kept = true; } });
        if (kept) event.preventDefault();
      };
      addEventListener('beforeunload', onBefore);
      return () => removeEventListener('beforeunload', onBefore);
    },
    setZoom: async zoom => { document.documentElement.style.setProperty('zoom', String(zoom)); },
    setMenu: async (_entries: MenuEntry[]) => {},
  },

  dialogs: {
    message: async (text, options) => (await dialog(text, options)) ?? '',
    openFiles: async (_filters: FileFilter[]) => { await dialog('Open files from the Files list on the left.'); return []; },
    openFolder: async () => { await dialog('Change Space is on your account page.'); return null; },
    saveFile: async options => {
      const root = watchedRoot;
      if (!root) { await dialog('Open a space first.'); return null; }
      const suggested = options.defaultPath?.startsWith(root + '/') ? options.defaultPath.slice(root.length + 1) : (options.defaultPath ?? 'Untitled.md').split('/').pop()!;
      const name = await dialog('Name in this space (folders with /):', { title: options.title ?? 'Save As' }, suggested);
      return name ? `${root}/${name.replace(/^\/+/, '')}` : null;
    },
  },

  opener: {
    url: async url => { window.open(url, '_blank', 'noopener'); },
    path: async path => { window.open(backend.files.url(path), '_blank', 'noopener'); },
    reveal: async () => {},
  },

  on: async (event, handler): Promise<Unlisten> => {
    const set = listeners.get(event) ?? new Set();
    listeners.set(event, set);
    set.add(handler as (payload: never) => void);
    return () => set.delete(handler as (payload: never) => void);
  },
};
