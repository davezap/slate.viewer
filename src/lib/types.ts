export interface SearchMatch { path: string; line: number; text: string }

/** `find` highlights a search term once the note is open, starting at `line` (one-based). */
export type OpenOptions = { newWindow: boolean; find?: string; line?: number };

export const isNewWindowClick = (event: MouseEvent) => event.ctrlKey || event.metaKey || event.shiftKey || event.button === 1;

export const displayName = (name: string) => name.replace(/\.(md|markdown|mdown|mkd)$/i, '');
