// On metatrash.com the page Metatrash writes names the space and file to open in
// <meta name="metatrash-app" content="{...}">, since the site's CSP allows no inline script.
// They become the same window values the desktop app's Rust side sets.

export interface SiteConfig {
  /** The space's folder, as its website path: /spaces/owner/slug or /spaces/public. */
  root: string;
  /** The file to open (a full path under root), or null for the space's first note. */
  file: string | null;
  /** The page's address when it isn't the file's own one (the home page, /). */
  address?: string;
  /** The address of the space's top folder when it isn't root: /docs for the docs space. */
  addressRoot?: string;
}

export function readSiteConfig(): SiteConfig | null {
  const content = document.querySelector<HTMLMetaElement>('meta[name="metatrash-app"]')?.content;
  if (!content) return null;
  try { return JSON.parse(content) as SiteConfig; } catch { return null; }
}

/** Opens the page's space and file as if they came from Explorer: the file for reading. */
export function applySiteConfig() {
  const config = readSiteConfig();
  if (!config) return;
  window.__SLATE_VIEWER_INITIAL_FOLDER__ = config.root;
  window.__SLATE_VIEWER_INITIAL_FILE__ = config.file;
  window.__SLATE_VIEWER_LAUNCHED__ = true;
  window.__SLATE_VIEWER_RESUME__ = false;
}

/**
 * Keeps the address bar on the open file (/spaces/owner/slug/file, or /docs/file in the docs
 * space), so a reload or a copied address opens it again. The page's own file keeps the address
 * the page was opened at (metatrash.com/ for the home page).
 */
export function showAddress(path: string | null) {
  const config = readSiteConfig();
  if (!config || !path || !path.startsWith(config.root + '/')) return;
  const base = config.addressRoot ?? config.root;
  const address = path === config.file ? config.address ?? location.pathname : base + encodePath(path.slice(config.root.length));
  if (address !== location.pathname) history.replaceState(history.state, '', address);
}

/** A path's segments escaped for an address (/notes/a b.md -> /notes/a%20b.md). */
const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/');

/**
 * A file's address on the site (/spaces/owner/slug/file, or /docs/file in the docs space), for
 * Copy Address. path is the file's full site path under the page's root.
 */
export function siteAddress(path: string): string {
  const config = readSiteConfig();
  if (!config || !path.startsWith(config.root + '/')) return path;
  return (config.addressRoot ?? config.root) + encodePath(path.slice(config.root.length));
}

/**
 * Where a link in a document on the site goes (0.87.0 site addresses): a path in this page's space
 * (/docs/x.md in the docs space, /spaces/owner/slug/x.md, or the same with this site's origin)
 * opens here; any other address on this site is a page load; null for everything else (not on the
 * site, or a relative link), which the caller handles as before.
 */
export function siteLink(url: string): { path: string } | { navigate: string } | null {
  const config = readSiteConfig();
  if (!config) return null;
  let address: URL;
  if (url.startsWith('/') && !url.startsWith('//')) address = new URL(url, location.origin);
  else {
    try { address = new URL(url); } catch { return null; }
    if (address.origin !== location.origin) return null;
  }
  let pathname = address.pathname;
  try { pathname = decodeURIComponent(pathname); } catch { /* keep it as written */ }
  for (const base of [config.addressRoot, config.root]) {
    if (base && pathname.startsWith(base + '/') && pathname.length > base.length + 1) {
      return { path: config.root + pathname.slice(base.length) };
    }
  }
  return { navigate: address.href };
}
