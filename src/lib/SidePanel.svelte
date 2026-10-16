<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { SectionId } from './prefs';

  interface Props {
    /** The switched-on sections, top to bottom. */
    open: SectionId[];
    weights: Record<SectionId, number>;
    section: Snippet<[SectionId]>;
    onWeightsChange: (weights: Record<SectionId, number>) => void;
  }

  let { open, weights, section, onWeightsChange }: Props = $props();

  const MIN_HEIGHT = 60;
  let panes: HTMLElement[] = $state([]);

  /** Dragging a divider moves height between the two sections either side of it. */
  function startResize(event: PointerEvent, index: number) {
    const handle = event.currentTarget as HTMLElement;
    const above = panes[index];
    const below = panes[index + 1];
    if (!above || !below) return;
    handle.setPointerCapture(event.pointerId);
    const a = open[index];
    const b = open[index + 1];
    const startY = event.clientY;
    const startAbove = above.getBoundingClientRect().height;
    const startBelow = below.getBoundingClientRect().height;
    const total = startAbove + startBelow;
    const pairWeight = weights[a] + weights[b];
    let next = weights;

    const move = (e: PointerEvent) => {
      const height = Math.min(total - MIN_HEIGHT, Math.max(MIN_HEIGHT, startAbove + e.clientY - startY));
      next = { ...weights, [a]: (pairWeight * height) / total, [b]: (pairWeight * (total - height)) / total };
      onWeightsChange(next);
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      onWeightsChange(next);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up, { once: true });
  }
</script>

<div class="panel">
  {#each open as id, i (id)}
    {#if i > 0}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="divider" onpointerdown={event => startResize(event, i - 1)}></div>
    {/if}
    <div class="pane" bind:this={panes[i]} style:flex-grow={weights[id]}>
      {@render section(id)}
    </div>
  {/each}
</div>

<style>
  .panel {
    display: flex; flex-direction: column; height: 100%; min-width: 0;
    background: var(--side-bg); color: var(--side-fg);
    font: 13px/1.35 Inter, "Segoe UI", system-ui, sans-serif;
  }
  .pane { flex: 1 1 0; min-height: 0; overflow: hidden; }
  .divider { flex: none; height: 5px; margin: -2px 0; position: relative; z-index: 1; cursor: row-resize; }
  .divider::after { content: ''; position: absolute; left: 0; right: 0; top: 2px; border-top: 1px solid var(--side-border); }
  .divider:hover { background: var(--side-accent-soft); }
</style>
