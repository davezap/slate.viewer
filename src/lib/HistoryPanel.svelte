<script lang="ts">
  import { basename } from './paths';
  import Section from './Section.svelte';
  import { fileHistory, formatWhen, relativeWhen, describeOperation, describeAuthor, entryLabel, type HistoryEntry } from './history';

  interface Props {
    /** The open space file, or null when the document isn't in a space. */
    file: string | null;
    /** Bumped when the file was saved or changed, to reload the list. */
    stamp: number;
    /** The revision being merged with Compare, to mark it. */
    comparing: string | null;
    /** Show Changes: the version changes are shown from, and the one they go to (null: the text on screen). */
    from: HistoryEntry | null;
    to: HistoryEntry | null;
    /** A click picks the version to show changes from; Ctrl+click (`second`) the one to show them to. */
    onPick: (entry: HistoryEntry, second: boolean) => void;
    /** Merge parts of a version into the document (Slate's Compare). */
    onMerge: (entry: HistoryEntry) => void;
    onClear: () => void;
  }

  let { file, stamp, comparing, from, to, onPick, onMerge, onClear }: Props = $props();

  let entries = $state<HistoryEntry[]>([]);
  let nextOffset = $state<number | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let generation = 0;

  async function load(target: string | null, more = false) {
    const mine = ++generation;
    if (!more) { entries = []; nextOffset = null; }
    error = null;
    if (!target) return;
    loading = true;
    try {
      const page = await fileHistory(target, more ? nextOffset ?? 0 : 0);
      if (mine !== generation) return;
      entries = more ? [...entries, ...page.entries] : page.entries;
      nextOffset = page.nextOffset;
    } catch (failure) {
      if (mine === generation) error = String(failure);
    } finally {
      if (mine === generation) loading = false;
    }
  }

  $effect(() => { void stamp; void load(file); });
</script>

