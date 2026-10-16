<script lang="ts">
  interface Props {
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
  }

  let { title, detail, dirty, backTo, forwardTo, onBack, onForward, onFind }: Props = $props();
</script>

<header class="appbar">
  <div class="nav">
    <button title={backTo ? `Back to ${backTo} (Alt+Left)` : 'Back (Alt+Left)'} aria-label="Back" disabled={!backTo} onclick={onBack}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
    </button>
    <button title={forwardTo ? `Forward to ${forwardTo} (Alt+Right)` : 'Forward (Alt+Right)'} aria-label="Forward" disabled={!forwardTo} onclick={onForward}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
    </button>
  </div>

  <div class="title">
    <span class="name">{title}</span>
    {#if dirty}<span class="dirty" title="Unsaved changes">●</span>{/if}
    {#if detail}<span class="detail">{detail}</span>{/if}
  </div>

  <div class="tools">
    <button title="Find in document (Ctrl+F)" aria-label="Find in document" onclick={onFind}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.5 4.5a6 6 0 1 1 0 12a6 6 0 0 1 0-12zM15 15l5 5" /></svg>
    </button>
  </div>
</header>

<style>
  .appbar {
    flex: none; display: grid; grid-template-columns: 1fr auto 1fr; align-items: center;
    height: 46px; padding: 0 10px; box-sizing: border-box;
    background: var(--side-bar); color: var(--side-fg); border-bottom: 1px solid var(--side-border);
    font: 13px/1.2 Inter, "Segoe UI", system-ui, sans-serif;
  }
  .nav, .tools { display: flex; gap: 2px; }
  .tools { justify-content: flex-end; }
  .title { display: flex; align-items: baseline; gap: 8px; min-width: 0; max-width: 60vw; }
  .name { font-weight: 600; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dirty { color: var(--side-accent); font-size: 10px; }
  .detail { color: var(--side-muted); white-space: nowrap; }
  button {
    display: grid; place-items: center; width: 32px; height: 32px; padding: 0;
    color: var(--side-muted); background: none; border: 0; border-radius: 6px; cursor: pointer;
  }
  button:hover:not(:disabled) { background: var(--side-hover); color: var(--side-fg); }
  button:disabled { opacity: .35; cursor: default; }
  svg { width: 19px; height: 19px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
</style>
