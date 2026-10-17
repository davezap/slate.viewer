// Small per-machine preferences, shared by every window.

export type ThemePref = 'system' | 'light' | 'dark';

const THEME_KEY = 'slate-viewer.theme';
const ZOOM_KEY = 'slate-viewer.zoom';

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function write(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* storage blocked */ }
}

export function themePref(): ThemePref {
  const value = read(THEME_KEY);
  return value === 'light' || value === 'dark' ? value : 'system';
}

export function setThemePref(theme: ThemePref): void {
  write(THEME_KEY, theme);
}

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 3;

export function zoomPref(): number {
  const value = Number(read(ZOOM_KEY));
  return value >= ZOOM_MIN && value <= ZOOM_MAX ? value : 1;
}

export function setZoomPref(zoom: number): void {
  write(ZOOM_KEY, String(zoom));
}

const SIDEBAR_KEY = 'slate-viewer.sidebar-width';

export function sidebarWidthPref(): number {
  const value = Number(read(SIDEBAR_KEY));
  return value >= 160 && value <= 600 ? value : 250;
}

export function setSidebarWidthPref(width: number): void {
  write(SIDEBAR_KEY, String(Math.round(width)));
}

// ---- Sidebar sections --------------------------------------------------------

export type SectionId = 'files' | 'search' | 'outline' | 'history';
export type SectionState = Record<SectionId, boolean>;
export const SECTION_IDS: SectionId[] = ['files', 'search', 'outline', 'history'];

const SECTIONS_KEY = 'slate-viewer.sections';
const WEIGHTS_KEY = 'slate-viewer.section-weights';
const LABELS_KEY = 'slate-viewer.activity-labels';

function readJson(key: string): Record<string, unknown> {
  try {
    const value = JSON.parse(read(key) ?? '{}');
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

/** Which sections are switched on. Files and Document Nav start on, Search and History off. */
export function sectionsPref(): SectionState {
  const stored = readJson(SECTIONS_KEY);
  const pick = (id: SectionId, fallback: boolean) => (typeof stored[id] === 'boolean' ? (stored[id] as boolean) : fallback);
  return { files: pick('files', true), search: pick('search', false), outline: pick('outline', true), history: pick('history', false) };
}

export function setSectionsPref(sections: SectionState): void {
  write(SECTIONS_KEY, JSON.stringify(sections));
}

/** How much of the panel's height each section gets, relative to the others. */
export function sectionWeightsPref(): Record<SectionId, number> {
  const stored = readJson(WEIGHTS_KEY);
  const pick = (id: SectionId) => {
    const value = Number(stored[id]);
    return value > 0.05 && value < 20 ? value : 1;
  };
  return { files: pick('files'), search: pick('search'), outline: pick('outline'), history: pick('history') };
}

export function setSectionWeightsPref(weights: Record<SectionId, number>): void {
  write(WEIGHTS_KEY, JSON.stringify(weights));
}

export function activityLabelsPref(): boolean {
  return read(LABELS_KEY) === 'true';
}

export function setActivityLabelsPref(expanded: boolean): void {
  write(LABELS_KEY, String(expanded));
}
