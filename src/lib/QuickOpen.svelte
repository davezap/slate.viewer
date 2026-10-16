<script lang="ts">
  import { onMount } from 'svelte';
  import { basename, dirname } from './paths';
  import { fuzzyFilter } from './fuzzy';

  interface Props {
    files: string[];
    onPick: (relative: string, newWindow: boolean) => void;
    onClose: () => void;
  }

  let { files, onPick, onClose }: Props = $props();

  let query = $state('');
  let selected = $state(0);
  let input: HTMLInputElement;
  const hits = $derived(fuzzyFilter(files, query));

  $effect(() => { void query; selected = 0; });

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); }
    else if (event.key === 'ArrowDown') { event.preventDefault(); selected = Math.min(selected + 1, hits.length - 1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); selected = Math.max(selected - 1, 0); }
    else if (event.key === 'Enter' && hits[selected]) {
      event.preventDefault();
      onPick(hits[selected].item, event.ctrlKey || event.shiftKey);
    }
  }

  onMount(() => input.focus());
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" onclick={onClose}>
  <div class="panel" role="dialog" tabindex="-1" aria-label="Go to file" onclick={event => event.stopPropagation()}>
    <input bind:this={input} bind:value={query} placeholder="Go to file…" onkeydown={onKeydown} />
    <ul>
      {#each hits as hit, i (hit.item)}
        <li>
          <button class:selected={i === selected} onmousemove={() => (selected = i)} onclick={event => onPick(hit.item, event.ctrlKey || event.shiftKey)}>
            {basename(hit.item).replace(/\.(md|markdown|mdown|mkd)$/i, '')}
            {#if dirname(hit.item) !== hit.item && hit.item.includes('/')}<span>{dirname(hit.item)}</span>{/if}
          </button>
        </li>
      {:else}
        <li class="none">No matching files</li>
      {/each}
    </ul>
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; z-index: 2000; background: rgb(0 0 0 / .18); }
  .panel {
    width: min(560px, calc(100% - 32px)); margin: 70px auto 0; overflow: hidden;
    background: var(--side-input); color: var(--side-fg);
    border: 1px solid var(--side-border); border-radius: 8px; box-shadow: 0 12px 40px rgb(0 0 0 / .25);
    font: 13px/1.35 Inter, "Segoe UI", system-ui, sans-serif;
  }
  input {
    box-sizing: border-box; width: 100%; padding: 10px 12px; font: inherit; font-size: 14px;
    color: inherit; background: transparent; border: 0; border-bottom: 1px solid var(--side-border); outline: none;
  }
  ul { list-style: none; margin: 0; padding: 4px; max-height: 50vh; overflow: auto; }
  button {
    display: flex; gap: 10px; align-items: baseline; width: 100%; padding: 6px 8px; text-align: left;
    font: inherit; color: inherit; background: none; border: 0; border-radius: 4px; cursor: pointer;
  }
  button.selected { background: var(--side-accent-soft); }
  span { color: var(--side-muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .none { padding: 8px; color: var(--side-muted); }
</style>
