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
