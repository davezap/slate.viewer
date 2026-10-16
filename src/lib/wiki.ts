// Resolving [[wiki links]] to Markdown files in the open folder.

import { basename, dirname, joinPath } from './paths';
import { spaceSafeName } from './space';

const strip = (name: string) => name.replace(/\.(md|markdown|mdown|mkd)$/i, '');
const norm = (path: string) => path.replace(/\\/g, '/').toLowerCase();

/**
 * Finds the file a wiki link points at. `target` may be a bare note name (`Ideas`),
 * a relative path (`projects/Ideas`) and may carry a `#heading`, which is ignored.
 * Among several notes with the same name, the one nearest the current document wins.
 */
export function resolveWikiLink(target: string, files: string[], root: string, currentPath: string | null): string | null {
  const wanted = norm(strip(target.split('#')[0].trim()));
  if (!wanted) return null;
  // Metatrash spaces can't have spaces in names, so [[My Note]] also finds my-note.md.
  const slug = spaceSafeName(basename(wanted));
  const candidates = files.filter(rel => {
    const bare = norm(strip(rel));
    return bare === wanted || bare.endsWith(`/${wanted}`) || (!wanted.includes('/') && basename(bare) === slug);
  });
  if (candidates.length === 0) return null;

  const currentDir = currentPath ? norm(dirname(currentPath)) : norm(root);
  const distance = (rel: string) => {
    const dir = norm(dirname(joinPath(root, rel)));
    if (dir === currentDir) return 0;
    if (dir.startsWith(`${currentDir}/`)) return 1 + dir.slice(currentDir.length).split('/').length;
    return 100 + rel.split('/').length;
  };
  candidates.sort((a, b) => distance(a) - distance(b) || a.length - b.length);
  return joinPath(root, candidates[0]);
}

/** File name to create for a missing note: the last path segment, as a .md file. */
export function noteFileName(target: string): string {
  return basename(strip(target.split('#')[0].trim()));
}
