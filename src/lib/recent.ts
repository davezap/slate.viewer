/** What a recent entry opens: a Markdown file, a plain folder, or a folder mtsync keeps in sync with a Metatrash space. */
export type RecentKind = 'file' | 'folder' | 'space';

export interface RecentEntry {
  path: string;
  kind: RecentKind;
  /** When it was last opened (ms since 1970); 0 for entries saved before this was remembered. */
  at: number;
}

function makeRecentList(key: string, limit: number, defaultKind: RecentKind) {
  const read = (): RecentEntry[] => {
    try {
      const list = JSON.parse(localStorage.getItem(key) || '[]');
      if (!Array.isArray(list)) return [];
      return list.flatMap((item): RecentEntry[] => {
        // Older versions saved bare paths.
        if (typeof item === 'string') return [{ path: item, kind: defaultKind, at: 0 }];
        if (item && typeof item.path === 'string') {
          const kind = item.kind === 'file' || item.kind === 'folder' || item.kind === 'space' ? item.kind : defaultKind;
          return [{ path: item.path, kind, at: typeof item.at === 'number' ? item.at : 0 }];
        }
        return [];
      });
    } catch {
      return [];
    }
  };
  const write = (list: RecentEntry[]) => {
    try { localStorage.setItem(key, JSON.stringify(list)); } catch { /* storage blocked */ }
  };
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  return {
    list: read,
    /** Moves `path` to the top. Without `kind` it keeps the kind it was remembered with. */
    remember(path: string, kind?: RecentKind) {
      const list = read();
      const known = list.find(e => same(e.path, path));
      const entry = { path, kind: kind ?? known?.kind ?? defaultKind, at: Date.now() };
      write([entry, ...list.filter(e => !same(e.path, path))].slice(0, limit));
    },
    /** Records what `path` turned out to be, without changing its place in the list. */
    setKind(path: string, kind: RecentKind) {
      const list = read();
      if (!list.some(e => same(e.path, path) && e.kind !== kind)) return;
      write(list.map(e => (same(e.path, path) ? { ...e, kind } : e)));
    },
    forget(path: string) {
      write(read().filter(e => !same(e.path, path)));
    },
    clear() {
      try { localStorage.removeItem(key); } catch { /* storage blocked */ }
    },
  };
}

export const recentFileList = makeRecentList('slate-viewer.recent', 10, 'file');
export const recentFolderList = makeRecentList('slate-viewer.recent-folders', 6, 'folder');

/** Files and folders together, most recently opened first. */
export function byDate(...lists: RecentEntry[][]): RecentEntry[] {
  return lists.flat().sort((a, b) => b.at - a.at);
}
