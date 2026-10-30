// Metatrash spaces: what the user typed into Open Space…, and the rules for files in a space.
// See "Integrating a desktop editor with Metatrash spaces through mtsync" (sections 5 and 7).

import { backend } from './backend';

export const DEFAULT_SERVER = 'https://metatrash.com';

export interface SpaceRef {
  /** Origin of the metatrash server. */
  server: string;
  /** `owner/slug`, or `public`. */
  space: string;
  /** A path inside the space ('' for the root); a folder when it ends in '/'. */
  path: string;
}

/**
 * Accepts `https://metatrash.com/spaces/owner/slug/path…`, `…/spaces/public/path…`,
 * or the same without the site (`owner/slug[/path]`, `public[/path]`).
 */
export function parseSpaceRef(input: string): SpaceRef | string {
  let text = input.trim();
  if (!text) return 'Type a space name or paste its address.';
  let server = DEFAULT_SERVER;

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
    let url: URL;
    try { url = new URL(text); } catch { return 'That address doesn\'t look right.'; }
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) return 'Space addresses start with https://.';
    if (!url.pathname.startsWith('/spaces/')) return 'That isn\'t a space address (it should contain /spaces/).';
    server = url.origin;
    text = decodeURIComponent(url.pathname.slice('/spaces/'.length));
  }

  const parts = text.replace(/^\/+/, '').split('/');
  const trailingSlash = text.endsWith('/');
  const segments = parts.filter(Boolean);
  let space: string;
  let rest: string[];
  if (segments[0] === 'public') {
    space = 'public';
    rest = segments.slice(1);
  } else {
    if (segments.length < 2) return 'Use owner/space, for example dave-zap/notes.';
    space = `${segments[0]}/${segments[1]}`;
    rest = segments.slice(2);
  }
  if (!/^(public|[a-z0-9][a-z0-9-]{0,47}\/[a-z0-9][a-z0-9-]{0,47})$/.test(space)) return `"${space}" isn't a space name.`;
  const path = rest.length ? rest.join('/') + (trailingSlash ? '/' : '') : '';
  return { server, space, path };
}

/** The default local folder for a space: ~/Metatrash/<owner>/<slug> (or ~/Metatrash/public). */
export function defaultSpaceFolder(home: string, space: string): string {
  const sep = home.includes('\\') ? '\\' : '/';
  return [home.replace(/[\\/]+$/, ''), 'Metatrash', ...space.split('/')].join(sep);
}

/** Folders kept in sync by another tool, which would fight mtsync over renames and locks. */
export function isCloudSyncedFolder(folder: string): boolean {
  return /[\\/](OneDrive[^\\/]*|Dropbox|iCloud ?Drive|iCloudDrive|Google Drive)([\\/]|$)/i.test(folder);
}

// ---- Files in a space ----------------------------------------------------------

export const SPACE_FILE_LIMIT = 64 * 1024;

const SEGMENT = /^[A-Za-z0-9_.][A-Za-z0-9._-]*$/;

/** Why `relative` (a path inside the space, with /) can't be stored in a space, or null if it can. */
export function spacePathProblem(relative: string): string | null {
  if (relative.length > 240) return 'The path is longer than 240 characters.';
  // eslint-disable-next-line no-control-regex
  if (/[^\x00-\x7f]/.test(relative)) return 'Names in a space can only use plain ASCII letters.';
  const segments = relative.split('/');
  if (segments.length > 8) return 'Spaces allow at most 8 folder levels.';
  for (const segment of segments) {
    if (!SEGMENT.test(segment)) {
      return /\s/.test(segment)
        ? 'Names in a space can\'t contain spaces.'
        : `"${segment}" can only use letters, digits, dots, dashes and underscores.`;
    }
    if (segment.startsWith('.') && segment !== '.metatrash.json') return 'Names in a space can\'t start with a dot.';
  }
  return null;
}

/** A name that a space accepts: "My Note!" → "my-note". */
export function spaceSafeName(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|-+$/g, '');
  return slug || 'note';
}

/** `plan.conflict-20261016-140211.md` → the file it conflicts with (`plan.md`), else null. */
export function conflictOriginal(fileName: string): string | null {
  const match = /^(.+)\.conflict-(\d{8}-\d{6})(\.[^./]+)?$/.exec(fileName);
  return match ? match[1] + (match[3] ?? '') : null;
}

// ---- mtsync --------------------------------------------------------------------

