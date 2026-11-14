// A theme change fades instead of snapping (post-rebranding patches): when the reader picks
// another theme, or the system switches between light and dark, colours ease from the old
// theme to the new over THEME_FADE_MS. Themes are only colours (CSS variables), so the fade
// transitions the colour properties of every element while the html element carries
// `theme-fade` (app.css), then takes the class away so ordinary transitions are untouched.
// Never on the first paint, and not for people who ask for less motion.

/** How long a theme change fades, in milliseconds. */
export const THEME_FADE_MS = 600;

let done: ReturnType<typeof setTimeout> | undefined;

/** Runs `change` (which sets data-theme) with the colours fading to the new theme. */
export function fadeTheme(change: () => void): void {
  const root = document.documentElement;
  if (!root.dataset.theme || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    change();
    return;
  }
  root.style.setProperty('--theme-fade', `${THEME_FADE_MS}ms`);
  root.classList.add('theme-fade');
  change();
  clearTimeout(done);
  done = setTimeout(() => root.classList.remove('theme-fade'), THEME_FADE_MS + 100);
}
