<script lang="ts">
  import { basename } from './paths';
  import Section from './Section.svelte';
  import { fileHistory, formatWhen, relativeWhen, describeOperation, type HistoryEntry } from './history';

  interface Props {
    /** The open space file, or null when the document isn't in a space. */
    file: string | null;
    /** Bumped when the file was saved or changed, to reload the list. */
    stamp: number;
    /** The revision being compared, to mark it. */
    comparing: string | null;
    onCompare: (entry: HistoryEntry) => void;
  }

  let { file, stamp, comparing, onCompare }: Props = $props();

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
    <p class="hint">Pick a version to compare it with the document. Use its parts, or all of it, then save.</p>
    <ul>
      {#each entries as entry, i (entry.revision + i)}
        {@const unavailable = entry.operation === 'delete' || !entry.file}
        <li>
          <button
            type="button"
            class:current={comparing === entry.revision}
            disabled={unavailable}
            title={unavailable
              ? (entry.operation === 'delete' ? 'Deleted here: no text to compare' : `Was outside this folder (${entry.path})`)
              : `${entry.path} · ${entry.revision.slice(0, 12)}`}
            onclick={() => onCompare(entry)}
          >
            <span class="when">{formatWhen(entry.timestamp)}</span>
            <span class="what">
              {describeOperation(entry, entries[i + 1]?.path ?? null)}
              {#if i === 0}<em>· latest in space</em>{/if}
            </span>
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
  li button.current { background: var(--side-accent-soft); border-left-color: var(--side-accent); }
  li button:disabled { cursor: default; opacity: .55; }
  .when { font-weight: 600; }
  .what { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .what em { font-style: normal; color: var(--side-muted); }
  .ago { font-size: 12px; color: var(--side-muted); }
  .note { margin: 10px 12px; color: var(--side-muted); }
  .note.error { color: #c0392b; white-space: pre-wrap; }
  .more {
    margin: 6px 12px 12px; padding: 5px 10px; font: inherit; color: inherit;
    background: var(--side-input); border: 1px solid var(--side-border); border-radius: 6px; cursor: pointer;
  }
  .more:hover { background: var(--side-hover); }
</style>
