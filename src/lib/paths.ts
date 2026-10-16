// Synchronous path helpers. Slate's resolveUrl hook is synchronous, so the
// async @tauri-apps/api/path functions can't be used there.

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const WINDOWS_DRIVE = /^[a-z]:[\\/]/i;

export function isWindowsPath(path: string): boolean {
  return WINDOWS_DRIVE.test(path) || path.startsWith('\\\\');
}

export function isAbsolutePath(path: string): boolean {
  return isWindowsPath(path) || path.startsWith('/');
}

/** True for http:, mailto: and other URL schemes; false for paths, including C:\ paths. */
export function hasUrlScheme(url: string): boolean {
  return SCHEME.test(url) && !WINDOWS_DRIVE.test(url);
}

export function dirname(path: string): string {
  const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return i <= 0 ? path.slice(0, i + 1) : path.slice(0, i);
}

export function basename(path: string): string {
  return path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1);
}

export function extname(path: string): string {
  const name = basename(path);
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1).toLowerCase() : '';
}

/** Joins `relative` onto `folder` and collapses `.` / `..`, using the folder's separator. */
export function joinPath(folder: string, relative: string): string {
  const sep = isWindowsPath(folder) || folder.includes('\\') ? '\\' : '/';
  const parts = `${folder}/${relative}`.split(/[\\/]+/);
  const out: string[] = [];
  for (const part of parts) {
    if (part === '.' || part === '') continue;
    if (part === '..') { if (out.length > 1) out.pop(); continue; }
    out.push(part);
  }
  const unc = folder.startsWith('\\\\') ? '\\\\' : '';
  const root = !unc && folder.startsWith('/') ? '/' : '';
  return unc + root + out.join(sep);
}

/** Strips ?query and #fragment and decodes %20 etc. */
function cleanLocalUrl(url: string): string {
  const bare = url.split(/[?#]/)[0];
  try { return decodeURIComponent(bare); } catch { return bare; }
}

/**
 * Turns a Markdown link or image URL into an absolute file path, or null when it
 * is a web URL (or relative with no document folder to resolve against).
 */
export function toLocalPath(url: string, documentFolder: string | null): string | null {
  const trimmed = url.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  if (/^file:/i.test(trimmed)) {
    const path = cleanLocalUrl(trimmed.replace(/^file:\/\/(localhost)?/i, ''));
    return /^\/[a-z]:\//i.test(path) ? path.slice(1).replace(/\//g, '\\') : path;
  }
  if (hasUrlScheme(trimmed)) return null;
  const path = cleanLocalUrl(trimmed);
  if (isAbsolutePath(path)) return path;
  return documentFolder ? joinPath(documentFolder, path) : null;
}
