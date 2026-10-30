<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { mtsync, parseSyncLog, versionAtLeast, SYNC_NOW_VERSION, type SyncLogLine } from './space';

  interface Props {
    /** The sync chip's box, in window coordinates: the menu opens under it, right-aligned. */
    anchor: DOMRect;
    space: string;
    readOnly: boolean;
    /** `mtsync list`'s state for the folder. */
    syncState: string;
    tone: 'ok' | 'busy' | 'warn' | 'error';
    /** Sync now was asked for and the service hasn't finished a pass since. */
    syncing: boolean;
    onSyncNow: () => void;
    onStart: () => void;
    onSignIn: () => void;
    onClose: () => void;
  }

  let { anchor, space, readOnly, syncState, tone, syncing, onSyncNow, onStart, onSignIn, onClose }: Props = $props();

  let menu = $state<HTMLElement>();
  let list = $state<HTMLElement>();
  let version = $state<string | null | undefined>(undefined);
  let lines = $state<SyncLogLine[] | null>(null);
  let logError = $state('');

  const stopped = $derived(syncState.startsWith('service not running'));
  const signedOut = $derived(/signed out|mtsync login/i.test(syncState));
  const canSyncNow = $derived(!!version && versionAtLeast(version, SYNC_NOW_VERSION));

  /** The state in words: "In sync, checked 09:45:12", or mtsync's error. */
  const stateText = $derived.by(() => {
    if (syncing) return 'Syncing…';
    const checked = /^in sync, checked (.*?)\s*$/.exec(syncState);
    if (checked) {
      const today = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric' }).replace(',', '');
      const when = checked[1].startsWith(today + ' ') ? checked[1].slice(today.length + 1) : checked[1];
      return `In sync, checked ${when}`;
    }
    if (stopped) return 'The sync service isn\'t running, so changes here and in the space wait.';
    if (syncState.startsWith('starting')) return 'Starting…';
    if (syncState.startsWith('error: ')) return syncState.slice('error: '.length);
    return syncState || 'Unknown';
  });

  async function loadLog() {
    try {
      const fresh = parseSyncLog(await mtsync.log(200), space).slice(-40);
      const atEnd = !list || list.scrollTop + list.clientHeight >= list.scrollHeight - 4;
      lines = fresh;
      logError = '';
      // Follow new lines unless the reader scrolled up.
      if (atEnd) { await tick(); list?.scrollTo({ top: list.scrollHeight }); }
    } catch (error) {
      logError = String(error);
    }
  }

  onMount(() => {
    void mtsync.info().then(info => (version = info.version), () => (version = null));
    void loadLog();
    const timer = setInterval(() => void loadLog(), 2000);
    menu?.focus();
    return () => clearInterval(timer);
  });

  function onKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    onClose();
  }

  function onWindowPointerDown(event: PointerEvent) {
    const target = event.target as Element | null;
    // The chip toggles the menu itself.
    if (menu && !menu.contains(target) && !target?.closest?.('[data-sync-chip]')) onClose();
  }
</script>

<svelte:window onpointerdowncapture={onWindowPointerDown} onresize={onClose} onkeydowncapture={onKeydown} />

<div
  class="sync-menu"
  role="dialog"
  aria-label="Metatrash Sync"
  tabindex="-1"
  bind:this={menu}
  style:top="{anchor.bottom + 6}px"
  style:right="{Math.max(8, innerWidth - anchor.right)}px"
>
  <div class="head">
    <span class="dot {syncing ? 'busy' : tone}"></span>
    <div class="what">
      <div class="space">{space}{readOnly ? ' (read only)' : ''}</div>
      <div class="state" class:problem={!syncing && (tone === 'error' || tone === 'warn')}>{stateText}</div>
    </div>
  </div>

  <div class="actions">
    {#if stopped}
      <button class="item" onclick={onStart}>Start syncing</button>
    {:else if signedOut}
      <button class="item" onclick={onSignIn}>Sign in again…</button>
    {/if}
    {#if !stopped}
      <button
        class="item"
        disabled={!canSyncNow || syncing}
        title={version === undefined ? '' : canSyncNow ? 'Check this folder and the space now' : `Sync now needs mtsync ${SYNC_NOW_VERSION} or later`}
        onclick={onSyncNow}
      >
        <span>{syncing ? 'Syncing…' : 'Sync now'}</span>
      </button>
    {/if}
  </div>

  <div class="label">Recent activity</div>
  <div class="log" bind:this={list}>
    {#if logError}
      <div class="empty">The sync log can't be read: {logError}</div>
    {:else if lines === null}
      <div class="empty">Reading the sync log…</div>
    {:else if !lines.length}
      <div class="empty">Nothing logged for this space yet.</div>
    {:else}
      {#each lines as line, i (i)}
        <div class="line" class:service={line.space === null}>
          <span class="when">{line.when}</span>
          <span class="text">{line.text}</span>
        </div>
      {/each}
    {/if}
  </div>

  <div class="foot">
    {#if version === undefined}
      mtsync …
    {:else if version === null}
      mtsync didn't say its version
    {:else}
      {version}{canSyncNow ? '' : ` · update to ${SYNC_NOW_VERSION} for Sync now`}
    {/if}
  </div>
</div>

<style>
  .sync-menu {
    position: fixed; z-index: 4000; width: 420px; max-width: calc(100vw - 16px); box-sizing: border-box; padding: 6px;
    background: var(--side-input); color: var(--side-fg); outline: none;
    border: 1px solid var(--side-border); border-radius: 8px; box-shadow: 0 10px 30px rgb(0 0 0 / .2);
    font: 13px/1.4 "Segoe UI", system-ui, sans-serif; user-select: text;
  }
  .head { display: flex; align-items: flex-start; gap: 10px; padding: 6px 8px 8px; }
  .what { min-width: 0; }
  .space { font-weight: 600; overflow-wrap: anywhere; }
  .state { color: var(--side-muted); font-size: 12px; overflow-wrap: anywhere; }
  .state.problem { color: var(--side-fg); }
  .dot { flex: none; width: 9px; height: 9px; margin-top: 5px; border-radius: 50%; background: #2e9d5b; }
  .dot.busy { background: #f08a24; animation: pulse 1.2s ease-in-out infinite; }
  .dot.warn { background: #d9b100; }
  .dot.error { background: #c0392b; }
  @keyframes pulse { 50% { opacity: .3; } }
  .actions { display: flex; flex-direction: column; padding-bottom: 4px; border-bottom: 1px solid var(--side-border); }
  .item {
    display: flex; align-items: center; width: 100%; height: 28px; padding: 0 10px; border: 0; border-radius: 4px;
    font: inherit; color: inherit; background: none; cursor: default; text-align: left;
  }
  .item:hover:not(:disabled) { background: var(--side-accent-soft); }
  .item:disabled { opacity: .45; }
  .label { padding: 8px 10px 4px; color: var(--side-muted); font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
  .log {
    max-height: 240px; overflow: auto; margin: 0 4px; padding: 4px 6px; border-radius: 4px;
    background: var(--side-bg); font: 12px/1.45 Consolas, "Cascadia Mono", ui-monospace, monospace;
  }
  .line { display: grid; grid-template-columns: auto 1fr; gap: 10px; }
  .line.service { color: var(--side-muted); }
  .when { color: var(--side-muted); white-space: nowrap; }
  .text { overflow-wrap: anywhere; }
  .empty { color: var(--side-muted); font-family: "Segoe UI", system-ui, sans-serif; padding: 2px 0; }
  .foot { padding: 8px 10px 4px; color: var(--side-muted); font-size: 12px; }
</style>
