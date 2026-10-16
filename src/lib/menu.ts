import { Menu, type MenuOptions } from '@tauri-apps/api/menu';
import type { Window } from '@tauri-apps/api/window';

/** One menu, as drawn by the title bar's own menu bar (or the native menu on macOS). */
export interface MenuItem {
  /** `&` marks the access key, `&&` is a literal ampersand (as in Windows menus). */
  text: string;
  /** Shortcut shown on the right; the keys themselves are handled in App.svelte's onKeydown. */
  keys?: string;
  enabled?: boolean;
  checked?: boolean;
  action?: () => void;
  items?: MenuEntry[];
}

export type MenuEntry = MenuItem | { separator: true };

export const isSeparator = (entry: MenuEntry): entry is { separator: true } => 'separator' in entry;

/** The text without access-key markers. */
export const menuText = (text: string) => text.replace(/&(&?)/g, (_, literal: string) => literal);

/** The access key, lower-cased, if the text has one. */
export const accessKey = (text: string) => /&([^&])/.exec(text)?.[1]?.toLowerCase() ?? null;

/** True where the title bar is drawn by the app (Windows, Linux); macOS keeps its native menu and title bar. */
export const customTitleBar = !/Mac/i.test(navigator.userAgent);

function toNative(entries: MenuEntry[]): MenuOptions['items'] {
  return entries.map(entry => {
    if (isSeparator(entry)) return { item: 'Separator' as const };
    const text = entry.keys ? `${entry.text}\t${entry.keys}` : entry.text;
    if (entry.items) return { text, enabled: entry.enabled, items: toNative(entry.items) };
    return { text, enabled: entry.enabled, checked: entry.checked, action: entry.action };
  }) as MenuOptions['items'];
}

let generation = 0;

export async function setNativeMenu(entries: MenuEntry[], window: Window) {
  const mine = ++generation;
  const menu = await Menu.new({ items: toNative(entries) });
  if (mine === generation) await menu.setAsWindowMenu(window);
}
