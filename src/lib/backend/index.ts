// The backend this build talks to: '$backend' is desktop.ts (Tauri) for Slate Viewer and web.ts
// (the site API) for `vite build --mode web`, the build Metatrash serves on metatrash.com.
// See vite.config.ts.

import { backend as chosen } from '$backend';
import type { Backend } from './types';

export const backend: Backend = chosen;
export const capabilities = backend.capabilities;
export type * from './types';
