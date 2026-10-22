// A folder's settings in a Metatrash space: its .metatrash.json, read into a form the Properties
// dialog can edit and written back. The rules mirror Metatrash's own checks (folder_config.go and
// locks.go, 0.46.0+), so a change Metatrash would refuse is caught here instead of failing quietly
// in Metatrash Sync. Writes from Slate Viewer go through Sync, so Metatrash counts them as a person's.
// Publishing (publishedVersion and the acknowledge service) follows Metatrash 0.48.0.

export const SETTINGS_FILE = '.metatrash.json';

export type LockLevel = '' | 'agents' | 'everyone';
export type LockKey = 'purpose' | 'children' | 'services' | 'inherit' | 'readOnly' | 'publishedVersion' | 'locked';
export const LOCK_KEYS: LockKey[] = ['purpose', 'children', 'readOnly', 'services', 'publishedVersion', 'inherit', 'locked'];
export type PushMode = 'agent' | 'auto' | 'review';

/** What each lockable key is, in the dialog's words. */
export const LOCK_KEY_LABELS: Record<LockKey, { title: string; about: string }> = {
  purpose: { title: 'Folder summary', about: 'The short summary on the General page.' },
  children: { title: 'File and subfolder descriptions', about: 'The descriptions on the General page.' },
  readOnly: { title: 'Read-only files', about: 'Which files are locked (the list above).' },
  services: { title: 'Connections and read tracking', about: 'The GitHub repository, and asking people to confirm they read the published files.' },
  publishedVersion: { title: 'Published version', about: 'Who can publish a new version of this folder.' },
  inherit: { title: 'Use the parent folder\'s settings', about: 'Whether this folder takes its parent\'s settings.' },
  locked: { title: 'This list of locked settings', about: 'Agents can never change it; people always can, so every lock can be lifted.' },
};

const MAX_PURPOSE = 2000;
const MAX_CHILDREN = 200;
const MAX_CHILD_TEXT = 1000;
const MAX_LOCKS = 200;
const KNOWN_KEYS = ['inherit', 'purpose', 'children', 'locked', 'readOnly', 'publishedVersion', 'services', 'actions'];
export const MAX_PUBLISHED_VERSION = 1_000_000;
const MAX_ACKNOWLEDGE_FILES = 50;

const CHILD_NAME = /^[A-Za-z0-9._][A-Za-z0-9._-]*\/?$/;
const GITHUB_REPO = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/;
const GIT_BRANCH = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/;

export interface GithubService { repo: string; branch: string; push: PushMode | ''; pull: string }
/** Asks everyone in the space to confirm they read the published files: `files` empty means every .md file. */
export interface AcknowledgeService { files: string[] }

/** The editable form of one folder's settings. Empty text or lists mean "not set". */
export interface FolderSettings {
  inherit: boolean;
  purpose: string;
  children: { name: string; text: string }[];
  /** Whether this folder sets its own `locked`; when it inherits and doesn't, its parent's apply. */
  ownLocks: boolean;
  locked: Record<LockKey, LockLevel>;
  readOnly: { name: string; level: 'agents' | 'everyone' }[];
  github: GithubService | null;
  /** The published version, or null when the folder doesn't publish. Publishing raises it. */
  publishedVersion: number | null;
  acknowledge: AcknowledgeService | null;
}

/** One folder's settings file: `folder` is "" for the root or "notes/" style. */
export interface SettingsFile {
  folder: string;
  /** The text on disk, or null when the folder has no file (it then starts as Metatrash makes it). */
  text: string | null;
}

/** The text a missing settings file stands for: what Metatrash gives a new folder. */
export const defaultSettingsText = (folder: string) => (folder === '' ? '{}\n' : '{"inherit": true}\n');

export const parentFolder = (folder: string) => {
  const trimmed = folder.replace(/\/$/, '');
  const slash = trimmed.lastIndexOf('/');
  return slash < 0 ? '' : trimmed.slice(0, slash + 1);
};

/** `folder` and every folder above it, ending with the root (""). */
export function folderChain(folder: string): string[] {
  const chain = [folder];
  while (chain[chain.length - 1] !== '') chain.push(parentFolder(chain[chain.length - 1]));
  return chain;
}

