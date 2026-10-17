<script lang="ts">
  import { accessKey, isSeparator, menuText, type MenuEntry, type MenuItem } from './menu';
  import KindIcon from './KindIcon.svelte';

  interface Props {
    menus: MenuItem[];
  }

  let { menus }: Props = $props();

  /** Which top-level menu is open, the highlighted row in it, and the open submenu's row. */
  let open = $state<number | null>(null);
  let row = $state(-1);
  let subRow = $state(-1);
  let subOpen = $state(false);
  let bar = $state<HTMLElement>();

  const items = $derived(open === null ? [] : (menus[open]?.items ?? []));
  const sub = $derived(subOpen && row >= 0 ? (items[row] as MenuItem | undefined)?.items ?? [] : []);

  const usable = (entry: MenuEntry | undefined): entry is MenuItem =>
    !!entry && !isSeparator(entry) && entry.enabled !== false;

  export function openMenu(index: number, highlightFirst = false) {
    open = index;
    subOpen = false;
    subRow = -1;
    row = highlightFirst ? nextRow(menus[index]?.items ?? [], -1, 1) : -1;
    bar?.focus();
  }

  /** Opens the menu whose access key is `key` (Alt+F and so on). Returns false if none has it. */
  export function openByKey(key: string): boolean {
    const index = menus.findIndex(m => accessKey(m.text) === key.toLowerCase());
    if (index < 0) return false;
    openMenu(index, true);
    return true;
  }

  function close() {
    open = null;
    subOpen = false;
    row = -1;
    subRow = -1;
  }

  function run(entry: MenuItem) {
    if (!usable(entry)) return;
    if (entry.items) { subOpen = true; subRow = nextRow(entry.items, -1, 1); return; }
    close();
    // Let the menu close before a dialog opens.
    setTimeout(() => entry.action?.(), 0);
  }

  function nextRow(list: MenuEntry[], from: number, step: 1 | -1): number {
    for (let i = 1; i <= list.length; i++) {
      const at = (from + step * i + list.length * 2) % list.length;
      if (usable(list[at])) return at;
    }
    return -1;
  }

  function onKeydown(event: KeyboardEvent) {
    if (open === null) return;
    const handled = () => { event.preventDefault(); event.stopPropagation(); };
    if (event.key === 'Escape') {
      handled();
      if (subOpen) subOpen = false; else close();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      handled();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      if (subOpen) subRow = nextRow(sub, subRow, step);
      else row = nextRow(items, row, step);
    } else if (event.key === 'ArrowRight') {
      handled();
      const current = items[row];
      if (!subOpen && usable(current) && current.items) run(current);
      else openMenu((open + 1) % menus.length, true);
    } else if (event.key === 'ArrowLeft') {
      handled();
      if (subOpen) subOpen = false;
      else openMenu((open - 1 + menus.length) % menus.length, true);
    } else if (event.key === 'Enter' || event.key === ' ') {
      handled();
      const target = subOpen ? sub[subRow] : items[row];
      if (usable(target)) run(target);
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
      // An access key inside the open menu.
      const list = subOpen ? sub : items;
      const index = list.findIndex(e => usable(e) && accessKey(e.text) === event.key.toLowerCase());
      if (index >= 0) {
        handled();
        if (subOpen) subRow = index; else row = index;
        run(list[index] as MenuItem);
      }
    }
  }

  function onWindowPointerDown(event: PointerEvent) {
    if (open !== null && bar && !bar.contains(event.target as Node)) close();
  }
</script>

<svelte:window onpointerdowncapture={onWindowPointerDown} onblur={close} onkeydowncapture={onKeydown} />

{#snippet entries(list: MenuEntry[], active: number, onHover: (i: number) => void, isSub: boolean)}
  <div class="dropdown" class:sub={isSub} role="menu">
    {#each list as entry, i (i)}
      {#if isSeparator(entry)}
        <div class="separator" role="separator"></div>
      {:else}
        <div class="entry">
        <button
          class="item"
          class:active={i === active}
          role={entry.checked !== undefined ? 'menuitemcheckbox' : 'menuitem'}
          aria-checked={entry.checked}
          aria-haspopup={entry.items ? 'menu' : undefined}
          disabled={entry.enabled === false}
          onpointerenter={() => onHover(i)}
          onclick={() => run(entry)}
        >
          <span class="check">{#if entry.icon}<KindIcon kind={entry.icon} />{:else}{entry.checked ? '✓' : ''}{/if}</span>
          <span class="text">{menuText(entry.text)}</span>
          <span class="keys">{entry.keys ?? ''}</span>
          <span class="arrow">{entry.items ? '›' : ''}</span>
        </button>
        {#if !isSub && i === active && subOpen && entry.items}
          {@render entries(entry.items, subRow, j => (subRow = j), true)}
        {/if}
        </div>
      {/if}
    {/each}
  </div>
{/snippet}

<div class="menubar" role="menubar" tabindex="-1" bind:this={bar}>
  {#each menus as menu, i (menu.text)}
    <div class="top">
      <button
        class="title"
        class:open={open === i}
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={open === i}
        onclick={() => (open === i ? close() : openMenu(i))}
        onpointerenter={() => { if (open !== null && open !== i) openMenu(i); }}
      >{menuText(menu.text)}</button>
      {#if open === i}
        {@render entries(items, row, j => { row = j; subOpen = !!(items[j] as MenuItem).items; subRow = -1; }, false)}
      {/if}
    </div>
  {/each}
</div>

<style>
  .menubar { display: flex; height: 100%; align-items: center; outline: none; }
  .top { position: relative; }
  button { font: inherit; color: inherit; background: none; border: 0; cursor: default; }
  .title { height: 30px; padding: 0 9px; border-radius: 5px; }
  .title:hover, .title.open { background: var(--side-hover); }
  .dropdown {
    position: absolute; top: calc(100% + 4px); left: 0; z-index: 3000; width: max-content; min-width: 220px; max-width: 560px; padding: 4px;
    background: var(--side-input); color: var(--side-fg);
    border: 1px solid var(--side-border); border-radius: 7px; box-shadow: 0 10px 30px rgb(0 0 0 / .2);
  }
  .entry { position: relative; }
  .dropdown.sub { top: -5px; left: calc(100% + 2px); }
  .item {
    display: grid; grid-template-columns: 18px 1fr auto 12px; align-items: center; gap: 6px;
    width: 100%; height: 28px; padding: 0 8px 0 6px; border-radius: 4px; text-align: left; white-space: nowrap;
  }
  .item.active:not(:disabled) { background: var(--side-accent-soft); }
  .item:disabled { opacity: .45; }
  .text { overflow: hidden; text-overflow: ellipsis; }
  .check { display: flex; justify-content: center; color: var(--side-accent); }
  .item:not(.active) .check :global(.kind:not(.space)) { color: var(--side-muted); }
  .keys { color: var(--side-muted); font-size: 12px; padding-left: 24px; }
  .arrow { color: var(--side-muted); }
  .separator { height: 1px; margin: 4px 6px; background: var(--side-border); }
</style>
