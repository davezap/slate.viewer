<script lang="ts">
  import type { RecentKind } from './recent';

  interface Props {
    kind: RecentKind;
  }

  let { kind }: Props = $props();

  const titles: Record<RecentKind, string> = { file: 'File', folder: 'Local folder', space: 'Metatrash space' };
</script>

<!-- A document, a folder, or a cloud for a space mtsync keeps in sync. -->
<svg class="kind {kind}" viewBox="0 0 24 24" role="img" aria-label={titles[kind]}>
  {#if kind === 'file'}
    <path d="M7 3h7l4 4v14H7zM14 3v4h4" />
  {:else if kind === 'folder'}
    <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4l2 2h9A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z" />
  {:else}
    <path d="M7.5 19a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18.4 9.6 4.75 4.75 0 0 1 17.25 19z" />
  {/if}
</svg>

<style>
  .kind {
    flex: none; width: 15px; height: 15px; vertical-align: -3px;
    fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round;
  }
  .kind.space { color: var(--side-accent); }
</style>
