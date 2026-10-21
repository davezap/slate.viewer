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

/** Listed only with View > Show Hidden Files: not Markdown, a folder's AGENTS.md, or a dot name. */
export const isHiddenFile = (path: string) => {
  const name = fileName(path);
  return !/\.(md|markdown|mdown|mkd)$/i.test(name) || name.toLowerCase() === 'agents.md' || name.startsWith('.');
};

/** The note a folder opens on: its top-level README.md, else its first top-level note. */
export function firstNote(files: string[]): string | null {
  const top = files.filter(f => !f.includes('/') && !isHiddenFile(f));
  return top.find(f => f.toLowerCase() === 'readme.md') ?? top[0] ?? null;
}
