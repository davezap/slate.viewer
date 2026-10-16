<script lang="ts">
  import type { SectionId, SectionState } from './prefs';

  interface Props {
    sections: SectionState;
    /** Show names next to the icons. */
    expanded: boolean;
    onToggle: (id: SectionId) => void;
    onToggleExpanded: () => void;
  }

  let { sections, expanded, onToggle, onToggleExpanded }: Props = $props();

  const items: { id: SectionId; label: string; keys: string; icon: string }[] = [
    {
      id: 'files',
      label: 'Files',
      keys: 'Ctrl+Shift+E',
      icon: 'M3.5 7.5a2 2 0 0 1 2-2h3.6l2 2h7.4a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z',
    },
    {
      id: 'search',
      label: 'Search',
      keys: 'Ctrl+Shift+F',
      icon: 'M10.5 4.5a6 6 0 1 1 0 12a6 6 0 0 1 0-12zM15 15l5 5',
    },
    {
      id: 'outline',
      label: 'Document Nav',
      keys: 'Ctrl+Shift+O',
      icon: 'M4 6h2M9 6h11M6.5 12h2M11.5 12h8.5M6.5 18h2M11.5 18h8.5',
    },
  ];
</script>

<nav class="activity" class:expanded aria-label="Sidebar sections">
  {#each items as item (item.id)}
    <button
      class="item"
      class:on={sections[item.id]}
      aria-pressed={sections[item.id]}
      title="{sections[item.id] ? 'Hide' : 'Show'} {item.label} ({item.keys})"
      onclick={() => onToggle(item.id)}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d={item.icon} /></svg>
      {#if expanded}<span>{item.label}</span>{/if}
    </button>
  {/each}

  <button
    class="item grow"
    title={expanded ? 'Hide names' : 'Show names'}
    aria-label={expanded ? 'Hide names' : 'Show names'}
    onclick={onToggleExpanded}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={expanded ? 'M14 7l-5 5 5 5M19 7l-5 5 5 5' : 'M10 7l5 5-5 5M5 7l5 5-5 5'} />
    </svg>
    {#if expanded}<span>Collapse</span>{/if}
  </button>
</nav>

<style>
  .activity {
    display: flex; flex-direction: column; flex: none; width: 44px; height: 100%; padding-top: 4px; box-sizing: border-box;
    background: var(--side-bar); border-right: 1px solid var(--side-border);
    font: 13px/1.2 Inter, "Segoe UI", system-ui, sans-serif;
  }
  .activity.expanded { width: 150px; }
  .item {
    position: relative; display: flex; align-items: center; gap: 10px; height: 40px; padding: 0 11px;
    font: inherit; color: var(--side-muted); background: none; border: 0; cursor: pointer; text-align: left; white-space: nowrap;
  }
  .item:hover { color: var(--side-fg); background: var(--side-hover); }
  .item.on { color: var(--side-accent); }
  .item.on::before {
    content: ''; position: absolute; left: 0; top: 7px; bottom: 7px; width: 3px; border-radius: 0 2px 2px 0;
    background: var(--side-accent);
  }
  .item.on span { color: var(--side-fg); font-weight: 600; }
  .grow { margin-top: auto; margin-bottom: 6px; }
  svg {
    flex: none; width: 22px; height: 22px;
    fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round;
  }
  span { overflow: hidden; text-overflow: ellipsis; }
</style>
