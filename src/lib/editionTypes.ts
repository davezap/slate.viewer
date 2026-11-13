import type { Component } from 'svelte';
import type { Account, Notice, Security } from './siteAccount';

export type RunChange = (work: () => Promise<Notice>, after?: (n: Notice) => void | Promise<void>) => Promise<void>;
export interface SettingsPanelProps { acct: Account; busy: boolean; run: RunChange }
export interface SecurityPanelProps { security: Security; busy: boolean; run: RunChange }
/** Optional controls supplied by a compiled edition for the website header. */
export interface HeaderAdditionProps { signedIn: boolean; account: string }
export interface HeaderAddition { id: string; component: Component<HeaderAdditionProps> }
export interface SettingsAddition {
  id: string; label: string; pages: { id: string; label: string }[];
  component: Component<SettingsPanelProps>;
  visible: (account: Account | null) => boolean;
}
export interface SecurityAddition {
  id: string; label: string; component: Component<SecurityPanelProps>;
  count?: (security: Security) => number | undefined;
}
/**
 * The service's name and wordmark on the website (0.38.0): the header's home link and the
 * page title. The public edition is Metatrash, shown as the text wordmark; an edition may give
 * its own name and a wordmark component (an inline SVG, sized by the header's .brand rule).
 */
export interface Brand { name: string; wordmark?: Component }
