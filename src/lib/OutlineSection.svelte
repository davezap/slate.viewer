<script lang="ts">
  import type { SlateOutline, SlateOutlineHeading } from '../../public/slate/slate-editor';
  import Section from './Section.svelte';

  interface Props {
    outline: SlateOutline | null;
    /** Id of the heading at the top of the view, highlighted in the list. */
    active: string | null;
    onReveal: (heading: SlateOutlineHeading) => void;
    /** Shown in its own column left of the document rather than in the sidebar's stack. */
    pinned?: boolean;
    onTogglePin?: () => void;
    /** Pinned only: folds the column away to a thin strip. */
    onCollapse?: () => void;
  }

  let { outline, active, onReveal, pinned = false, onTogglePin, onCollapse }: Props = $props();

  const count = $derived.by(() => {
    let n = 0;
    const walk = (list: SlateOutlineHeading[]) => list.forEach(h => { n += 1; walk(h.children); });
    walk(outline?.headings ?? []);
    return n;
  });

  const detail = $derived.by(() => {
    if (!count) return undefined;
    const headings = `${count} heading${count === 1 ? '' : 's'}`;
    const done = outline?.completion;
    return done?.hasCheckboxes ? `${headings} · ${done.checked}/${done.total} checked` : headings;
  });
</script>

<Section title="Document Nav" {detail}>
  {#snippet actions()}
    {#if onTogglePin}
      <button
        class:pinned
        title={pinned ? 'Unpin: back to the sidebar' : 'Pin to the left of the document'}
        aria-label={pinned ? 'Unpin Document Nav' : 'Pin Document Nav'}
        aria-pressed={pinned}
        onclick={onTogglePin}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4h6M10 4v6l-3 4h10l-3-4V4M12 14v6" /></svg>
      </button>
    {/if}
    {#if pinned && onCollapse}
      <button title="Collapse (Ctrl+Shift+O)" aria-label="Collapse Document Nav" onclick={onCollapse}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 7l-5 5 5 5" /></svg>
      </button>
    {/if}
  {/snippet}
  <nav class="scroll" aria-label="Headings">
    {#if !count}
      <p class="empty">Add Markdown headings to navigate this document.</p>
    {:else}
      {#snippet list(headings: SlateOutlineHeading[])}
        <ul>
          {#each headings as heading (heading.id)}
            <li>
              <button
                class="link"
                class:active={heading.id === active}
                title={heading.title}
                onclick={() => onReveal(heading)}
              >
                {#if heading.total > 0}
                  <span
                    class="status"
                    class:complete={heading.checked === heading.total}
                    title="{heading.checked} of {heading.total} checked"
                  ></span>
                {/if}
                <span class="title">{heading.title}</span>
              </button>
              {#if heading.children.length}{@render list(heading.children)}{/if}
            </li>
          {/each}
        </ul>
      {/snippet}
      {@render list(outline?.headings ?? [])}
    {/if}
  </nav>
</Section>

<style>
  .scroll { flex: 1; overflow: auto; padding: 4px 6px 12px; }
  ul { list-style: none; margin: 0; padding: 0; }
  ul ul { margin-left: 12px; padding-left: 6px; border-left: 1px solid var(--side-border); }
  .link {
    display: flex; align-items: flex-start; gap: 6px; width: 100%; padding: 3px 6px; margin: 1px 0;
    font: inherit; color: inherit; text-align: left; background: none; border: 0; border-radius: 4px; cursor: pointer;
  }
  .link:hover { background: var(--side-hover); }
  .link.active { background: var(--side-accent-soft); color: var(--side-accent); font-weight: 600; }
  .title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .status {
    flex: none; width: 11px; height: 11px; margin-top: 3px; box-sizing: border-box;
    border: 1.5px solid var(--side-muted); border-radius: 3px; opacity: .8;
  }
  .status.complete {
    border-color: var(--side-accent); background: var(--side-accent); opacity: 1;
    box-shadow: inset 0 0 0 1.5px var(--side-bg);
  }
  .empty { margin: 8px 8px; color: var(--side-muted); }
  svg {
    width: 16px; height: 16px; vertical-align: middle;
    fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round;
  }
  .pinned { color: var(--side-accent) !important; }
</style>
