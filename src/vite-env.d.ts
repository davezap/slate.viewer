/// <reference types="svelte" />
/// <reference types="vite/client" />

interface Window {
  /** Set by the Rust side when a window is opened for a specific file. */
  __SLATE_VIEWER_INITIAL_FILE__?: string | null;
  /** Set by the Rust side when a window is opened in folder mode. */
  __SLATE_VIEWER_INITIAL_FOLDER__?: string | null;
  /** True when the file or folder came from a command line (Explorer). A file then opens for reading. */
  __SLATE_VIEWER_LAUNCHED__?: boolean;
  /** True for the window of a launch with no file or folder named: it resumes the last session. */
  __SLATE_VIEWER_RESUME__?: boolean;
}