/** JSON with object keys sorted, so equal values compare equal however they were written. */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Parses a settings file into a plain object, or explains why it can't be. */
export function parseObject(text: string): Record<string, unknown> | string {
  let value: unknown;
  try {
    value = JSON.parse(text.replace(/^﻿/, ''));
  } catch (e) {
    return `It isn't valid JSON (${e instanceof Error ? e.message : String(e)}).`;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'It should be one JSON object, { … }.';
  return value as Record<string, unknown>;
}

/** A `locked` or `readOnly` value as a map of name to level; a list means "agents" for each name. */
export function lockMap(value: unknown): Record<string, string> {
  if (Array.isArray(value)) return Object.fromEntries(value.filter(v => typeof v === 'string').map(v => [v, 'agents']));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, v]) => typeof v === 'string')) as Record<string, string>;
  }
  return {};
}

const emptyLocks = (): Record<LockKey, LockLevel> => ({ purpose: '', children: '', services: '', inherit: '', readOnly: '', publishedVersion: '', locked: '' });

/** The form for a settings object. */
export function toSettings(raw: Record<string, unknown>): FolderSettings {
  const locked = emptyLocks();
  for (const [key, level] of Object.entries(lockMap(raw.locked))) {
    if (key in locked && (level === 'agents' || level === 'everyone')) locked[key as LockKey] = level;
  }
  const children = raw.children && typeof raw.children === 'object' && !Array.isArray(raw.children)
    ? Object.entries(raw.children as Record<string, unknown>).map(([name, text]) => ({ name, text: String(text ?? '') }))
    : [];
  const readOnly = Object.entries(lockMap(raw.readOnly))
    .map(([name, level]) => ({ name, level: level === 'everyone' ? 'everyone' as const : 'agents' as const }));
  const services = Array.isArray(raw.services) ? raw.services as Record<string, unknown>[] : [];
  const gh = services.find(s => s && s.type === 'github');
  const ack = services.find(s => s && s.type === 'acknowledge');
  return {
    inherit: raw.inherit === true,
    purpose: typeof raw.purpose === 'string' ? raw.purpose : '',
    children,
    ownLocks: 'locked' in raw,
    locked,
    readOnly,
    github: gh
      ? { repo: String(gh.repo ?? ''), branch: String(gh.branch ?? ''), push: (['agent', 'auto', 'review'].includes(String(gh.push)) ? gh.push : '') as PushMode | '', pull: String(gh.pull ?? '') }
      : null,
    publishedVersion: typeof raw.publishedVersion === 'number' ? raw.publishedVersion : null,
    acknowledge: ack ? { files: Array.isArray(ack.files) ? (ack.files as unknown[]).map(String) : [] } : null,
  };
}

/** The value each key of the form writes, or undefined to leave the key out. */
function keyValues(s: FolderSettings, isRoot: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!isRoot && s.inherit) out.inherit = true;
  if (s.purpose.trim()) out.purpose = s.purpose;
  const children = s.children.filter(c => c.name.trim());
  if (children.length) out.children = Object.fromEntries(children.map(c => [c.name.trim(), c.text]));
  const locks = Object.entries(s.locked).filter(([, level]) => level);
  // With inherit, a folder that sets no locks of its own uses its parent's; an empty map overrides them.
  const inheritsLocks = !isRoot && s.inherit && !s.ownLocks;
  if (!inheritsLocks && (locks.length || (s.inherit && !isRoot))) out.locked = Object.fromEntries(locks);
  const readOnly = s.readOnly.filter(r => r.name.trim());
  if (readOnly.length) out.readOnly = Object.fromEntries(readOnly.map(r => [r.name.trim(), r.level]));
  const services: Record<string, unknown>[] = [];
  if (s.github) {
    const svc: Record<string, string> = { type: 'github', repo: s.github.repo.trim() };
    if (s.github.branch.trim()) svc.branch = s.github.branch.trim();
    if (s.github.push) svc.push = s.github.push;
    if (s.github.pull) svc.pull = s.github.pull;
    services.push(svc);
  }
  if (s.acknowledge) {
    const files = s.acknowledge.files.map(f => f.trim()).filter(Boolean);
    services.push(files.length ? { type: 'acknowledge', files } : { type: 'acknowledge' });
  }
  if (services.length) out.services = services;
  if (s.publishedVersion !== null) out.publishedVersion = s.publishedVersion;
  return out;
}

/** How a key's value compares: `locked` and `readOnly` lists equal the maps they stand for. */
function comparable(key: string, value: unknown): string {
  return stableJson(key === 'locked' || key === 'readOnly' ? lockMap(value) : value);
}

/**
 * The settings object to write: the form's keys, in the order the file had them (new ones after),
 * with keys the dialog doesn't know kept as they are. A key whose meaning didn't change keeps the
 * value as written (a 0.45.0 `locked` list stays a list), so nothing changes that wasn't edited.
 */
