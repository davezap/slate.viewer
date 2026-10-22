<script lang="ts">
  // The bar above a document in a folder that publishes versions: which version it is, whether a
  // draft is shown instead, and (when people are asked to) I Have Read This.
  import { describeAuthor, formatWhen } from './history';
  import type { PolicyFile, PolicyFolder } from './policies';

  interface Props {
    folder: PolicyFolder;
    /** The file's published entry, or null when it is new since the version. */
    file: PolicyFile | null;
    /** The text shown: the published one, or the file as it is now. */
    viewing: 'published' | 'current';
    busy: boolean;
    onShowDraft: () => void;
    onShowPublished: () => void;
    onConfirm: () => void;
  }

  let { folder, file, viewing, busy, onShowDraft, onShowPublished, onConfirm }: Props = $props();

  const where = $derived(folder.folder ? folder.folder.replace(/\/$/, '') : 'this space');
  const by = $derived(describeAuthor(folder.by));
  const published = $derived(`Published version ${folder.version} · ${formatWhen(folder.timestamp)}${by ? ` by ${by}` : ''}`);
  const toRead = $derived(file?.tracked === true && file.outstanding);
  /** The text on screen is the published one: shown from history, or the file has no draft. */
  const readingPublished = $derived(viewing === 'published' || (file !== null && !file.draft));
</script>

<div class="bar" class:to-read={toRead} role="status">
  <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5l1.6 1.2 2-.1.6 1.9 1.6 1.2-.6 1.9.6 1.9-1.6 1.2-.6 1.9-2-.1L8 14.5l-1.6-1.2-2 .1-.6-1.9-1.6-1.2.6-1.9-.6-1.9 1.6-1.2.6-1.9 2 .1z" /><path d="M5.6 8.1l1.6 1.6 3.2-3.3" /></svg>
  <div class="text">
    {#if !file}
      <b>Not published yet.</b> <span>This file is new since version {folder.version} of {where}, so it is a draft until the next version.</span>
    {:else if file.draft && viewing === 'published'}
      <b>{published}</b>
      <span>This is the official text. The file has changed since; those changes are a draft until the next version.</span>
    {:else if file.draft}
      <b>Draft.</b> <span>Changed since published version {folder.version}{toRead ? '; to confirm you have read it, read the published version' : ''}.</span>
    {:else}
      <b>{published}</b>
    {/if}
    {#if toRead && readingPublished}
      <span class="ask">{file?.acknowledged ? `You read version ${file.acknowledged.version}; this version changed it. ` : ''}Please read it, then confirm.</span>
    {:else if file?.tracked && file.acknowledged?.current}
      <span class="done">✓ You confirmed reading it on {formatWhen(file.acknowledged.timestamp)}.</span>
    {/if}
  </div>
  {#if file?.draft && viewing === 'published'}
    <button onclick={onShowDraft} title="Show the file as it is now, with the changes since version {folder.version}">Show Draft</button>
  {:else if file?.draft}
    <button onclick={onShowPublished}>Show Published Version</button>
  {/if}
  {#if toRead && readingPublished}
    <button class="primary" disabled={busy} onclick={onConfirm}>{busy ? 'Confirming…' : 'I Have Read This'}</button>
  {/if}
</div>

<style>
  .bar {
    display: flex; align-items: center; gap: 10px; padding: 7px 14px;
    font: 13px/1.4 Inter, "Segoe UI", system-ui, sans-serif;
    color: var(--side-fg); background: var(--side-bg); border-bottom: 1px solid var(--side-border);
  }
  .bar.to-read { background: var(--side-accent-soft); }
  svg { flex: none; width: 18px; height: 18px; fill: none; stroke: var(--side-accent); stroke-width: 1.2; stroke-linejoin: round; stroke-linecap: round; }
  .text { flex: 1; min-width: 0; }
  .text span { color: var(--side-muted); }
  .text .ask { color: var(--side-fg); font-weight: 600; }
  .text .done { color: var(--side-accent); }
  button {
    flex: none; padding: 4px 12px; font: inherit; color: inherit; cursor: pointer;
    background: var(--side-input); border: 1px solid var(--side-border); border-radius: 6px;
  }
  button:hover:not(:disabled) { background: var(--side-hover); }
  button.primary { color: #fff; background: var(--side-accent); border-color: var(--side-accent); }
  button.primary:hover:not(:disabled) { background: var(--side-accent); filter: brightness(1.08); }
  :global([data-theme="dark"]) .bar button.primary { color: #1d1a22; }
  button:disabled { opacity: .6; cursor: default; }
</style>
