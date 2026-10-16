<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    /** Shown after the title, in muted text (a folder name, a heading count). */
    detail?: string;
    tooltip?: string;
    actions?: Snippet;
    children: Snippet;
  }

  let { title, detail, tooltip, actions, children }: Props = $props();
</script>

<section class="section">
  <header title={tooltip}>
    <h2>{title}</h2>
    {#if detail}<span class="detail">{detail}</span>{/if}
    {#if actions}<div class="actions">{@render actions()}</div>{/if}
  </header>
  <div class="body">{@render children()}</div>
</section>

<style>
  .section { display: flex; flex-direction: column; height: 100%; min-height: 0; }
  header {
    flex: none; display: flex; align-items: center; gap: 6px; height: 30px; padding: 0 6px 0 12px;
    border-bottom: 1px solid var(--side-border);
  }
  h2 {
    margin: 0; flex: none; font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase;
    color: var(--side-fg);
  }
  .detail { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--side-muted); font-size: 12px; }
  .actions { display: flex; gap: 1px; margin-left: auto; }
  .actions :global(button) {
    width: 24px; height: 24px; padding: 0; border: 0; border-radius: 4px; cursor: pointer;
    font: inherit; font-size: 16px; line-height: 1; color: var(--side-muted); background: none;
  }
  .actions :global(button:hover) { background: var(--side-hover); color: var(--side-fg); }
  .body { flex: 1; min-height: 0; display: flex; flex-direction: column; }
</style>
