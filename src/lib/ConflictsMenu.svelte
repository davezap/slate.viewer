<script lang="ts">
  import { onMount } from 'svelte';

  /** One conflict copy in the open space: `copy` and `original` are relative to the space. */
  export interface ConflictEntry {
    copy: string;
    original: string;
    /** When Metatrash Sync kept the copy, from its name (local time), or ''. */
    when: string;
    /** Whether the original is still in the space (it can only be merged into one that is). */
    originalExists: boolean;
  }

  interface Props {
    /** The chip's box, in window coordinates: the panel opens under it, right-aligned. */
    anchor: DOMRect;
    conflicts: ConflictEntry[];
    /** False in a read-only space: copies can be opened but not merged or deleted. */
    canChange: boolean;
    onCompare: (entry: ConflictEntry) => void;
    onOpen: (path: string) => void;
    onKeepSpace: (entry: ConflictEntry) => void;
    /** The desktop app: the sync menu (status, log, Sync now) is one click further. */
    onSyncMenu?: () => void;
    onClose: () => void;
  }

  let { anchor, conflicts, canChange, onCompare, onOpen, onKeepSpace, onSyncMenu, onClose }: Props = $props();

  let panel = $state<HTMLElement>();
  const name = (path: string) => path.slice(path.lastIndexOf('/') + 1);
  const folderOf = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '');

  onMount(() => panel?.focus());

  function onKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    onClose();
  }

  function onWindowPointerDown(event: PointerEvent) {
    const target = event.target as Element | null;
    // The chip toggles the panel itself.
    if (panel && !panel.contains(target) && !target?.closest?.('[data-sync-chip]')) onClose();
  }
</script>

<svelte:window onpointerdowncapture={onWindowPointerDown} onresize={onClose} onkeydowncapture={onKeydown} />

<div
  class="conflicts"
  role="dialog"
  aria-label="Sync conflicts"
  tabindex="-1"
  bind:this={panel}
  style:top="{anchor.bottom + 6}px"
  style:right="{Math.max(8, innerWidth - anchor.right)}px"
>
  <div class="head">{conflicts.length === 1 ? '1 sync conflict' : `${conflicts.length} sync conflicts`}</div>
  <p class="what">
    A file changed in the space and on a computer at the same time. Metatrash Sync kept both: the
    space's version stays in the file, and the computer's version was saved beside it as a copy
    with <code>.conflict-</code> and the time in its name. Compare the two to merge what you want
    into the file, or keep the space's version and delete the copy.
  </p>
  <ul>
    {#each conflicts as entry (entry.copy)}
      <li>
        <div class="file">
          <span class="folder">{folderOf(entry.original)}</span>{name(entry.original)}
        </div>
        <div class="meta">
          Copy: {name(entry.copy)}{entry.when ? ` · kept ${entry.when}` : ''}{entry.originalExists ? '' : ' · the file itself is no longer in the space'}
        </div>
        <div class="buttons">
          {#if canChange && entry.originalExists}
            <button class="primary" onclick={() => onCompare(entry)} title="Open {name(entry.original)} beside the copy and merge the changes you want">Compare and merge</button>
          {/if}
          <button onclick={() => onOpen(entry.copy)} title="Open the computer's version">Open copy</button>
          {#if canChange && entry.originalExists}
            <button onclick={() => onKeepSpace(entry)} title="Delete the copy, keeping {name(entry.original)} as it is in the space">Keep the space's version</button>
          {/if}
        </div>
      </li>
    {/each}
  </ul>
  {#if onSyncMenu}
    <button class="sync-menu" onclick={onSyncMenu}>Sync status and recent activity…</button>
  {/if}
</div>

<style>
  .conflicts {
    position: fixed; z-index: 4000; width: 440px; max-width: calc(100vw - 16px); max-height: calc(100vh - 80px); overflow-y: auto;
    box-sizing: border-box; padding: 10px; outline: none;
    background: var(--side-input); color: var(--side-fg);
    border: 1px solid var(--side-border); border-radius: 8px; box-shadow: 0 10px 30px rgb(0 0 0 / .2);
    font: 13px/1.4 Inter, "Segoe UI", system-ui, sans-serif; user-select: text;
  }
  .head { padding: 2px 4px 6px; font-weight: 600; }
  .what { margin: 0 4px 8px; color: var(--side-muted); font-size: 12px; }
  .what code { font-size: 11px; }
  ul { list-style: none; margin: 0; padding: 0; }
  li { padding: 8px 4px; border-top: 1px solid var(--side-border); }
  .file { font-weight: 600; overflow-wrap: anywhere; }
  .folder { color: var(--side-muted); font-weight: 400; }
  .meta { color: var(--side-muted); font-size: 12px; overflow-wrap: anywhere; }
  .buttons { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
  button {
    padding: 4px 10px; border: 1px solid var(--side-border); border-radius: 5px;
    font: inherit; font-size: 12px; color: inherit; background: none; cursor: pointer;
  }
  button:hover { background: var(--side-accent-soft); }
  button.primary { border-color: var(--side-accent); color: var(--side-accent); }
  .sync-menu { display: block; width: 100%; margin-top: 6px; border: 0; border-top: 1px solid var(--side-border); border-radius: 0; padding: 8px 4px 2px; text-align: left; }
</style>
