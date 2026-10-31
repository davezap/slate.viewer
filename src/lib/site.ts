// On metatrash.com the page Metatrash writes names the space and file to open in
// <meta name="metatrash-app" content="{...}">, since the site's CSP allows no inline script.
// They become the same window values the desktop app's Rust side sets.

export interface SiteConfig {
  /** The space's folder, as its website path: /spaces/owner/slug or /spaces/public. */
  root: string;
  /** The file to open (a full path under root), or null for the space's first note. */
  file: string | null;
  /** The page's address when it isn't the file's /app/ one (the home page, /). */
  address?: string;
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
 * Keeps the address bar on the open file (/app/owner/slug/file), so a reload or a copied address
 * opens it again. The page's own file keeps the address the page was opened at (metatrash.com/
 * for the home page).
 */
export function showAddress(path: string | null) {
  const config = readSiteConfig();
  if (!config || !path || !path.startsWith('/spaces/')) return;
  const address = path === config.file ? config.address ?? location.pathname : `/app${path.slice('/spaces'.length)}`;
  if (address !== location.pathname) history.replaceState(history.state, '', address);
}