/** A `.metatrash.json` description: `folder` is "" for the root or "notes/" style. */
export interface FolderDescription {
  folder: string;
  purpose: string | null;
  children: Record<string, string>;
  github: boolean;
  /** Locked files: a name, pattern (`*.pdf`) or subfolder (`archive/`) to "agents" or "everyone". */
  readOnly: Record<string, string>;
  /** The folder's published version (`publishedVersion`, Metatrash 0.48.0), or null when it doesn't publish. */
  publishedVersion?: number | null;
  /** People are asked to confirm they read the published files (an acknowledge service). */
  acknowledge?: boolean;
}

/** A Go path.Match pattern (`*`, `?`, `[a-z]`, `\\` escapes) as a regular expression. */
function globRegex(pattern: string): RegExp {
  let out = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*') out += '[^/]*';
    else if (c === '?') out += '[^/]';
    else if (c === '\\' && i + 1 < pattern.length) out += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    else if (c === '[') {
      const end = pattern.indexOf(']', i + 1);
      if (end < 0) return /$^/;
      out += `[${pattern.slice(i + 1, end)}]`;
      i = end;
    } else out += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${out}$`);
}

/**
 * The lock Metatrash puts on a space file (`readOnly` in the `.metatrash.json` of a folder holding it):
 * "everyone" (nobody can change it, people included), "agents" (only agents are stopped) or null.
 * A `.metatrash.json` is never locked for everyone, so its locks can always be lifted.
 */
export function fileLock(descriptions: FolderDescription[], relative: string): 'agents' | 'everyone' | null {
  let level: 'agents' | 'everyone' | null = null;
  for (const d of descriptions) {
    if (!relative.startsWith(d.folder)) continue;
    const rest = relative.slice(d.folder.length);
    const slash = rest.indexOf('/');
    const name = slash < 0 ? rest : rest.slice(0, slash);
    for (const [entry, l] of Object.entries(d.readOnly ?? {})) {
      const isFolder = entry.endsWith('/');
      if (isFolder !== slash >= 0 || !globRegex(isFolder ? entry.slice(0, -1) : entry).test(name)) continue;
      if (l === 'everyone') level = 'everyone';
      else if (l === 'agents' && level === null) level = 'agents';
    }
  }
  if (level === 'everyone' && relative.split('/').pop() === '.metatrash.json') level = 'agents';
  return level;
}

/** One line of `mtsync -json virtual` (mtsync 0.61.0): a file the space keeps outside Git. */
export interface VirtualFile {
  /** Path in the space folder, with /. */
  path: string;
  /** The file on this computer. */
  file: string;
  type: string;
  size: number;
  sha256: string;
  /** The space has text for it (a PDF or Word file's Markdown), which Convert to Markdown saves. */
  text: boolean;
  /** Where it is fetched from: such a file can't be changed here. */
  source?: string;
  refresh?: string;
}

/** Virtual files whose text is Markdown made from them, which Convert to Markdown can save. */
const CONVERTIBLE = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/html',
  'application/xhtml+xml',
]);
export const canConvert = (v: VirtualFile) => v.text && CONVERTIBLE.has(v.type);

/** "2.4 MB", for a virtual file's tooltip. */
export function sizeLabel(bytes: number): string {
  if (bytes >= 1 << 20) return `${(bytes / (1 << 20)).toFixed(1)} MB`;
  if (bytes >= 1 << 10) return `${(bytes / (1 << 10)).toFixed(1)} KB`;
  return `${bytes} bytes`;
}

export interface MtsyncInfo {
  path: string | null;
  version: string | null;
  supported: boolean;
  minVersion: string;
  installHint: string;
}

export interface SpaceRow { space: string; access: string; name: string }
/** mtsync -json whoami: account is '' when the server is older than Metatrash 0.49.1. */
export interface Whoami { server: string; signedIn: boolean; account: string }
export interface Registration { folder: string; space: string; state: string; server: string | null }
export interface MtsyncOutput { ok: boolean; stdout: string; stderr: string }

const serverArg = (server: string) => (server === DEFAULT_SERVER ? null : server);

export const mtsync = {
  info: () => backend.sync.info(),
  /** Downloads mtsync from the latest Metatrash release (checksum checked), installs it and starts its service. */
  setup: () => backend.sync.setup(),
  spaces: (server = DEFAULT_SERVER) => backend.sync.spaces(serverArg(server)),
  list: () => backend.sync.list(),
  /** Who this computer signs in as, or null when mtsync (before 0.49.1) or the server can't say. */
  whoami: async (server = DEFAULT_SERVER): Promise<Whoami | null> => {
    const text = await backend.sync.whoami(serverArg(server));
    if (!text) return null;
    try { return JSON.parse(text) as Whoami; } catch { return null; }
  },
  add: (space: string, folder: string, server = DEFAULT_SERVER) =>
    backend.sync.add(space, folder, serverArg(server)),
  start: () => backend.sync.start(),
  log: (lines = 100) => backend.sync.log(lines),
  /** Asks the running service to sync `folder` now (mtsync 0.70.0). */
  syncNow: (folder: string) => backend.sync.syncNow(folder),
  /** The virtual files in a synced folder; empty with an mtsync before 0.61.0. */
  virtual: (folder: string) => backend.sync.virtual(folder),
  /** The space's text for a synced file (a PDF's Markdown). */
  text: (file: string) => backend.sync.text(file),
  login: (server = DEFAULT_SERVER) => backend.sync.login(serverArg(server)),
  cancelLogin: () => backend.sync.cancelLogin(),
};

export const isSignedOut = (message: string) => /signed out|mtsync login/i.test(message);

/** Same folder, ignoring slash direction, trailing slashes and (on Windows/macOS) case. */
export function sameFolder(a: string, b: string): boolean {
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  return norm(a) === norm(b);
}

/** The registration for `space` on `server`, if this computer already syncs it. */
export function findRegistration(list: Registration[], space: string, server: string): Registration | undefined {
  return list.find(r => r.space === space && (r.server ?? DEFAULT_SERVER) === server);
}

/** A short status for the title bar, from `mtsync list`'s state text. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** When mtsync last finished a pass ("in sync, checked Jan 2 15:04:05", local time), or null. */
export function lastSyncTime(state: string, now = new Date()): number | null {
  const m = /^in sync, checked (\w{3}) (\d{1,2}) (\d{1,2}):(\d{2}):(\d{2})/.exec(state);
  const month = m ? MONTHS.indexOf(m[1]) : -1;
  if (!m || month < 0) return null;
  const at = new Date(now.getFullYear(), month, +m[2], +m[3], +m[4], +m[5]);
  // No year in the state: a date ahead of now was last year (checked Dec 31, read Jan 1).
  if (at.getTime() > now.getTime() + 86_400_000) at.setFullYear(at.getFullYear() - 1);
  return at.getTime();
}

export function describeState(state: string): { label: string; tone: 'ok' | 'busy' | 'warn' | 'error' } {
  const checked = /^in sync, checked .*?(\d{1,2}:\d{2})(?::\d{2})?\s*$/.exec(state);
  if (checked) return { label: `Synced · ${checked[1]}`, tone: 'ok' };
  if (state.startsWith('in sync')) return { label: 'Synced', tone: 'ok' };
  if (state.startsWith('starting')) return { label: 'Syncing…', tone: 'busy' };
  if (state.startsWith('service not running')) return { label: 'Sync not running', tone: 'error' };
  if (state.startsWith('error')) return { label: isSignedOut(state) ? 'Signed out' : 'Sync error', tone: 'error' };
  return { label: state || 'Unknown', tone: 'warn' };
}

/** mtsync 0.70.0 has `mtsync sync`, for Sync now. */
export const SYNC_NOW_VERSION = '0.70.0';

/** "mtsync 0.70.0" (as `mtsync version` prints it) is at least `min`. */
export function versionAtLeast(version: string | null, min: string): boolean {
  const parts = (text: string) => /(\d+)\.(\d+)\.(\d+)/.exec(text)?.slice(1).map(Number);
  const have = version ? parts(version) : undefined;
  const want = parts(min)!;
  if (!have) return false;
  for (let i = 0; i < 3; i++) if (have[i] !== want[i]) return have[i] > want[i];
  return true;
}

/** One line of the mtsync service log. */
export interface SyncLogLine {
  /** "09:45:12", or "Oct 29 09:45" for an earlier day. */
  when: string;
  /** The space the line is about, or null for the service itself. */
  space: string | null;
  text: string;
}

/**
 * The service log's lines ("2026/10/30 09:45:12 [owner/slug] uploaded notes.md") about `space`
 * or the service itself, oldest first. Lines without a time (the header) are left out.
 */
export function parseSyncLog(log: string, space: string, now = new Date()): SyncLogLine[] {
  const out: SyncLogLine[] = [];
  for (const raw of log.split(/\r?\n/)) {
    const m = /^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}:\d{2}:\d{2}) (?:\[([^\]]+)\] )?(.*)$/.exec(raw);
    if (!m) continue;
    const lineSpace = m[5] ?? null;
    if (lineSpace !== null && lineSpace !== space) continue;
    const today = +m[1] === now.getFullYear() && +m[2] === now.getMonth() + 1 && +m[3] === now.getDate();
    const when = today ? m[4] : `${MONTHS[+m[2] - 1] ?? m[2]} ${+m[3]} ${m[4].slice(0, 5)}`;
    out.push({ when, space: lineSpace, text: m[6] });
  }
  return out;
}
