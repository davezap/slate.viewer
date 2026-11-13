<script lang="ts">
  import { onMount } from 'svelte';
  import { brand, headerAdditions } from '$edition';
  import { backend, capabilities } from './backend';
  import MenuBar from './MenuBar.svelte';
  import SpacePicker from './SpacePicker.svelte';
  import { pickerSession } from './siteSpaces';
  import { forgetPlace, goingHome } from './site';
  import { customTitleBar, type MenuItem } from './menu';
  import type { ThemePref } from './prefs';

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
    /** The status chip was clicked: `chip` is its box, to open the sync menu under it. */
    onSync?: (chip: DOMRect) => void;
    /** The sync menu is open (the chip shows pressed). */
    syncOpen?: boolean;
    /** metatrash.com: the editing switch's state, or null to hide it (a space the person can only read). */
    editing?: boolean | null;
    onEditing?: (on: boolean) => void;
    /**
     * metatrash.com: the Changes toggle (0.38.0; it was Slate's toolbar button, which kept a bar
     * above every page): whether changes are showing, or null to hide it (a file with no history).
     */
    changes?: boolean | null;
    onChanges?: () => void;
    /** metatrash.com: the theme selector (the desktop app has View > Theme). */
    theme?: ThemePref;
    onTheme?: (theme: ThemePref) => void;
    /** metatrash.com: the print button (the desktop app has File > Print). */
    onPrint?: () => void;
    /** metatrash.com: Change Space when signed in, Sign In when not. */
    signedIn?: boolean;
    /** metatrash.com: the signed-in account's name, for the account menu. */
    account?: string;
    /** metatrash.com: the open space (owner/slug or public), ticked in the space picker. */
    space?: string | null;
    /** metatrash.com: the account menu's Remember Position in Each Document (the desktop app has it in Go). */
    rememberPositions?: boolean;
    onRememberPositions?: () => void;
    onForgetPositions?: () => void;
    /** metatrash.com: opens My Submissions, the forms sent from all the person's spaces (0.36.0). */
    onSubmissions?: () => void;
    /** metatrash.com: things waiting for this person in all their spaces (to read, to review, sent back; 0.36.0): a red number on the account icon. */
    todo?: number;
    /** What that number is made of, a line per space, such as "HR: 2 to review"; href opens that space. */
    todoSpaces?: { text: string; href: string | null }[];
  }

  let {
    menu, title, detail, dirty, backTo, forwardTo, onBack, onForward, onFind, sync = null, onSync, syncOpen = false,
    editing = null, onEditing, changes = null, onChanges, theme = 'system', onTheme, onPrint, signedIn = true, account = '', space = null,
    rememberPositions = true, onRememberPositions, onForgetPositions, onSubmissions, todo = 0, todoSpaces = [],
  }: Props = $props();

  /** metatrash.com: the space picker's anchor while it is open. */
  let picker = $state<DOMRect | null>(null);
  let accountOpen = $state(false);
  /** metatrash.com: the theme menu (0.36.0, the space picker's look instead of the browser's list). */
  let themeOpen = $state(false);

  function togglePicker(event: MouseEvent) {
    accountOpen = false;
    themeOpen = false;
    picker = picker ? null : (event.currentTarget as HTMLElement).getBoundingClientRect();
  }

  /** Signs this browser out (POST /api/v1/site/logout with the session's token), then home. */
  async function signOut() {
    accountOpen = false;
    try {
      const { csrf } = await pickerSession();
      const res = await fetch('/api/v1/site/logout', { method: 'POST', headers: csrf ? { 'X-Metatrash-CSRF': csrf } : {}, credentials: 'same-origin' });
      if (res.ok) forgetPlace();
      location.href = res.ok ? '/' : '/account';
    } catch {
      location.href = '/account';
    }
  }

  function closeAccount(event: PointerEvent) {
    const target = event.target as Element | null;
    if (accountOpen && !target?.closest('[data-account-menu]')) accountOpen = false;
    if (themeOpen && !target?.closest('[data-theme-menu]')) themeOpen = false;
  }

  const themes: { value: ThemePref; label: string; hint: string }[] = [
    { value: 'system', label: 'Match system', hint: 'Follows your device' },
    { value: 'light', label: 'Light', hint: 'White pages' },
    { value: 'dark', label: 'Dark', hint: 'Light text on dark' },
    { value: 'paper', label: 'Paper', hint: 'Soft, warm pages' },
  ];

  const appWindow = backend.window;
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
<header class="titlebar" class:custom={customTitleBar && capabilities.windows} class:web={!capabilities.menuBar} data-tauri-drag-region>
  {#if !capabilities.menuBar}
    <!-- The website: the site's own wordmark, home, instead of the app's icon and menus.
         An edition's brand may bring its own wordmark (editionTypes.ts Brand). -->
    {#if brand.wordmark}
      <a class="brand brand-mark" href="/" onclick={goingHome} aria-label="{brand.name} home"><brand.wordmark /></a>
    {:else}
      <a class="brand" href="/" onclick={goingHome}>{brand.name.toLowerCase()}<span>.</span></a>
    {/if}
  {:else if customTitleBar}
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
    {#if sync && !onSync}
      <span class="sync {sync.tone}" title={sync.title}><span class="dot"></span>{sync.label}</span>
    {:else if sync}
      <button
        class="sync {sync.tone}"
        class:open={syncOpen}
        data-sync-chip
        title={syncOpen ? sync.title : `${sync.title}\nClick for recent activity and Sync now`}
        aria-haspopup="dialog"
        aria-expanded={syncOpen}
        onclick={event => onSync?.(event.currentTarget.getBoundingClientRect())}
      >
        <span class="dot"></span>{sync.label}
      </button>
    {/if}
    {#if editing !== null}
      <button
        class="switch"
        role="switch"
        aria-checked={editing}
        title={editing ? 'Editing is on: changes save to the space (Ctrl+S). Click to only read.' : 'Reading only. Click to edit this space.'}
        onclick={() => onEditing?.(!editing)}
      >
        <span class="track"><span class="knob"></span></span>Edit
      </button>
    {/if}
    {#if changes !== null}
      <button
        class="changes"
        aria-pressed={changes}
        title={changes ? 'Hide changes (Ctrl+Shift+D)' : 'Show what changed since the last version (Ctrl+Shift+D)'}
        aria-label={changes ? 'Hide changes' : 'Show changes'}
        onclick={() => onChanges?.()}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v8M8 8h8M8 18h8" /></svg>
      </button>
    {/if}
    <button title="Find in document (Ctrl+F)" aria-label="Find in document" onclick={onFind}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.5 4.5a6 6 0 1 1 0 12a6 6 0 0 1 0-12zM15 15l5 5" /></svg>
    </button>
    {#if !capabilities.menuBar}
      {#if onPrint}
        <button class="print" title="Print (Ctrl+P)" aria-label="Print" onclick={onPrint}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 9V4h10v5M7 17H5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2M7 14h10v6H7z" /></svg>
        </button>
      {/if}
      {#if onTheme}
        <div class="theme-wrap" data-theme-menu>
          <button
            class="theme"
            title={`Theme: ${themes.find(option => option.value === theme)?.label ?? ''}`}
            aria-label="Theme"
            aria-haspopup="menu"
            aria-expanded={themeOpen}
            onclick={() => { picker = null; accountOpen = false; themeOpen = !themeOpen; }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18zM12 3v18" /></svg>
          </button>
          {#if themeOpen}
            <div class="theme-menu dropdown" role="menu" aria-label="Theme">
              <div class="dropdown-label">Theme</div>
              {#each themes as option (option.value)}
                <button
                  role="menuitemradio"
                  class="dropdown-row"
                  class:current={option.value === theme}
                  aria-checked={option.value === theme}
                  onclick={() => { themeOpen = false; onTheme?.(option.value); }}
                >
                  <span class="dropdown-tick" aria-hidden="true">{option.value === theme ? '✓' : ''}</span>
                  <span class="dropdown-what"><span>{option.label}</span><span class="dropdown-sub">{option.hint}</span></span>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
      {#each headerAdditions as addition (addition.id)}
        <addition.component {signedIn} {account} />
      {/each}
      <button
        class="change"
        data-space-picker
        title="Open another space"
        aria-haspopup="dialog"
        aria-expanded={!!picker}
        onclick={togglePicker}
      ><span class="wide">Change Space</span><span class="phone">Spaces</span></button>
      {#if signedIn}
        <div class="account" data-account-menu>
          <button
            class="who"
            title={`${account ? `Signed in as ${account}` : 'Your account'}${todo ? `\n${todoSpaces.length ? todoSpaces.map(line => line.text).join('\n') : `${todo} waiting for you`}` : ''}`}
            aria-label={todo ? `Your account, ${todo} waiting for you` : 'Your account'}
            aria-haspopup="menu"
            aria-expanded={accountOpen}
            onclick={() => { picker = null; themeOpen = false; accountOpen = !accountOpen; }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0 0-8a4 4 0 0 0 0 8zM4 20a8 8 0 0 1 16 0" /></svg>
            {#if todo}<span class="count" aria-hidden="true">{todo > 99 ? '99+' : todo}</span>{/if}
          </button>
          {#if accountOpen}
            <div class="account-menu dropdown" role="menu">
              {#if account}
                <div class="signed"><span class="dropdown-sub">Signed in as</span><strong>{account}</strong></div>
              {/if}
              {#if todo && todoSpaces.length}
                <div class="dropdown-label">Waiting for you</div>
                <div class="waiting-list">
                  {#each todoSpaces as line (line.text)}
                    {#if line.href}
                      <a role="menuitem" class="dropdown-row waiting" href={line.href} title="Open this space" onclick={() => (accountOpen = false)}>
                        <span class="dropdown-tick" aria-hidden="true"><span class="red-dot"></span></span><span class="dropdown-what">{line.text}</span>
                      </a>
                    {:else}
                      <div class="dropdown-row waiting here"><span class="dropdown-tick" aria-hidden="true"><span class="red-dot"></span></span><span class="dropdown-what">{line.text}</span></div>
                    {/if}
                  {/each}
                </div>
                <hr />
              {/if}
              {#if onSubmissions}
                <button role="menuitem" class="dropdown-row" onclick={() => { accountOpen = false; onSubmissions?.(); }}>
                  <span class="dropdown-tick"></span>
                  <span class="dropdown-what"><span>My Submissions</span><span class="dropdown-sub">Forms you sent or started, in all your spaces</span></span>
                </button>
              {/if}
              <a role="menuitem" class="dropdown-row" href="#settings/spaces" onclick={() => (accountOpen = false)}>
                <span class="dropdown-tick"></span><span class="dropdown-what"><span>Settings</span><span class="dropdown-sub">Your spaces, sharing and account</span></span>
              </a>
              {#if onRememberPositions || onForgetPositions}<hr />{/if}
              {#if onRememberPositions}
                <button role="menuitemcheckbox" class="dropdown-row" aria-checked={rememberPositions} title="Each document opens where you left it, in this browser" onclick={() => { accountOpen = false; onRememberPositions?.(); }}>
                  <span class="dropdown-tick" aria-hidden="true">{rememberPositions ? '✓' : ''}</span><span class="dropdown-what">Remember position in each document</span>
                </button>
              {/if}
              {#if onForgetPositions}
                <button role="menuitem" class="dropdown-row" onclick={() => { accountOpen = false; onForgetPositions?.(); }}>
                  <span class="dropdown-tick"></span><span class="dropdown-what">Forget document positions</span>
                </button>
              {/if}
              <hr />
              <button role="menuitem" class="dropdown-row" onclick={() => void signOut()}>
                <span class="dropdown-tick"></span><span class="dropdown-what">Sign out</span>
              </button>
            </div>
          {/if}
        </div>
      {:else}
        <a class="change" href="/login" title="Sign in to open your own spaces">Sign In</a>
      {/if}
    {/if}
  </div>

  {#if customTitleBar && capabilities.windows}
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

<svelte:window onpointerdown={closeAccount} onkeydown={event => { if (event.key === 'Escape' && (accountOpen || themeOpen)) { accountOpen = false; themeOpen = false; } }} />

{#if picker}
  <SpacePicker anchor={picker} current={space} onClose={() => (picker = null)} />
{/if}

<style>
  .titlebar {
    flex: none; display: flex; align-items: center; gap: 4px;
    height: 44px; padding: 0 10px; box-sizing: border-box; user-select: none;
    background: var(--side-bar); color: var(--side-fg); border-bottom: 1px solid var(--side-border);
    font: 13px/1.2 Inter, "Segoe UI", system-ui, sans-serif;
  }
  .titlebar.custom { padding-right: 0; }
  .logo { width: 18px; height: 18px; margin: 0 6px 0 4px; }
  .brand { margin: 0 6px 0 6px; color: var(--side-fg); font-weight: 700; font-size: 17px; letter-spacing: -.02em; text-decoration: none; }
  .brand span { color: var(--side-accent); }
  /* An edition's wordmark: an inline SVG drawn at the text wordmark's height. */
  .brand-mark { display: inline-flex; align-items: center; height: 22px; }
  .brand-mark :global(svg) { height: 100%; width: auto; display: block; }
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
  .sync.open { background: var(--side-hover); color: var(--side-fg); }
  /* Green when synced, orange (pulsing) while syncing, yellow when it needs a look, red on errors. */
  .dot { width: 8px; height: 8px; border-radius: 50%; background: #2e9d5b; }
  .sync.busy .dot { background: #f08a24; animation: pulse 1.2s ease-in-out infinite; }
  .sync.warn .dot { background: #d9b100; }
  .sync.error .dot { background: #c0392b; }
  @keyframes pulse { 50% { opacity: .3; } }
  .sync:not(button) { display: flex; align-items: center; box-sizing: border-box; color: var(--side-muted); }
  .switch {
    display: flex; gap: 7px; width: auto; height: 28px; padding: 0 8px; font: inherit; font-size: 12px;
  }
  .track {
    position: relative; width: 26px; height: 14px; border-radius: 7px; background: var(--side-border); transition: background .15s;
  }
  .knob {
    position: absolute; top: 2px; left: 2px; width: 10px; height: 10px; border-radius: 50%; background: var(--side-bar); transition: left .15s;
  }
  .switch[aria-checked="true"] { color: var(--side-fg); }
  .switch[aria-checked="true"] .track { background: var(--side-accent); }
  .switch[aria-checked="true"] .knob { left: 14px; }
  .changes[aria-pressed="true"] { background: var(--side-hover); color: var(--side-accent); }
  .theme {
    position: relative; display: grid; place-items: center; width: 32px; height: 32px; color: var(--side-muted); border-radius: 6px;
  }
  .theme:hover { background: var(--side-hover); color: var(--side-fg); }
  button.theme { padding: 0; font: inherit; background: none; border: 0; cursor: pointer; }
  .theme[aria-expanded="true"] { background: var(--side-hover); color: var(--side-fg); }
  .theme-wrap { position: relative; }
  .theme-menu { position: absolute; right: 0; top: 38px; z-index: 4000; width: 250px; }
  .change {
    display: flex; align-items: center; height: 28px; padding: 0 10px; margin-left: 4px;
    color: var(--side-fg); font-size: 12px; text-decoration: none; white-space: nowrap;
    border: 1px solid var(--side-border); border-radius: 14px;
  }
  .change:hover { background: var(--side-hover); }
  button.change { width: auto; font: inherit; font-size: 12px; cursor: pointer; }
  button.change[aria-expanded="true"] { background: var(--side-hover); }
  .account { position: relative; margin-left: 2px; }
  .account-menu { position: absolute; right: 0; top: 38px; z-index: 4000; width: min(300px, calc(100vw - 16px)); }
  .signed { display: flex; flex-direction: column; gap: 2px; padding: 2px 10px 10px; margin-bottom: 4px; border-bottom: 1px solid var(--side-border); }
  .signed strong { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .waiting-list { max-height: 40vh; overflow: auto; }
  .account-menu .waiting { color: #d93025; font-weight: 600; cursor: default; }
  .account-menu a.waiting { cursor: pointer; }
  .red-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #d93025; vertical-align: 1px; }
  .account-menu div.waiting:hover { background: none; }
  .who { position: relative; }
  .count {
    position: absolute; top: 2px; right: 0; min-width: 16px; height: 16px; padding: 0 4px; box-sizing: border-box;
    border-radius: 8px; background: #d93025; color: #fff; font: 700 10px/16px Inter, "Segoe UI", system-ui, sans-serif;
    text-align: center; pointer-events: none;
  }
  .phone { display: none; }
  /* A phone on the website: the title and the switches that matter, nothing else. */
  @media (max-width: 800px) {
    .web { gap: 2px; padding: 0 6px; }
    .web .brand { margin: 0 4px; font-size: 15px; }
    .web .brand-mark { height: 18px; }
    .web .nav, .web .detail, .web .print, .web .sync { display: none; }
    .web .tools { margin-right: 0; }
    .web .switch { padding: 0 4px; }
    .web .change { padding: 0 8px; margin-left: 2px; }
    .web .wide { display: none; }
    .web .phone { display: inline; }
  }
  /* Wrap website tools on small screens rather than squeeze out an edition action. */
  @media (max-width: 600px) {
    .web { height: auto; min-height: 44px; flex-wrap: wrap; padding-block: 5px; }
    .web .title { min-width: 40px; height: 32px; }
    .web .tools { margin-left: auto; flex-wrap: wrap; align-items: center; justify-content: flex-end; max-width: 100%; }
  }
  .controls { display: flex; align-self: stretch; }
  .control { width: 46px; height: 100%; border-radius: 0; color: var(--side-fg); }
  .control svg { width: 11px; height: 11px; stroke-width: 1.1; stroke-linecap: butt; stroke-linejoin: miter; }
  .control.close:hover { background: #c42b1c; color: #fff; }
</style>
