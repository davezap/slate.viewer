import type { Component } from 'svelte';
import type { Account, Notice, Security } from './siteAccount';

export type RunChange = (work: () => Promise<Notice>, after?: (n: Notice) => void | Promise<void>) => Promise<void>;
export interface SettingsPanelProps { acct: Account; busy: boolean; run: RunChange }
export interface SecurityPanelProps { security: Security; busy: boolean; run: RunChange }
export interface SettingsAddition {
  id: string; label: string; pages: { id: string; label: string }[];
  component: Component<SettingsPanelProps>;
  visible: (account: Account | null) => boolean;
}
export interface SecurityAddition {
  id: string; label: string; component: Component<SecurityPanelProps>;
  count?: (security: Security) => number | undefined;
}
