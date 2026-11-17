// Dashboard cards (Slate 0.24.0, Metatrash 0.99.0). A dashboard is a Markdown file whose ```card
// blocks Slate draws; Slate asks this host for each card's data. The server computes it with the
// person's own access: the site API on the website, mtsync on the desktop. Paths in a card are
// relative to the dashboard (a leading / is the top of the space).

import { backend } from './backend';
import { dirname, joinPath } from './paths';
import type { SlateCardHost, SlateCardQuery, SlateCardQueryResult, SlateNoticeStatus } from '../../public/slate/slate-editor';

export type { SlateCardQuery as CardQuery, SlateCardQueryResult as CardQueryResult, SlateNoticeStatus as NoticeStatus };

/** Whether `text` has any ```card block, so pages without one never ask for anything. */
export const hasCards = (text: string) => /^\s{0,3}(`{3,}|~{3,})\s*card\s*$/im.test(text);

export interface CardHostContext {
  /** The open dashboard (a full path), or null. */
  dashboard(): string | null;
  /** The open folder or space (a full path), or null. */
  root(): string | null;
  /** Who is looking, for @me and form defaults; undefined until known. */
  person(): { name: string; email: string } | undefined;
  /** Opens a file of the space (relative to root) in this window. */
  open(relative: string): void;
}

/** A card's file as a full path, refused when it would leave the open folder. */
function resolve(ctx: CardHostContext, source: string): string {
  const dashboard = ctx.dashboard();
  const root = ctx.root();
  if (!dashboard || !root) throw new Error('Open the dashboard from its space to see this card.');
  const trimmed = source.trim();
  const full = trimmed.startsWith('/') ? joinPath(root, trimmed.slice(1)) : joinPath(dirname(dashboard), trimmed);
  const base = root.replace(/[\\/]+$/, '').replace(/\\/g, '/').toLowerCase() + '/';
  if (!full.replace(/\\/g, '/').toLowerCase().startsWith(base)) throw new Error(`${source} is outside this space.`);
  return full;
}

/** The host Slate's cards ask: setCardHost(cardHost(...)) while a dashboard is open. */
export function cardHost(ctx: CardHostContext): SlateCardHost {
  const sync = backend.sync;
  return {
    get person() { return ctx.person(); },
    async query(query: SlateCardQuery): Promise<SlateCardQueryResult> {
      const dashboard = ctx.dashboard();
      if (!dashboard || !ctx.root()) throw new Error('Open the dashboard from its space to see this card.');
      if (!sync.query) throw new Error('Cards need a space.');
      return sync.query(dashboard, query);
    },
    async read(source: string) {
      return { text: (await backend.files.read(resolve(ctx, source))).text };
    },
    async notices(sources: string[]): Promise<SlateNoticeStatus[]> {
      if (!sync.notices) throw new Error('Notices need a space.');
      const files = sources.map(s => resolve(ctx, s));
      const answer = await sync.notices(files);
      // Slate matches them up by the paths it gave.
      return answer.map((n, i) => ({ ...n, path: sources[i] ?? n.path }));
    },
    async acknowledge(source: string, blob: string) {
      if (!sync.notice) throw new Error('Notices need a space.');
      await sync.notice(resolve(ctx, source), blob);
    },
    async submit(source: string, answers: Record<string, unknown>) {
      const sent = await sync.submit(resolve(ctx, source), answers, null, null);
      if (sent.ok) return sent.receipt;
      if (sent.error.fields?.length) return { problems: sent.error.fields, message: sent.error.message };
      throw new Error(sent.error.message || 'The form could not be sent.');
    },
    open(relative: string) {
      ctx.open(relative);
    },
  };
}
