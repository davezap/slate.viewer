// A space file's version history, through `mtsync history -json` and `mtsync show` (mtsync 0.41.0).

import { backend } from './backend';

export interface HistoryEntry {
  /** The Git commit (40 hex characters) to pass to `mtsync show`. */
  revision: string;
  /** The file's path in the space at that revision. */
  path: string;
  operation: 'create' | 'write' | 'move' | 'delete' | string;
  /** UTC, RFC 3339. */
  timestamp: string;
  /** Where that revision's path is in the synced folder; absent when it was outside it. */
  file?: string;
  /** Who made the change (Metatrash 0.47.0 and mtsync 0.47.0; absent on older changes). */
  by?: ChangeAuthor;
  /** The folder versions that published this text (Metatrash 0.48.0); absent for drafts. */
  published?: number[];
}

/** An account name, the app it worked through, and whether a person or an agent made the change. */
export interface ChangeAuthor { name?: string; app?: string; kind: 'person' | 'agent' | string }

/** "dave" for a person's change, "Claude (agent) for dave" or "space key (agent)" for an agent's, or null. */
export function describeAuthor(by: ChangeAuthor | undefined): string | null {
  if (!by) return null;
  if (by.kind === 'person') return by.name || by.app || 'a person';
  const agent = `${by.app || 'an agent'} (agent)`;
  return by.name ? `${agent} for ${by.name}` : agent;
}

export interface HistoryPage {
  space: string;
  folder: string;
  id: string;
  entries: HistoryEntry[];
  /** The offset of the next (older) page, or null at the end. */
  nextOffset: number | null;
}

export const HISTORY_PAGE = 20;

export async function fileHistory(file: string, offset = 0): Promise<HistoryPage> {
  return backend.sync.history(file, HISTORY_PAGE, offset);
}

/** The file's text at `entry`, as stored in the space. */
export function revisionText(entry: HistoryEntry, fallbackFile: string): Promise<string> {
  return backend.sync.show(entry.file ?? fallbackFile, entry.revision);
}

const dateFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });

/** "17 Oct 2026, 14:02" in local time. */
export function formatWhen(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return `${dateFormat.format(date)}, ${timeFormat.format(date)}`;
}

/** A short name for a version, used on Slate's compare buttons ("Use 17 Oct 14:02"). */
export function versionLabel(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'Earlier version';
  const sameYear = date.getFullYear() === new Date().getFullYear();
  const day = new Intl.DateTimeFormat(undefined, sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
  return `${day.format(date)} ${timeFormat.format(date)}`;
}

/** A version's name in Show Changes: "version 3" for a published text, else when it was saved. */
export function entryLabel(entry: HistoryEntry): string {
  return entry.published?.length ? `version ${Math.max(...entry.published)}` : versionLabel(entry.timestamp);
}

/**
 * The file's history entry published as `version` of its folder, paging back through the
 * history (newest first) until it is found or older versions show it isn't there.
 */
export async function findPublishedEntry(file: string, version: number): Promise<HistoryEntry | null> {
  let offset: number | null = 0;
  for (let pages = 0; offset !== null && pages < 25; pages += 1) {
    const page = await fileHistory(file, offset);
    const found = page.entries.find(entry => entry.published?.includes(version));
    if (found) return found;
    if (page.entries.some(entry => entry.published?.some(v => v < version))) return null;
    offset = page.nextOffset;
  }
  return null;
}

/** "5 minutes ago", "yesterday", … */
export function relativeWhen(timestamp: string, now = Date.now()): string {
  const then = new Date(timestamp).getTime();
  if (Number.isNaN(then)) return '';
  const seconds = Math.round((then - now) / 1000);
  const format = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [['second', 60], ['minute', 60], ['hour', 24], ['day', 30], ['month', 12]];
  let value = seconds;
  for (const [unit, size] of steps) {
    if (Math.abs(value) < size) return format.format(value, unit);
    value = Math.round(value / size);
  }
  return format.format(value, 'year');
}

export function describeOperation(entry: HistoryEntry, previousPath: string | null): string {
  switch (entry.operation) {
    case 'create': return 'Created';
    case 'write': return 'Edited';
    case 'delete': return 'Deleted';
    case 'move': return previousPath && previousPath !== entry.path ? `Renamed from ${previousPath}` : 'Moved';
    default: return entry.operation;
  }
}
