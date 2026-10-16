/// <reference types="svelte" />
/// <reference types="vite/client" />

interface Window {
  /** Set by the Rust side when a window is opened for a specific file. */
  __SLATE_VIEWER_INITIAL_FILE__?: string | null;
  /** Set by the Rust side when a window is opened in folder mode. */
  __SLATE_VIEWER_INITIAL_FOLDER__?: string | null;
}
