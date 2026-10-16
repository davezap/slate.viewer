<script lang="ts">
  import { onMount } from 'svelte';
  import { homeDir } from '@tauri-apps/api/path';
  import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
  import { open as openDialog } from '@tauri-apps/plugin-dialog';
  import { openUrl } from '@tauri-apps/plugin-opener';
  import {
    DEFAULT_SERVER, defaultSpaceFolder, findRegistration, isCloudSyncedFolder, isSignedOut, mtsync, parseSpaceRef,
    type MtsyncInfo, type SpaceRef, type SpaceRow,
  } from './space';

  interface Props {
    /** The space's local folder is ready: open it (and `ref.path`, once it has downloaded). */
    onOpened: (folder: string, ref: SpaceRef) => void;
    onClose: () => void;
  }

  let { onOpened, onClose }: Props = $props();

  type Step = 'pick' | 'not-connected' | 'signing-in' | 'folder' | 'working';
  let step = $state<Step>('pick');
  let input = $state('');
  let error = $state('');
  let info = $state<MtsyncInfo | null>(null);
  let spaces = $state<SpaceRow[] | null>(null);
  let signedOut = $state(false);
  let loginUrl = $state('');
  let ref = $state<SpaceRef | null>(null);
  let folder = $state('');
  let working = $state('');
  let field = $state<HTMLInputElement>();

  const missing = $derived(info !== null && (!info.path || !info.supported));

  async function loadSpaces(server = DEFAULT_SERVER) {
    signedOut = false;
    try {
      spaces = await mtsync.spaces(server);
    } catch (e) {
      spaces = [];
      if (isSignedOut(String(e))) signedOut = true;
      else error = String(e);
    }
  }

  onMount(() => {
    let unlisten: (() => void) | undefined;
    void getCurrentWebviewWindow().listen<string>('mtsync-login-url', event => { loginUrl = event.payload; }).then(fn => (unlisten = fn));
    void (async () => {
      info = await mtsync.info();
      if (!missing) await loadSpaces();
    })();
    field?.focus();
    return () => {
      unlisten?.();
      if (step === 'signing-in') void mtsync.cancelLogin();
    };
  });

  async function connect() {
    error = '';
    loginUrl = '';
    const back = step;
    step = 'signing-in';
    try {
      await mtsync.login(ref?.server ?? DEFAULT_SERVER);
      step = 'pick';
      await loadSpaces(ref?.server ?? DEFAULT_SERVER);
      if (ref) await go();
    } catch (e) {
      step = back === 'signing-in' ? 'pick' : back;
      error = String(e);
    }
  }

  async function go(text = input) {
    error = '';
    const parsed = typeof text === 'string' ? parseSpaceRef(text) : text;
    if (typeof parsed === 'string') { error = parsed; return; }
    ref = parsed;
    step = 'working';
    working = 'Checking the space…';
    try {
      const rows = parsed.server === DEFAULT_SERVER && spaces?.length ? spaces : await mtsync.spaces(parsed.server);
      if (!rows.some(r => r.space === parsed.space)) { step = 'not-connected'; return; }

      // One space, one local folder: reuse the folder this computer already syncs it to.
      const existing = findRegistration(await mtsync.list(), parsed.space, parsed.server);
      if (existing) {
        if (existing.state.startsWith('service not running')) await mtsync.start();
        onOpened(existing.folder, parsed);
        return;
      }
      folder = defaultSpaceFolder(await homeDir(), parsed.space);
      step = 'folder';
    } catch (e) {
      step = 'pick';
      if (isSignedOut(String(e))) signedOut = true;
      error = String(e);
    }
  }

  async function browse() {
    const picked = await openDialog({ directory: true, multiple: false, defaultPath: folder });
    if (typeof picked === 'string') folder = picked;
  }

  async function register() {
    if (!ref || !folder.trim()) return;
    error = '';
    step = 'working';
    working = 'Setting up the folder…';
    try {
      // Always the whole space; a subfolder in the address is opened inside it.
      const out = await mtsync.add(ref.space, folder.trim(), ref.server);
      if (/not running/i.test(out.stdout + out.stderr)) {
        working = 'Starting Metatrash Sync…';
        await mtsync.start();
      }
      onOpened(folder.trim(), ref);
    } catch (e) {
      const message = String(e);
      if (/not connected/i.test(message)) { step = 'not-connected'; return; }
      step = 'folder';
      error = /overlaps/i.test(message)
        ? `${message}\nChoose a folder outside the one that already syncs, or open that one instead.`
        : message;
    }
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && step !== 'signing-in') { event.preventDefault(); onClose(); }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" onclick={() => { if (step !== 'signing-in') onClose(); }}>
  <div class="panel" role="dialog" tabindex="-1" aria-label="Open Space" onclick={event => event.stopPropagation()}>
    <h2>Open Space</h2>

    {#if info && !info.path}
      <p>Opening a space needs <b>mtsync</b>, the Metatrash Sync program, which isn't on this computer yet.</p>
      <p class="muted">Put the mtsync program at <code>{info.installHint}</code> (or anywhere on your PATH), run <code>mtsync install</code> once, then try again.</p>
      <div class="buttons"><button class="primary" onclick={onClose}>OK</button></div>
    {:else if info && !info.supported}
      <p>This computer has {info.version ?? 'an old mtsync'}; Slate Viewer needs mtsync {info.minVersion} or later.</p>
      <p class="muted">Run <code>mtsync stop</code>, replace <code>{info.path}</code> with the new version, then <code>mtsync start</code>.</p>
      <div class="buttons"><button class="primary" onclick={onClose}>OK</button></div>
    {:else if step === 'pick'}
      <p class="muted">Paste a space's address, or type <code>owner/space</code> (add <code>/folder</code> or <code>/note.md</code> to go straight there).</p>
      <input
        bind:this={field}
        bind:value={input}
        placeholder="https://metatrash.com/spaces/owner/space/"
        spellcheck="false"
        onkeydown={event => { if (event.key === 'Enter') { event.preventDefault(); void go(); } }}
      />
      {#if signedOut}
        <p class="note">This computer isn't signed in to Metatrash. Connect to sign in in your browser and choose which spaces this computer can use.</p>
      {:else if spaces && spaces.length}
        <p class="label">Connected to this computer</p>
        <ul class="spaces">
          {#each spaces as row (row.space)}
            <li>
              <button onclick={() => void go(row.space)}>
                <span class="name">{row.name || row.space}</span>
                <span class="muted">{row.space}{row.access === 'read only' ? ' · read only' : ''}</span>
              </button>
            </li>
          {/each}
        </ul>
      {:else if spaces}
        <p class="note">No spaces are connected to this computer yet.</p>
      {:else}
        <p class="muted">Looking for your spaces…</p>
      {/if}
      {#if error}<p class="error">{error}</p>{/if}
      <div class="buttons">
        <button onclick={() => void connect()}>{signedOut ? 'Connect…' : 'Connect More Spaces…'}</button>
        <span class="grow"></span>
        <button onclick={onClose}>Cancel</button>
        <button class="primary" disabled={!input.trim()} onclick={() => void go()}>Open</button>
      </div>
    {:else if step === 'not-connected'}
      <p><b>{ref?.space}</b> isn't connected to this computer yet.</p>
      <p class="muted">If it was shared with you, accept the invitation on your Metatrash account first. Then choose Connect to pick it in your browser.</p>
      {#if error}<p class="error">{error}</p>{/if}
      <div class="buttons">
        <button onclick={() => { step = 'pick'; }}>Back</button>
        <span class="grow"></span>
        <button onclick={() => void openUrl(`${ref?.server ?? DEFAULT_SERVER}/account`)}>Open My Account</button>
        <button class="primary" onclick={() => void connect()}>Connect…</button>
      </div>
    {:else if step === 'signing-in'}
      <p>Waiting for you to finish in the browser…</p>
      <p class="muted">Sign in, tick the spaces this computer may use, and approve. A new email address creates an account.</p>
      {#if loginUrl}
        <p class="muted">If the browser didn't open: <button class="link" onclick={() => void openUrl(loginUrl)}>open the sign-in page</button>.</p>
      {/if}
      <div class="buttons"><span class="grow"></span><button onclick={() => void mtsync.cancelLogin()}>Cancel</button></div>
    {:else if step === 'folder'}
      <p>Where should <b>{ref?.space}</b> be kept on this computer?</p>
      <p class="muted">The whole space is copied to this folder and kept in sync both ways.</p>
      <div class="row">
        <input bind:value={folder} spellcheck="false" />
        <button onclick={() => void browse()}>Browse…</button>
      </div>
      {#if isCloudSyncedFolder(folder)}
        <p class="note">This looks like a OneDrive, Dropbox or iCloud folder. Two sync programs on one folder fight over changes, so a folder outside it is safer.</p>
      {/if}
      {#if error}<p class="error">{error}</p>{/if}
      <div class="buttons">
        <button onclick={() => { step = 'pick'; error = ''; }}>Back</button>
        <span class="grow"></span>
        <button class="primary" disabled={!folder.trim()} onclick={() => void register()}>Sync and Open</button>
      </div>
    {:else}
      <p>{working}</p>
    {/if}
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; z-index: 2500; background: rgb(0 0 0 / .22); display: grid; place-items: start center; }
  .panel {
    width: min(560px, calc(100% - 32px)); margin-top: 70px; padding: 18px 20px 16px; box-sizing: border-box;
    background: var(--side-input); color: var(--side-fg);
    border: 1px solid var(--side-border); border-radius: 10px; box-shadow: 0 16px 50px rgb(0 0 0 / .28);
    font: 13px/1.45 Inter, "Segoe UI", system-ui, sans-serif;
  }
  h2 { margin: 0 0 10px; font-size: 16px; }
  p { margin: 0 0 10px; }
  .muted { color: var(--side-muted); }
  .note { padding: 8px 10px; border-radius: 6px; background: var(--side-accent-soft); }
  .error { color: #c0392b; white-space: pre-line; }
  code { font-size: 12px; padding: 1px 4px; border-radius: 3px; background: var(--side-hover); overflow-wrap: anywhere; }
  input {
    box-sizing: border-box; width: 100%; margin: 0 0 12px; padding: 7px 9px; font: inherit; color: inherit;
    background: var(--side-bg); border: 1px solid var(--side-border); border-radius: 6px; outline: none;
  }
  input:focus { border-color: var(--side-accent); }
  .row { display: flex; gap: 6px; }
  .row input { flex: 1; }
  .row button { margin-bottom: 12px; }
  .label { margin: 4px 0 4px; font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--side-muted); }
  .spaces { list-style: none; margin: 0 0 12px; padding: 0; max-height: 220px; overflow: auto; }
  .spaces button {
    display: flex; justify-content: space-between; gap: 12px; width: 100%; padding: 6px 8px; text-align: left;
    font: inherit; color: inherit; background: none; border: 0; border-radius: 5px; cursor: pointer;
  }
  .spaces button:hover { background: var(--side-hover); }
  .name { font-weight: 600; }
  .buttons { display: flex; gap: 8px; align-items: center; margin-top: 6px; }
  .grow { flex: 1; }
  .buttons button, .row button {
    padding: 6px 14px; font: inherit; color: inherit; background: var(--side-bg);
    border: 1px solid var(--side-border); border-radius: 6px; cursor: pointer;
  }
  .buttons button:hover:not(:disabled), .row button:hover { background: var(--side-hover); }
  .buttons button.primary { color: #fff; background: var(--side-accent); border-color: var(--side-accent); }
  :global([data-theme="dark"]) .buttons button.primary { color: #1d1a22; }
  .buttons button:disabled { opacity: .5; cursor: default; }
  .link { padding: 0; font: inherit; color: var(--side-accent); background: none; border: 0; text-decoration: underline; cursor: pointer; }
</style>
