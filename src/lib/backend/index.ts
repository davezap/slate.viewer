// The backend this build talks to. Slate Viewer is the desktop one; the metatrash.com build
// will pick web.ts here instead (see "Slate Viewer's UI on the website" in Metatrash's roadmap).

import { desktop } from './desktop';
import type { Backend } from './types';

export const backend: Backend = desktop;
export const capabilities = backend.capabilities;
export type * from './types';