export function toObject(s: FolderSettings, original: Record<string, unknown>, isRoot: boolean): Record<string, unknown> {
  const values = keyValues(s, isRoot);
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(original)) {
    if (!KNOWN_KEYS.includes(key) || key === 'actions') { out[key] = original[key]; continue; }
    if (!(key in values)) continue;
    out[key] = comparable(key, values[key]) === comparable(key, original[key]) ? original[key] : values[key];
  }
  for (const key of ['inherit', 'purpose', 'children', 'locked', 'readOnly', 'publishedVersion', 'services']) {
    if (key in values && !(key in out)) out[key] = values[key];
  }
  return out;
}

/** The file text for a settings object: two-space JSON with a final newline. */
export const toText = (value: Record<string, unknown>) => JSON.stringify(value, null, 2) + '\n';

// ---- Effective settings and locks ------------------------------------------------

/** Top-level keys of a settings text, each as comparable JSON (as Metatrash's configKeys). */
function textKeys(text: string): Record<string, string> {
  const raw = parseObject(text);
  if (typeof raw === 'string') return {};
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, stableJson(v)]));
}

/** Where each setting a folder sees comes from (the folder itself or one above it). */
export interface Effective { keys: Record<string, string>; from: Record<string, string> }

/**
 * A folder's settings with inherited ones filled in, as Metatrash's effectiveSettings: `texts` maps
 * a folder to its settings text (missing folders start as Metatrash makes them). Services,
 * readOnly, publishedVersion and inherit itself are never inherited.
 */
export function effectiveSettings(texts: Map<string, string | null>, folder: string): Effective {
  const own = texts.get(folder) ?? defaultSettingsText(folder);
  const keys = textKeys(own);
  const from = Object.fromEntries(Object.keys(keys).map(k => [k, folder]));
  if (folder === '' || keys.inherit !== 'true') return { keys, from };
  const parent = effectiveSettings(texts, parentFolder(folder));
  for (const [k, v] of Object.entries(parent.keys)) {
    if (!(k in keys) && k !== 'services' && k !== 'readOnly' && k !== 'publishedVersion' && k !== 'inherit') {
      keys[k] = v;
      from[k] = parent.from[k];
    }
  }
  return { keys, from };
}

/** The locks a folder's settings are under (its own `locked`, or its parent's when it inherits it). */
export function effectiveLocks(eff: Effective): Record<string, LockLevel> {
  if (!eff.keys.locked) return {};
  const map = lockMap(JSON.parse(eff.keys.locked));
  return Object.fromEntries(Object.entries(map).filter(([, l]) => l === 'agents' || l === 'everyone')) as Record<string, LockLevel>;
}

/**
 * Keys a person can't change in this folder now: locked for everyone by the settings as they are
 * on disk. `locked` itself never is, so a person can always lift a lock (and change the key after).
 */
export function frozenKeys(texts: Map<string, string | null>, folder: string): Map<string, string> {
  const eff = effectiveSettings(texts, folder);
  const frozen = new Map<string, string>();
  for (const [key, level] of Object.entries(effectiveLocks(eff))) {
    if (level === 'everyone' && key !== 'locked') frozen.set(key, eff.from.locked ?? folder);
  }
  return frozen;
}

// ---- Checks ----------------------------------------------------------------------------

/** A Go path.Match pattern Metatrash would refuse: an unclosed `[` or a trailing `\`. */
function badPattern(pattern: string): boolean {
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === '\\') { if (++i >= pattern.length) return true; }
    else if (pattern[i] === '[') {
      const end = pattern.indexOf(']', i + 2);
      if (end < 0) return true;
      i = end;
    }
  }
  return false;
}

/** A readOnly name as a regular expression for matching file and folder names. */
export function patternRegex(pattern: string): RegExp | null {
  if (badPattern(pattern)) return null;
  let out = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*') out += '[^/]*';
    else if (c === '?') out += '[^/]';
    else if (c === '\\') out += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    else if (c === '[') {
      const end = pattern.indexOf(']', i + 2);
      // A ] straight after [ is a literal, as in Go.
      out += `[${pattern.slice(i + 1, end).replace(/^(\^?)\]/, '$1\\]')}]`;
      i = end;
    } else out += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  try { return new RegExp(`^${out}$`); } catch { return null; }
}

