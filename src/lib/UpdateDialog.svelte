<script lang="ts" module>
  /** What a check found (CheckResult in updates.rs). */
  export interface UpdateCheck {
    current: string;
    latest: string | null;
    available: boolean;
    required: boolean;
    mtsyncUpdated: string | null;
    problems: string[];
  }
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import { backend } from './backend';

  interface Props {
    /** What the timer's check found; null for Help > Check for Updates, which checks first. */
    initial: UpdateCheck | null;
    onClose: () => void;
  }

  let { initial, onClose }: Props = $props();

  // svelte-ignore state_referenced_locally
  let result = $state<UpdateCheck | null>(initial);
  let notes = $state<string[] | null>(null);
  let notesError = $state('');
  let selected = $state<string | null>(null);
  let markdown = $state<string | null>(null);
  let installing = $state(false);
  let installError = $state('');
  let frame = $state<HTMLIFrameElement>();
  let frameReady = $state(false);
  const cache = new Map<string, string>();
  const theme = document.documentElement.dataset.theme ?? 'light';

  /** -1, 0 or 1, comparing x.y.z versions (a missing part is 0). */
  function compare(a: string, b: string): number {
    const parse = (v: string) => v.replace(/^v/, '').split('.').map(p => parseInt(p, 10) || 0);
    const [x, y] = [parse(a), parse(b)];
    for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0) ? -1 : 1;
    return 0;
  }
  function tag(version: string): string {
    if (!result) return '';
    const order = compare(version, result.current);
    return order === 0 ? 'Installed' : order > 0 ? 'New' : '';
  }

  /** Shows changenotes_<version>.md from the docs. */
  async function show(version: string) {
    selected = version;
    markdown = cache.get(version) ?? null;
    if (markdown !== null) return;
    try {
      const text = await backend.app.changeNote(version);
      cache.set(version, text);
      if (selected === version) markdown = text;
    } catch (e) {
      if (selected === version) markdown = `# Slate Viewer ${version}\n\nThese notes couldn't be loaded.\n\n${e}`;
    }
  }

  // The frame shows whichever note is picked, once both are ready.
  $effect(() => {
    if (!frameReady || markdown === null || !frame?.contentWindow) return;
    const notesWindow = frame.contentWindow as Window & { slateNotes?: { show(markdown: string): Promise<void> } };
    void notesWindow.slateNotes?.show(markdown);
  });

  onMount(() => {
    const listing = backend.app.changeNotes();
    void (async () => {
      if (!result) result = await backend.app.checkForUpdates();
      let found: string[] = [];
      try {
        found = await listing;
      } catch (e) {
        notesError = String(e);
      }
      // The latest release (GitHub's version) first, listed or not; then the older ones.
      const latest = result.latest;
      notes = latest && !found.some(v => compare(v, latest) === 0) ? [latest, ...found] : found;
      if (notes.length) await show(latest ?? notes[0]);
    })();
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame?.contentWindow) return;
      if (event.data?.type === 'slate-notes-link') void backend.opener.url(event.data.url).catch(() => {});
      if (event.data?.type === 'slate-notes-escape') close();
    };
    addEventListener('message', onMessage);
    return () => removeEventListener('message', onMessage);
  });

  function close() {
    if (installing) return;
    // Closing an offer means "not this version": the timer won't ask about it again.
    if (result?.available && !result.required && result.latest) void backend.app.skipUpdate(result.latest);
    onClose();
  }

  async function update() {
    installing = true;
    installError = '';
    try {
      // Windows: the setup runs and this app quits. Elsewhere the download opens in the browser.
      await backend.app.installUpdate();
      installing = false;
      onClose();
    } catch (e) {
      installing = false;
      installError = String(e);
    }
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" onclick={close}>
  <div class="panel" class:open={result !== null} role="dialog" tabindex="-1" aria-label="Slate Viewer updates" onclick={event => event.stopPropagation()}>
    <button class="x" title="Close" aria-label="Close" disabled={installing} onclick={close}>
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
    </button>

    {#if !result}
      <div class="checking"><span class="spinner"></span>Checking for updates…</div>
    {:else}
      <header>
        {#if result.available && result.required}
          <h2>Slate Viewer {result.latest} is needed</h2>
          <p class="muted">Metatrash now needs a newer Slate Viewer for spaces to keep working. You have {result.current}.</p>
        {:else if result.available}
          <h2>Slate Viewer {result.latest} is available</h2>
          <p class="muted">You have {result.current}.</p>
        {:else if result.latest}
          <h2>Slate Viewer is up to date</h2>
          <p class="muted">You have {result.current}{compare(result.latest, result.current) > 0 ? `; ${result.latest} has no installer for this computer yet` : ', the latest version'}.</p>
        {:else}
          <h2>Couldn't check for updates</h2>
          <p class="muted">You have Slate Viewer {result.current}.</p>
        {/if}
        {#if result.mtsyncUpdated}<p class="note">Metatrash Sync was updated to {result.mtsyncUpdated}.</p>{/if}
        {#if result.problems.length}<p class="error">{result.problems.join('\n')}</p>{/if}
      </header>

      <div class="body">
        {#if notes === null}
          <p class="muted pad">Loading the change notes…</p>
        {:else if !notes.length}
          <p class="muted pad">The change notes aren't available right now.{notesError ? `\n\n${notesError}` : ''}</p>
        {:else}
          <nav aria-label="Versions">
            <p class="label">Change notes</p>
            {#each notes as version (version)}
              <button class:selected={version === selected} onclick={() => void show(version)}>
                <span>{version}</span>
                {#if tag(version)}<span class="tag" class:new={tag(version) === 'New'}>{tag(version)}</span>{/if}
              </button>
            {/each}
          </nav>
          <iframe bind:this={frame} title="Change notes" src={`/notes.html?theme=${theme}`} onload={() => (frameReady = true)}></iframe>
        {/if}
      </div>

      <footer>
        {#if installError}<span class="error">{installError}</span>{/if}
        {#if installing}<span class="muted">Downloading and checking the update…</span>{/if}
        <span class="grow"></span>
        <button disabled={installing} onclick={close}>{result.available ? 'Later' : 'Close'}</button>
        {#if result.available}
          <button class="primary" disabled={installing} onclick={() => void update()}>Update to {result.latest}</button>
        {/if}
      </footer>
    {/if}
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; z-index: 2500; background: rgb(0 0 0 / .22); display: grid; place-items: center; }
  .panel {
    position: relative; display: flex; flex-direction: column; box-sizing: border-box;
    width: 340px; height: 64px; overflow: hidden;
    background: var(--side-input); color: var(--side-fg);
    border: 1px solid var(--side-border); border-radius: 10px; box-shadow: 0 16px 50px rgb(0 0 0 / .28);
    font: 13px/1.45 Inter, "Segoe UI", system-ui, sans-serif;
    transition: width .28s ease, height .28s ease;
  }
  .panel.open { width: min(900px, calc(100vw - 48px)); height: min(680px, calc(100vh - 64px)); }
  .checking { display: flex; align-items: center; gap: 10px; height: 100%; padding: 0 20px; }
  .spinner {
    width: 14px; height: 14px; border-radius: 50%; flex: none;
    border: 2px solid var(--side-border); border-top-color: var(--side-accent); animation: spin .8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .x {
    position: absolute; top: 10px; right: 10px; z-index: 1; display: grid; place-items: center; width: 26px; height: 26px; padding: 0;
    color: var(--side-muted); background: none; border: 0; border-radius: 5px; cursor: pointer;
  }
  .x:hover:not(:disabled) { color: var(--side-fg); background: var(--side-hover); }
  header { padding: 16px 52px 6px 20px; }
  h2 { margin: 0 0 4px; font-size: 16px; }
  p { margin: 0 0 8px; }
  .muted { color: var(--side-muted); white-space: pre-line; }
  .note { padding: 6px 10px; border-radius: 6px; background: var(--side-accent-soft); }
  .error { color: #c0392b; white-space: pre-line; }
  .body { flex: 1; min-height: 0; display: flex; border-top: 1px solid var(--side-border); border-bottom: 1px solid var(--side-border); }
  .pad { padding: 16px 20px; }
  nav { flex: none; width: 150px; padding: 8px 6px; overflow: auto; background: var(--side-bg); border-right: 1px solid var(--side-border); }
  .label { margin: 4px 8px 6px; font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--side-muted); }
  nav button {
    display: flex; justify-content: space-between; align-items: center; gap: 6px; width: 100%; padding: 5px 8px; text-align: left;
    font: inherit; color: inherit; background: none; border: 0; border-radius: 5px; cursor: pointer;
  }
  nav button:hover { background: var(--side-hover); }
  nav button.selected { background: var(--side-accent-soft); font-weight: 600; }
  .tag { font-size: 10px; font-weight: 600; padding: 0 5px; border-radius: 8px; color: var(--side-muted); border: 1px solid var(--side-border); }
  .tag.new { color: #fff; background: var(--side-accent); border-color: var(--side-accent); }
  :global([data-theme="dark"]) .tag.new { color: #1d1a22; }
  iframe { flex: 1; min-width: 0; border: 0; background: var(--app-bg); }
  footer { display: flex; gap: 8px; align-items: center; padding: 10px 16px; }
  .grow { flex: 1; }
  footer button {
    padding: 6px 14px; font: inherit; color: inherit; background: var(--side-bg);
    border: 1px solid var(--side-border); border-radius: 6px; cursor: pointer;
  }
  footer button:hover:not(:disabled) { background: var(--side-hover); }
  footer button.primary { color: #fff; background: var(--side-accent); border-color: var(--side-accent); }
  :global([data-theme="dark"]) footer button.primary { color: #1d1a22; }
  footer button:disabled { opacity: .5; cursor: default; }
</style>
