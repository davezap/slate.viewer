function makeRecentList(key: string, limit = 10) {
  const read = (): string[] => {
    try {
      const list = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(list) ? list.filter(p => typeof p === 'string') : [];
    } catch {
      return [];
    }
  };
  const write = (list: string[]) => {
    try { localStorage.setItem(key, JSON.stringify(list)); } catch { /* storage blocked */ }
  };
  return {
    list: read,
    remember(path: string) {
      const lower = path.toLowerCase();
      write([path, ...read().filter(p => p.toLowerCase() !== lower)].slice(0, limit));
    },
    forget(path: string) {
      const lower = path.toLowerCase();
      write(read().filter(p => p.toLowerCase() !== lower));
    },
    clear() {
      try { localStorage.removeItem(key); } catch { /* storage blocked */ }
    },
  };
}

export const recentFileList = makeRecentList('slate-viewer.recent');
export const recentFolderList = makeRecentList('slate-viewer.recent-folders', 6);