/** Files (relative to the space, with /) a readOnly entry of `folder` locks. */
export function lockedBy(entry: string, folder: string, files: string[]): string[] {
  const isFolder = entry.endsWith('/');
  const re = patternRegex(isFolder ? entry.slice(0, -1) : entry);
  if (!re) return [];
  return files.filter(f => {
    if (!f.startsWith(folder)) return false;
    const rest = f.slice(folder.length);
    const slash = rest.indexOf('/');
    if (isFolder !== slash >= 0) return false;
    return re.test(slash < 0 ? rest : rest.slice(0, slash));
  });
}

/** What the dialog needs to know about the rest of the space. */
export interface SpaceContext {
  /** Settings texts of the folder and every folder above it (null: no file yet). */
  texts: Map<string, string | null>;
  /** Folders ("notes/" style) of the space that have a GitHub service, as saved. */
  githubFolders: string[];
  /** Every file in the space, relative with /, hidden ones included. */
  files: string[];
  /** The public space can't have services (only account-owned spaces can). */
  publicSpace: boolean;
}

/** One problem with the form, and the dialog page it is on. */
export interface Problem { page: 'general' | 'security' | 'connections' | 'publishing'; text: string }

const hasDotName = (path: string) => path.split('/').some((seg, i, all) => seg.startsWith('.') && !(i === all.length - 1 && seg === SETTINGS_FILE));

