<script lang="ts">
  import { onMount } from 'svelte';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import MenuBar from './MenuBar.svelte';
  import { customTitleBar, type MenuItem } from './menu';

  interface Props {
    menu: MenuItem[];
    title: string;
    /** Muted text after the title, such as the folder name. */
    detail?: string;
    dirty: boolean;
    /** File names Back and Forward would open, or null when there is nowhere to go. */
    backTo: string | null;
    forwardTo: string | null;
    onBack: () => void;
    onForward: () => void;
    onFind: () => void;
    /** Metatrash Sync status for an open space, or null outside one. */
    sync?: { label: string; tone: 'ok' | 'busy' | 'warn' | 'error'; title: string } | null;
    onSync?: () => void;
  }

  let { menu, title, detail, dirty, backTo, forwardTo, onBack, onForward, onFind, sync = null, onSync }: Props = $props();

  const appWindow = getCurrentWindow();
  let maximized = $state(false);
  let menuBar = $state<ReturnType<typeof MenuBar>>();

  /** Alt+F and friends. */
  export function openMenuByKey(key: string): boolean {
    return menuBar?.openByKey(key) ?? false;
  }

  onMount(() => {
    if (!customTitleBar) return;
    let unlisten: (() => void) | undefined;
    const update = async () => { maximized = await appWindow.isMaximized(); };
    void update();
    void appWindow.onResized(update).then(fn => (unlisten = fn));
    return () => unlisten?.();
  });
</script>

<!-- The empty parts of the bar move the window (and double-click maximises it). -->
<header class="titlebar" class:custom={customTitleBar} data-tauri-drag-region>
  {#if customTitleBar}
    <img class="logo" src="/app-icon.png" alt="" data-tauri-drag-region />
    <MenuBar bind:this={menuBar} menus={menu} />
  {/if}

  <div class="nav">
    <button title={backTo ? `Back to ${backTo} (Alt+Left)` : 'Back (Alt+Left)'} aria-label="Back" disabled={!backTo} onclick={onBack}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
    </button>
    <button title={forwardTo ? `Forward to ${forwardTo} (Alt+Right)` : 'Forward (Alt+Right)'} aria-label="Forward" disabled={!forwardTo} onclick={onForward}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
    </button>
  </div>

  <div class="title" data-tauri-drag-region>
    <span class="name" data-tauri-drag-region>{title}</span>
    {#if dirty}<span class="dirty" title="Unsaved changes" data-tauri-drag-region>●</span>{/if}
    {#if detail}<span class="detail" data-tauri-drag-region>{detail}</span>{/if}
  </div>

  <div class="tools">
    {#if sync}
      <button class="sync {sync.tone}" title="{sync.title}\nClick for details" onclick={() => onSync?.()}>
        <span class="dot"></span>{sync.label}
      </button>
    {/if}
    <button title="Find in document (Ctrl+F)" aria-label="Find in document" onclick={onFind}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.5 4.5a6 6 0 1 1 0 12a6 6 0 0 1 0-12zM15 15l5 5" /></svg>
    </button>
  </div>

  {#if customTitleBar}
    <div class="controls">
      <button class="control" title="Minimize" aria-label="Minimize" onclick={() => void appWindow.minimize()}>
        <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M1.5 6h9" /></svg>
      </button>
      <button class="control" title={maximized ? 'Restore' : 'Maximize'} aria-label={maximized ? 'Restore' : 'Maximize'} onclick={() => void appWindow.toggleMaximize()}>
        {#if maximized}
          <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3.5 3.5V1.5h7v7h-2M1.5 3.5h7v7h-7z" /></svg>
        {:else}
          <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M1.5 1.5h9v9h-9z" /></svg>
        {/if}
      </button>
      <button class="control close" title="Close" aria-label="Close" onclick={() => void appWindow.close()}>
        <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M1.5 1.5l9 9M10.5 1.5l-9 9" /></svg>
      </button>
    </div>
  {/if}
</header>

<style>
  .titlebar {
    flex: none; display: flex; align-items: center; gap: 4px;
    height: 44px; padding: 0 10px; box-sizing: border-box; user-select: none;
    background: var(--side-bar); color: var(--side-fg); border-bottom: 1px solid var(--side-border);
    font: 13px/1.2 Inter, "Segoe UI", system-ui, sans-serif;
  }
  .titlebar.custom { padding-right: 0; }
  .logo { width: 18px; height: 18px; margin: 0 6px 0 4px; }
  .nav { display: flex; gap: 2px; margin-left: 8px; }
  .title {
    flex: 1; min-width: 0; height: 100%; display: flex; align-items: center; justify-content: center; gap: 8px;
  }
  .name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dirty { color: var(--side-accent); font-size: 10px; }
  .detail { color: var(--side-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tools { display: flex; gap: 2px; margin-right: 6px; }
  button {
    display: grid; place-items: center; width: 32px; height: 32px; padding: 0;
    color: var(--side-muted); background: none; border: 0; border-radius: 6px; cursor: default;
  }
  button:hover:not(:disabled) { background: var(--side-hover); color: var(--side-fg); }
  button:disabled { opacity: .35; }
  svg { width: 19px; height: 19px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  .sync {
    display: flex; gap: 7px; width: auto; height: 28px; padding: 0 10px; margin-right: 4px;
    font: inherit; font-size: 12px; white-space: nowrap; border: 1px solid var(--side-border); border-radius: 14px;
  }
  /* Green when synced, orange (pulsing) while syncing, yellow when it needs a look, red on errors. */
  .dot { width: 8px; height: 8px; border-radius: 50%; background: #2e9d5b; }
  .sync.busy .dot { background: #f08a24; animation: pulse 1.2s ease-in-out infinite; }
  .sync.warn .dot { background: #d9b100; }
  .sync.error .dot { background: #c0392b; }
  @keyframes pulse { 50% { opacity: .3; } }
  .controls { display: flex; align-self: stretch; }
  .control { width: 46px; height: 100%; border-radius: 0; color: var(--side-fg); }
  .control svg { width: 11px; height: 11px; stroke-width: 1.1; stroke-linecap: butt; stroke-linejoin: miter; }
  .control.close:hover { background: #c42b1c; color: #fff; }
</style>
