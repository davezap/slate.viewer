// Where the user left off, so reopening a folder (or Slate Viewer itself) picks up there.
// Shared by every window: the last one to change something wins.

import type { SlateWorkspaceMode } from '../../public/slate/slate-editor';

/** What a window last had open: its folder, and the file showing. */
export interface Session { folder: string | null; file: string | null }

/** How a folder (or a lone file) was last left: the file in it, the mode, the line at the top and the cursor. */
export interface PlaceView {
  file: string | null;
  mode: SlateWorkspaceMode;
  topLine: number;
  selection: [number, number] | null;
}

const SESSION_KEY = 'slate-viewer.session';
const PLACES_KEY = 'slate-viewer.places';
const PLACE_LIMIT = 50;

function readJson(key: string): unknown {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null'); } catch { return null; }
}

function writeJson(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked */ }
}

const text = (value: unknown) => (typeof value === 'string' && value ? value : null);

/** Places are kept by path, ignoring case and slash direction as Windows does. */
const placeKey = (path: string) => path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

export function lastSession(): Session | null {
  const stored = readJson(SESSION_KEY) as Record<string, unknown> | null;
  if (!stored || typeof stored !== 'object') return null;
  const session = { folder: text(stored.folder), file: text(stored.file) };
  return session.folder || session.file ? session : null;
}

export function saveSession(session: Session): void {
  writeJson(SESSION_KEY, session);
}

type StoredPlaces = Record<string, PlaceView & { at: number }>;

function places(): StoredPlaces {
  const stored = readJson(PLACES_KEY);
  return stored && typeof stored === 'object' && !Array.isArray(stored) ? (stored as StoredPlaces) : {};
}

/** How `path` (a folder, or a file opened without one) was left, or null the first time. */
export function placeView(path: string): PlaceView | null {
  const stored = places()[placeKey(path)];
  if (!stored || typeof stored !== 'object') return null;
  const mode = stored.mode === 'edit' || stored.mode === 'source' ? stored.mode : 'preview';
  const selection = Array.isArray(stored.selection) && stored.selection.length === 2 && stored.selection.every(n => Number.isInteger(n) && n >= 0)
    ? [stored.selection[0], stored.selection[1]] as [number, number]
    : null;
  return {
    file: text(stored.file),
    mode,
    topLine: Number.isInteger(stored.topLine) && stored.topLine >= 0 ? stored.topLine : 0,
    selection,
  };
}

export function savePlaceView(path: string, view: PlaceView): void {
  const all = places();
  all[placeKey(path)] = { ...view, at: Date.now() };
  // Keep the most recently left ones.
  const kept = Object.entries(all).sort(([, a], [, b]) => (b.at ?? 0) - (a.at ?? 0)).slice(0, PLACE_LIMIT);
  writeJson(PLACES_KEY, Object.fromEntries(kept));
}

// ---- Each document's own place (0.34.1) ---------------------------------------------
//
// Every document reopens where it was left (the line at the top and the cursor), whichever way it
// is opened: a link, the Files list, Back and Forward. Kept in this computer's (or browser's) own
// storage, for the most recent DOCUMENT_LIMIT documents, until Forget Document Positions.

/** Where a document was left: the line at the top of the view and the cursor or selection. */
export interface DocumentView { topLine: number; selection: [number, number] | null }

const DOCUMENTS_KEY = 'slate-viewer.documents';
const DOCUMENT_LIMIT = 1000;

type StoredDocuments = Record<string, DocumentView & { at: number }>;

function documents(): StoredDocuments {
  const stored = readJson(DOCUMENTS_KEY);
  return stored && typeof stored === 'object' && !Array.isArray(stored) ? (stored as StoredDocuments) : {};
}

/** Where `path` was left, or null the first time it is opened (or after Forget). */
export function documentView(path: string): DocumentView | null {
  const stored = documents()[placeKey(path)];
  if (!stored || typeof stored !== 'object') return null;
  const selection = Array.isArray(stored.selection) && stored.selection.length === 2 && stored.selection.every(n => Number.isInteger(n) && n >= 0)
    ? [stored.selection[0], stored.selection[1]] as [number, number]
    : null;
  return { topLine: Number.isInteger(stored.topLine) && stored.topLine >= 0 ? stored.topLine : 0, selection };
}

export function saveDocumentView(path: string, view: DocumentView): void {
  const all = documents();
  const key = placeKey(path);
  const before = all[key];
  // The top of an untouched document needn't be kept.
  if (!before && view.topLine === 0 && (!view.selection || (view.selection[0] === 0 && view.selection[1] === 0))) return;
  all[key] = { ...view, at: Date.now() };
  const entries = Object.entries(all);
  const kept = entries.length > DOCUMENT_LIMIT
    ? entries.sort(([, a], [, b]) => (b.at ?? 0) - (a.at ?? 0)).slice(0, DOCUMENT_LIMIT)
    : entries;
  writeJson(DOCUMENTS_KEY, Object.fromEntries(kept));
}

/** Forgets every document's place; returns how many there were. */
export function forgetDocumentViews(): number {
  const count = Object.keys(documents()).length;
  try { localStorage.removeItem(DOCUMENTS_KEY); } catch { /* storage blocked */ }
  return count;
}
