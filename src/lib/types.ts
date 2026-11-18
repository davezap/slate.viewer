export interface SearchMatch { path: string; line: number; text: string }

/** `find` highlights a search term once the note is open, starting at `line` (one-based). */
export type OpenOptions = { newWindow: boolean; find?: string; line?: number };

export const isNewWindowClick = (event: MouseEvent) => event.ctrlKey || event.metaKey || event.shiftKey || event.button === 1;

export const displayName = (name: string) => name.replace(/\.(md|markdown|mdown|mkd)$/i, '');

const fileName = (path: string) => path.slice(path.lastIndexOf('/') + 1);

/** A folder's AGENTS.md or .metatrash.json: in a Metatrash space every folder keeps them. */
export const isSpaceFolderFile = (path: string) => {
  const name = fileName(path);
  return name === '.metatrash.json' || name.toLowerCase() === 'agents.md';
};

/**
 * Whether a typed name says its own type (0.44.1): it ends in an extension (letters and digits,
 * not digits only, so "Plan v1.2" has none) or starts with a dot (.gitignore).
 */
export const hasOwnExtension = (name: string) => name.startsWith('.') || /\.(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{1,16}$/.test(name);

/** The name a new file or a rename gets: as typed when it says its type, else `fallback` (.md) added. */
export const withOwnExtension = (name: string, fallback = '.md') => (hasOwnExtension(name) ? name : name + fallback);

/**
 * Listed only with View > Show Hidden Files: not Markdown or CSV (a dashboard's source, 0.44.1),
 * a folder's AGENTS.md, or a dot name.
 */
export const isHiddenFile = (path: string) => {
  const name = fileName(path);
  return !/\.(md|markdown|mdown|mkd|csv)$/i.test(name) || name.toLowerCase() === 'agents.md' || name.startsWith('.');
};

/** Markdown, which the editor shows as a page (the home page and New File's starting title). */
export const isMarkdownName = (path: string) => /\.(md|markdown|mdown|mkd)$/i.test(fileName(path));

/**
 * A space's home page among its top-level files (Metatrash 0.99.0): the top folder's `home`
 * setting when that file is there, else dashboard.md, else README.md; null when none is.
 */
export function homeNote(files: string[], home = ''): string | null {
  const top = files.filter(f => !f.includes('/'));
  const find = (name: string) => (name ? top.find(f => f.toLowerCase() === name.toLowerCase()) ?? null : null);
  return find(home.trim()) ?? find('dashboard.md') ?? find('readme.md');
}

/** The note a folder opens on: its home page (see homeNote), else its first top-level note. */
export function firstNote(files: string[], home = ''): string | null {
  const top = files.filter(f => !f.includes('/') && !isHiddenFile(f) && isMarkdownName(f));
  return homeNote(files, home) ?? top[0] ?? null;
}