/** Every reason Metatrash would refuse the settings `text` for `folder` written by a person. */
export function check(s: FolderSettings, text: string, folder: string, ctx: SpaceContext): Problem[] {
  const problems: Problem[] = [];
  const isRoot = folder === '';
  if (s.purpose.length > MAX_PURPOSE) problems.push({ page: 'general', text: `The summary is ${s.purpose.length} characters; ${MAX_PURPOSE} is the most.` });
  const children = s.children.filter(c => c.name.trim() || c.text.trim());
  if (children.length > MAX_CHILDREN) problems.push({ page: 'general', text: `There are ${children.length} descriptions; ${MAX_CHILDREN} is the most.` });
  const names = new Set<string>();
  for (const c of children) {
    const name = c.name.trim();
    const bare = name.replace(/\/$/, '');
    if (!name) problems.push({ page: 'general', text: 'A description has no file or folder name.' });
    else if (name.length > 240 || !CHILD_NAME.test(name) || bare === '.' || bare === '..' || /^\.git\.*$/i.test(bare)) {
      problems.push({ page: 'general', text: `"${name}" should be one file name, or a folder name ending in / (letters, digits, dots, dashes and underscores).` });
    } else if (names.has(name)) problems.push({ page: 'general', text: `"${name}" is described twice.` });
    names.add(name);
    if (c.text.length > MAX_CHILD_TEXT) problems.push({ page: 'general', text: `The description of "${name}" is over ${MAX_CHILD_TEXT} characters.` });
  }

  const readOnly = s.readOnly.filter(r => r.name.trim());
  if (readOnly.length > MAX_LOCKS) problems.push({ page: 'security', text: `There are ${readOnly.length} read-only entries; ${MAX_LOCKS} is the most.` });
  const entries = new Set<string>();
  for (const r of readOnly) {
    const entry = r.name.trim();
    const name = entry.replace(/\/$/, '');
    if (!name || entry.length > 240 || name.includes('/') || name.includes('\\') || name === '.' || name === '..') {
      problems.push({ page: 'security', text: `"${entry}" should be one file name or pattern in this folder (plan.md, *.pdf) or a subfolder ending in / (archive/).` });
    } else if (badPattern(name)) problems.push({ page: 'security', text: `"${entry}" isn't a valid pattern (check its [ ] brackets).` });
    else if (entries.has(entry)) problems.push({ page: 'security', text: `"${entry}" is listed twice.` });
    entries.add(entry);
  }
  if (s.readOnly.some(r => !r.name.trim())) problems.push({ page: 'security', text: 'A read-only entry has no name.' });

  if (s.github) {
    const { repo, branch } = s.github;
    const b = branch.trim();
    if (isRoot) problems.push({ page: 'connections', text: 'The top of a space can\'t mirror a repository; use a folder.' });
    else if (ctx.publicSpace) problems.push({ page: 'connections', text: 'Only your own spaces can mirror a GitHub repository.' });
    if (!GITHUB_REPO.test(repo.trim()) || /\/\.\.?$/.test(repo.trim())) problems.push({ page: 'connections', text: 'The repository should be owner/name, for example dave-zap/website.' });
    if (b && (!GIT_BRANCH.test(b) || b.includes('..') || b.includes('//') || b.endsWith('/') || b.endsWith('.') || b.endsWith('.lock'))) {
      problems.push({ page: 'connections', text: `"${b}" isn't a valid branch name.` });
    }
    for (const other of ctx.githubFolders) {
      if (other === folder) continue;
      if (other.startsWith(folder)) problems.push({ page: 'connections', text: `${other} inside this folder already mirrors a repository, and GitHub folders can't nest. Choose a folder that doesn't contain it.` });
      else if (folder.startsWith(other)) problems.push({ page: 'connections', text: `This folder is inside ${other}, which already mirrors a repository. Put this one beside it instead, for example in dependencies/.` });
    }
  } else if (ctx.githubFolders.includes(folder)) {
    const dotted = ctx.files.find(f => f.startsWith(folder) && hasDotName(f.slice(folder.length)));
    if (dotted) problems.push({ page: 'connections', text: `This folder holds ${dotted}. Names starting with a dot are allowed only in GitHub folders, so move or delete such files before removing the repository.` });
  }

  if (s.publishedVersion !== null) {
    const v = s.publishedVersion;
    const saved = toSavedVersion(ctx.texts.get(folder) ?? null);
    if (!Number.isInteger(v) || v < 1 || v > MAX_PUBLISHED_VERSION) problems.push({ page: 'publishing', text: `The published version should be a whole number from 1 to ${MAX_PUBLISHED_VERSION}.` });
    else if (saved !== null && v < saved) problems.push({ page: 'publishing', text: `The published version only goes up: it is ${saved}, so publish the next version as ${saved + 1}.` });
  }
  if (s.acknowledge) {
    if (ctx.publicSpace) problems.push({ page: 'publishing', text: 'Only your own spaces can track who has read the published files.' });
    const files = s.acknowledge.files.map(f => f.trim()).filter(Boolean);
    if (files.length > MAX_ACKNOWLEDGE_FILES) problems.push({ page: 'publishing', text: `There are ${files.length} files to read; ${MAX_ACKNOWLEDGE_FILES} entries is the most.` });
    for (const entry of files) {
      const name = entry.replace(/\/$/, '');
      if (!name || entry.length > 240 || name.includes('/') || name.includes('\\') || name === '.' || name === '..' || badPattern(name)) {
        problems.push({ page: 'publishing', text: `"${entry}" should be one file name or pattern in this folder (leave.md, *.md) or a subfolder ending in / (hr/).` });
      }
    }
  }

  // Locks for everyone guard the values the folder sees, inherited ones included.
  const after = new Map(ctx.texts);
  after.set(folder, text);
  const before = effectiveSettings(ctx.texts, folder);
  const now = effectiveSettings(after, folder);
  for (const [key, where] of frozenKeys(ctx.texts, folder)) {
    if (before.keys[key] === now.keys[key]) continue;
    const label = key in LOCK_KEY_LABELS ? LOCK_KEY_LABELS[key as LockKey].title : key;
    problems.push({
      page: key === 'services' ? 'connections' : key === 'publishedVersion' ? 'publishing' : key === 'readOnly' || key === 'inherit' ? 'security' : 'general',
      text: where === folder
        ? `"${label}" is locked for everyone, so it can't change. Set its lock to Unlocked or Agents on the Security page, save, and change it once that has synced.`
        : `"${label}" is locked for everyone by ${where || 'the top of the space'}, so this folder can't change it. Lift the lock in that folder's properties first.`,
    });
  }
  return problems;
}

/** The publishedVersion of a settings text as saved, or null. */
export function toSavedVersion(text: string | null): number | null {
  const raw = text === null ? null : parseObject(text);
  return raw && typeof raw === 'object' && typeof raw.publishedVersion === 'number' ? raw.publishedVersion : null;
}

/**
 * The settings text with the next version published (`publishedVersion` one higher, or 1), and
 * optionally an acknowledge service added; every other key stays exactly as it was. Throws when
 * the file isn't valid settings.
 */
export function publishText(text: string | null, folder: string, askToRead: boolean): string {
  const raw = parseObject(text ?? defaultSettingsText(folder));
  if (typeof raw === 'string') throw new Error(`${folder}${SETTINGS_FILE} can't be read as settings. ${raw}`);
  const current = typeof raw.publishedVersion === 'number' ? raw.publishedVersion : 0;
  const out: Record<string, unknown> = { ...raw, publishedVersion: current + 1 };
  if (askToRead) {
    const services = Array.isArray(raw.services) ? [...raw.services as Record<string, unknown>[]] : [];
    if (!services.some(s => s && s.type === 'acknowledge')) services.push({ type: 'acknowledge' });
    out.services = services;
  }
  return toText(out);
}
