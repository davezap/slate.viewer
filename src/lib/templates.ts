/**
 * Markdown templates (Metatrash 0.103.0). A folder's .metatrash.json may list `templates`, the
 * Markdown files new files there can start from, and a `defaultTemplate` a plain New File starts
 * from. A leading / is the space root; any other path is from the folder whose settings name it.
 * Both are inherited (`inherit: true`).
 *
 * New files from a template start with its text, with {{@today}}, {{@now}}, {{@name}}, {{@email}}
 * and {{@title}} filled in; its front matter's `newName` names the new file and is left out of it.
 * On the website Metatrash makes the file (POST .../from-template); the desktop app makes it here,
 * the same way, and Metatrash Sync sends it. This file mirrors Metatrash's templates.go: keep the
 * two in step. No imports, so tests/templates.test.mjs can load it on its own.
 */

/** A folder's templates and default template, as paths in the space ("" when it has none). */
export interface FolderTemplates { templates: string[]; defaultTemplate: string }

export interface TemplateValues { today: string; now: string; name: string; email: string; title: string }

const PLACEHOLDER = /\{\{\s*@(today|now|name|email|title)\s*\}\}/g;
const TEMPLATE_ONLY_KEYS = new Set(['newName']);

const parentOf = (folder: string) => {
  const trimmed = folder.replace(/\/$/, '');
  const slash = trimmed.lastIndexOf('/');
  return slash < 0 ? '' : trimmed.slice(0, slash + 1);
};

/** A templates entry written in `folder` ("" or ending in /) as a space path, or "" above the root. */
export function resolveTemplate(folder: string, entry: string): string {
  if (entry.startsWith('/')) return entry.slice(1);
  const out: string[] = [];
  for (const part of (folder + entry).split('/')) {
    if (part === '..') {
      if (!out.length) return '';
      out.pop();
    } else if (part !== '.' && part !== '') out.push(part);
  }
  return out.join('/');
}

function settingsObject(text: string | null | undefined): Record<string, unknown> {
  if (!text) return {};
  try {
    const value = JSON.parse(text.replace(/^﻿/, ''));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

/**
 * `folder`'s templates ("" for the top of the space, otherwise ending in /), from `texts`: each
 * folder's settings text, by folder (missing folders inherit, as Metatrash makes them).
 */
export function templatesOf(texts: Map<string, string | null>, folder: string): FolderTemplates {
  const out: FolderTemplates = { templates: [], defaultTemplate: '' };
  let haveList = false, haveDefault = false;
  for (let f = folder; ; f = parentOf(f)) {
    const text = texts.get(f);
    const s = text == null ? (f === '' ? {} : { inherit: true }) : settingsObject(text);
    if (!haveList && Array.isArray(s.templates)) {
      haveList = true;
      out.templates = (s.templates as unknown[]).filter((e): e is string => typeof e === 'string').map(e => resolveTemplate(f, e)).filter(p => p !== '');
    }
    if (!haveDefault && typeof s.defaultTemplate === 'string') {
      haveDefault = true;
      out.defaultTemplate = s.defaultTemplate ? resolveTemplate(f, s.defaultTemplate) : '';
    }
    if (f === '' || s.inherit !== true || (haveList && haveDefault)) break;
  }
  return out;
}

/** The template's front matter `newName`, or "" (quoted values are unquoted). */
export function newNameOf(text: string): string {
  const lines = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').split('\n');
  if (lines.length < 2 || lines[0].trimEnd() !== '---') return '';
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trimEnd() === '---' || line.trimEnd() === '...') return '';
    const m = /^newName\s*:(.*)$/.exec(line);
    if (!m) continue;
    let value = m[1].trim();
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
      try { value = JSON.parse(value); } catch { /* left as written */ }
    } else if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1).replace(/''/g, "'");
    }
    return value;
  }
  return '';
}

export function fillTemplate(text: string, v: TemplateValues): string {
  return text.replace(PLACEHOLDER, (_, key: keyof TemplateValues) => v[key]);
}

/** A form template (a `form` key and no `submittedAt`) is filled in and sent, never copied. */
export function isFormTemplate(text: string): boolean {
  const lines = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').split('\n');
  if (lines.length < 2 || lines[0].trimEnd() !== '---') return false;
  let form = false, filed = false;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trimEnd() === '---' || line.trimEnd() === '...') return form && !filed;
    if (/^form\s*:/.test(line)) form = true;
    if (/^submittedAt\s*:/.test(line)) filed = true;
  }
  return false;
}

/** A filled-in newName as one file name: slashes and colons become hyphens, controls go. */
export function templateFileName(name: string): string {
  // eslint-disable-next-line no-control-regex
  let out = name.replace(/[/\\:]/g, '-').replace(/[\u0000-\u001f\u007f]/g, '').trim().replace(/^\.+|\.+$/g, '');
  if ([...out].length > 120) out = [...out].slice(0, 120).join('');
  return out.trim();
}

/** The new file's name from newName, before the folder's other files are checked; "" when none. */
export function suggestedName(text: string, v: Omit<TemplateValues, 'title'>): string {
  const pattern = newNameOf(text).trim();
  if (!pattern) return '';
  const filled = pattern.replace(PLACEHOLDER, (_, key: string) =>
    key === 'title' ? '' : key === 'now' ? v.now.replace(/:/g, '.') : (v as Record<string, string>)[key]);
  return templateFileName(filled);
}

/** Leaves template-only keys (newName) out of the front matter, and the block when it empties. */
export function stripTemplateKeys(text: string): string {
  text = text.replace(/^﻿/, '');
  const nl = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (lines.length < 2 || lines[0].trimEnd() !== '---') return text;
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trimEnd() === '---' || lines[i].trimEnd() === '...') { end = i; break; }
  }
  if (end < 0) return text;
  const kept: string[] = [];
  let skipping = false;
  for (const line of lines.slice(1, end)) {
    if (line !== '' && line[0] !== ' ' && line[0] !== '\t' && line[0] !== '#') {
      skipping = TEMPLATE_ONLY_KEYS.has(line.split(':')[0].trim());
    }
    if (!skipping) kept.push(line);
  }
  let rest = lines.slice(end + 1);
  if (kept.join('').trim() === '') {
    if (rest.length > 1 && rest[0].trim() === '') rest = rest.slice(1);
    return rest.join(nl);
  }
  return [lines[0], ...kept, lines[end], ...rest].join(nl);
}

/** The new file's text: the template with its fill-ins, without template-only keys. */
export function newFileText(template: string, v: TemplateValues): string {
  return fillTemplate(stripTemplateKeys(template), v);
}

/** The person's local date and time, as forms send them. */
export function localClock(at = new Date()): { today: string; now: string } {
  const two = (n: number) => String(n).padStart(2, '0');
  return { today: `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())}`, now: `${two(at.getHours())}:${two(at.getMinutes())}` };
}

/** A template's name in menus: its file name without .md. */
export const templateLabel = (path: string) => path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/i, '');
