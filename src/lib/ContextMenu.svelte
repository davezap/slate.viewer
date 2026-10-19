<script lang="ts">
  import { onMount } from 'svelte';
  import { isSeparator, menuText, type MenuEntry, type MenuItem } from './menu';

  interface Props {
    /** Where the right-click was, in window coordinates. */
    x: number;
    y: number;
    items: MenuEntry[];
    onClose: () => void;
  }

  let { x, y, items, onClose }: Props = $props();

  let menu = $state<HTMLElement>();
  let left = $state(0);
  let top = $state(0);
  let row = $state(-1);

  const usable = (entry: MenuEntry | undefined): entry is MenuItem =>
    !!entry && !isSeparator(entry) && entry.enabled !== false;

  // Keep the menu inside the window: open up or to the left when there is no room.
  onMount(() => {
    left = x;
    top = y;
    const box = menu?.getBoundingClientRect();
    if (box) {
      if (x + box.width > innerWidth - 4) left = Math.max(4, x - box.width);
      if (y + box.height > innerHeight - 4) top = Math.max(4, y - box.height);
    }
    menu?.focus();
  });

  function run(entry: MenuItem) {
    if (!usable(entry)) return;
    onClose();
    // Let the menu close before a dialog opens or the focus moves.
    setTimeout(() => entry.action?.(), 0);
  }

  function step(from: number, by: 1 | -1): number {
    for (let i = 1; i <= items.length; i++) {
      const at = (from + by * i + items.length * 2) % items.length;
      if (usable(items[at])) return at;
    }
    return -1;
  }

  function onKeydown(event: KeyboardEvent) {
    const handled = () => { event.preventDefault(); event.stopPropagation(); };
    if (event.key === 'Escape') { handled(); onClose(); }
    else if (event.key === 'ArrowDown') { handled(); row = step(row, 1); }
    else if (event.key === 'ArrowUp') { handled(); row = step(row, -1); }
    else if (event.key === 'Enter' || event.key === ' ') {
      handled();
      const entry = items[row];
      if (usable(entry)) run(entry);
    }
  }

  function onWindowPointerDown(event: PointerEvent) {
    if (menu && !menu.contains(event.target as Node)) onClose();
  }
</script>

<svelte:window onpointerdowncapture={onWindowPointerDown} onblur={onClose} onresize={onClose} onkeydowncapture={onKeydown} />

<div class="context" role="menu" tabindex="-1" bind:this={menu} style:left="{left}px" style:top="{top}px">
  {#each items as entry, i (i)}
    {#if isSeparator(entry)}
      <div class="separator" role="separator"></div>
    {:else}
      <button
        class="item"
        class:active={i === row}
        role="menuitem"
        disabled={entry.enabled === false}
        onpointerenter={() => (row = i)}
        onclick={() => run(entry)}
      >
        <span class="text">{menuText(entry.text)}</span>
        <span class="keys">{entry.keys ?? ''}</span>
      </button>
    {/if}
  {/each}
</div>

<style>
  .context {
    position: fixed; z-index: 4000; width: max-content; min-width: 200px; max-width: 420px; padding: 4px;
    background: var(--side-input); color: var(--side-fg); outline: none;
    border: 1px solid var(--side-border); border-radius: 7px; box-shadow: 0 10px 30px rgb(0 0 0 / .2);
    font: 13px/1.4 "Segoe UI", system-ui, sans-serif;
  }
  .item {
    display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 6px;
    width: 100%; height: 28px; padding: 0 10px; border: 0; border-radius: 4px;
    font: inherit; color: inherit; background: none; cursor: default; text-align: left; white-space: nowrap;
  }
  .item.active:not(:disabled) { background: var(--side-accent-soft); }
  .item:disabled { opacity: .45; }
  .text { overflow: hidden; text-overflow: ellipsis; }
  .keys { color: var(--side-muted); font-size: 12px; padding-left: 24px; }
  .separator { height: 1px; margin: 4px 6px; background: var(--side-border); }
</style>