<Section title="History" detail={file ? basename(file) : undefined} tooltip={file ?? undefined}>
  {#snippet actions()}
    {#if file}<button type="button" title="Refresh" aria-label="Refresh history" onclick={() => void load(file)}>↻</button>{/if}
  {/snippet}
  <div class="history">

  {#if !file}
    <p class="note">Version history is kept for files in a Metatrash space. Open a space file to see its versions.</p>
  {:else if error}
    <p class="note error">{error}</p>
    <button class="more" type="button" onclick={() => void load(file)}>Try Again</button>
  {:else}
    <p class="hint">Click a version to see what changed since then. Ctrl+click a second one to see what changed between the two.{#if entries.some(e => e.published?.length)} Published versions are marked; the changes above the newest one are a draft.{/if}</p>
    {#if from}
      <div class="picked">
        <span>Changes from <b>{entryLabel(from)}</b> to <b>{to ? entryLabel(to) : 'the text on screen'}</b></span>
        <span class="picked-actions">
          {#if !to}<button type="button" title="Bring parts of {entryLabel(from)} back into the document, then save" onclick={() => onMerge(from)}>Merge…</button>{/if}
          <button type="button" onclick={onClear}>Clear</button>
        </span>
      </div>
    {/if}
    <ul>
      {#each entries as entry, i (entry.revision + i)}
        {@const unavailable = entry.operation === 'delete' || !entry.file}
        <li>
          <button
            type="button"
            class:current={comparing === entry.revision}
            class:from={from?.revision === entry.revision}
            class:to={to?.revision === entry.revision}
            disabled={unavailable}
            title={unavailable
              ? (entry.operation === 'delete' ? 'Deleted here: no text to compare' : `Was outside this folder (${entry.path})`)
              : `${entry.path} · ${entry.revision.slice(0, 12)}\nClick: changes since this version · Ctrl+click: changes up to it`}
            onclick={event => onPick(entry, event.ctrlKey || event.metaKey)}
          >
            <span class="when">
              {formatWhen(entry.timestamp)}
              {#if entry.published?.length}
                {@const versions = entry.published.join(', ')}
                <span class="published" title="The official text of version {versions}: what people were asked to read">
                  <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5l1.6 1.2 2-.1.6 1.9 1.6 1.2-.6 1.9.6 1.9-1.6 1.2-.6 1.9-2-.1L8 14.5l-1.6-1.2-2 .1-.6-1.9-1.6-1.2.6-1.9-.6-1.9 1.6-1.2.6-1.9 2 .1z" /><path d="M5.6 8.1l1.6 1.6 3.2-3.3" /></svg>
                  Published v{versions}
                </span>
              {/if}
            </span>
            <span class="what">
              {describeOperation(entry, entries[i + 1]?.path ?? null)}
              {#if i === 0}<em>· latest in space</em>{/if}
              {#if from?.revision === entry.revision}<span class="pick">From</span>{:else if to?.revision === entry.revision}<span class="pick">To</span>{/if}
            </span>
            {#if describeAuthor(entry.by)}<span class="who">by {describeAuthor(entry.by)}</span>{/if}
            <span class="ago">{relativeWhen(entry.timestamp)}</span>
          </button>
        </li>
      {:else}
        {#if !loading}<li class="note">No versions yet. A file gets history once mtsync has uploaded it.</li>{/if}
      {/each}
    </ul>
    {#if loading}
      <p class="note">Loading…</p>
    {:else if nextOffset !== null}
      <button class="more" type="button" onclick={() => void load(file, true)}>Show Older Versions</button>
    {/if}
  {/if}
  </div>
</Section>

<style>
  .history {
    flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden;
    font: 13px/1.35 Inter, "Segoe UI", system-ui, sans-serif;
  }
  .hint { margin: 8px 12px 4px; color: var(--side-muted); font-size: 12px; }
  ul { list-style: none; margin: 0; padding: 4px; overflow: auto; flex: 1 1 auto; min-height: 0; }
  li button {
    display: grid; width: 100%; padding: 6px 8px; gap: 1px; text-align: left;
    font: inherit; color: inherit; background: none; border: 0; border-left: 3px solid transparent; border-radius: 4px; cursor: pointer;
  }
  li button:hover:not(:disabled) { background: var(--side-hover); }
  li button.current, li button.from, li button.to { background: var(--side-accent-soft); border-left-color: var(--side-accent); }
  .pick {
    margin-left: 6px; padding: 0 5px; border-radius: 4px; font-size: 11px; font-weight: 600;
    color: #fff; background: var(--side-accent);
  }
  :global([data-theme="dark"]) .pick { color: #1d1a22; }
  .picked {
    display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; margin: 4px 8px; padding: 6px 8px;
    font-size: 12px; border: 1px solid var(--side-border); border-radius: 6px; background: var(--side-input);
  }
  .picked-actions { display: inline-flex; gap: 6px; margin-left: auto; }
  .picked button {
    padding: 2px 8px; font: inherit; color: inherit; cursor: pointer;
    background: var(--side-bg); border: 1px solid var(--side-border); border-radius: 5px;
  }
  .picked button:hover { background: var(--side-hover); }
  li button:disabled { cursor: default; opacity: .55; }
  .when { font-weight: 600; display: flex; flex-wrap: wrap; align-items: center; gap: 2px 8px; }
  .published {
    display: inline-flex; align-items: center; gap: 3px; padding: 0 6px 0 3px; border-radius: 9px;
    font-size: 11px; font-weight: 600; color: var(--side-accent); background: var(--side-accent-soft);
  }
  .published svg { width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 1.2; stroke-linejoin: round; stroke-linecap: round; }
  .what { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .what em { font-style: normal; color: var(--side-muted); }
  .ago { font-size: 12px; color: var(--side-muted); }
  .who { font-size: 12px; color: var(--side-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .note { margin: 10px 12px; color: var(--side-muted); }
  .note.error { color: #c0392b; white-space: pre-wrap; }
  .more {
    margin: 6px 12px 12px; padding: 5px 10px; font: inherit; color: inherit;
    background: var(--side-input); border: 1px solid var(--side-border); border-radius: 6px; cursor: pointer;
  }
  .more:hover { background: var(--side-hover); }
</style>
