// What is happening in a space beyond its files (Metatrash 0.95.9 `activity`): uploads from this
// page, Docling conversions, folder action jobs and who else has the space open. The Files list
// shows it as chips on rows and a line at the top, so nobody is left waiting for files to move.

/** One item of GET .../activity. */
export interface ActivityItem {
  kind: 'conversion' | 'agent' | 'presence' | 'upload';
  /** The file (relative to the space); empty for a scheduled job or someone in no file. */
  path?: string;
  folder?: string;
  state: string;
  message: string;
  since?: string;
  ahead?: number;
  retryAt?: string;
  from?: string;
  who?: string;
  action?: string;
}

export interface ActivityResult {
  space: string;
  /** '' when the server converts nothing, 'ready', or 'unreachable'. */
  docling?: string;
  items: ActivityItem[];
}

/** A file this page is uploading, shown as a row until the space lists it. */
export interface UploadRow {
  /** Where it goes, relative to the space. */
  path: string;
  state: 'waiting' | 'uploading' | 'storing' | 'failed';
  sent: number;
  total: number;
  error?: string;
}

/** States that are still under way (the rest are results). */
const RUNNING = new Set(['queued', 'converting', 'pairing', 'retrying', 'running', 'waiting', 'uploading', 'storing']);
export const isRunning = (item: { kind: string; state: string }) => item.kind !== 'presence' && RUNNING.has(item.state);

/** How a chip looks: busy (accent), good, warn or bad. */
export type Tone = 'busy' | 'good' | 'warn' | 'bad';

export function tone(item: { kind: string; state: string }): Tone {
  switch (item.state) {
    case 'failed': return 'bad';
    case 'retrying': case 'kept': case 'skipped': return 'warn';
    case 'converted': case 'done': return 'good';
    default: return 'busy';
  }
}

/** "0:42", "3:05", "1:02:10" since an RFC 3339 time. */
export function elapsed(since: string | undefined, now: number): string {
  if (!since) return '';
  const total = Math.max(0, Math.floor((now - Date.parse(since)) / 1000));
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
}

/** The chip's words. */
export function chipLabel(item: ActivityItem, now: number): string {
  if (item.kind === 'upload') {
    switch (item.state) {
      case 'waiting': return 'waiting to upload';
      case 'uploading': return `uploading ${item.message}`;
      case 'storing': return 'storing…';
      default: return 'upload failed';
    }
  }
  if (item.kind === 'conversion') {
    switch (item.state) {
      case 'queued': return item.ahead ? `queued (${item.ahead} ahead)` : 'queued';
      case 'converting': return `converting ${elapsed(item.since, now)}`;
      case 'pairing': return 'moving…';
      case 'failed': return 'not converted';
      case 'retrying': return 'converter busy';
      case 'kept': return 'kept as is';
      case 'converted': return '✓ converted';
    }
  }
  if (item.kind === 'agent') {
    switch (item.state) {
      case 'queued': return 'agent waiting';
      case 'running': return `agent ${elapsed(item.since, now)}`;
      case 'done': return '✓ agent done';
      case 'failed': return 'agent failed';
      case 'skipped': return 'agent skipped';
    }
  }
  return item.state;
}

/** Hover text: the server's message, plus when a failed or busy file is tried again. */
export function chipTitle(item: ActivityItem): string {
  let text = item.message;
  if (item.retryAt) {
    const at = new Date(item.retryAt);
    if (!Number.isNaN(at.getTime())) text += ` Next try: ${at.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}.`;
  }
  return text;
}

/** "AB" for a person's chip. */
export function initials(name: string): string {
  const parts = name.replace(/[@._-]+/g, ' ').trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
}

/** An upload row as an activity item, so rows and the summary treat both alike. */
export function uploadItem(row: UploadRow): ActivityItem {
  const percent = row.total ? Math.floor((row.sent / row.total) * 100) : 0;
  const message = row.state === 'uploading' ? `${percent}%`
    : row.state === 'failed' ? `Couldn't upload: ${row.error ?? 'unknown error'}. Click to dismiss.`
    : row.state === 'storing' ? 'Sent. The space is storing it and reading its text.'
    : 'Waiting for the uploads before it.';
  return { kind: 'upload', path: row.path, state: row.state, message };
}

/** The line at the top of Files: what is running, what failed, who is here. */
export function summary(items: ActivityItem[], now: number): string[] {
  const parts: string[] = [];
  const count = (pred: (i: ActivityItem) => boolean) => items.filter(pred).length;
  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const uploading = count(i => i.kind === 'upload' && i.state !== 'failed');
  if (uploading) parts.push(`Uploading ${plural(uploading, 'file')}`);
  const converting = items.find(i => i.kind === 'conversion' && i.state === 'converting');
  const waiting = count(i => i.kind === 'conversion' && (i.state === 'queued' || i.state === 'pairing' || i.state === 'retrying'));
  if (converting) parts.push(`Converting ${converting.path?.split('/').pop()} ${elapsed(converting.since, now)}${waiting ? `, ${waiting} more` : ''}`);
  else if (waiting) parts.push(`${plural(waiting, 'file')} to convert`);
  const agents = count(i => i.kind === 'agent' && (i.state === 'running' || i.state === 'queued'));
  if (agents) parts.push(`${plural(agents, 'agent job')} running`);
  const failed = count(i => i.state === 'failed');
  if (failed) parts.push(`${failed} failed`);
  return parts;
}
