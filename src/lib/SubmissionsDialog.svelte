<script lang="ts">
  // My Submissions: the forms this person sent from the open space, newest first, and for the one
  // picked, the answers and the copy Metatrash filed (Metatrash 0.49.0), with its review (0.50.0).
  import { onMount } from 'svelte';
  import { formatWhen } from './history';
  import { copyAnswers, fetchReceipt, fetchReceipts, reviewText, type Receipt } from './forms';

  interface Props {
    /** The synced folder of the open space. */
    folder: string;
    space: string;
    /** The receipt to show first. */
    initialId?: string;
    onClose: () => void;
  }

  let { folder, space, initialId, onClose }: Props = $props();

  let receipts = $state<Receipt[] | null>(null);
  let listError = $state('');
  let selected = $state<string | null>(null);
  let detail = $state<Receipt | null>(null);
  let detailError = $state('');
  const cache = new Map<string, Receipt>();

  async function show(id: string) {
    selected = id;
    detailError = '';
    detail = cache.get(id) ?? null;
    if (detail) return;
    try {
      const one = await fetchReceipt(folder, id);
      cache.set(id, one);
      if (selected === id) detail = one;
    } catch (e) {
      if (selected === id) detailError = String(e);
    }
  }

  onMount(() => {
    void (async () => {
      try {
        receipts = await fetchReceipts(folder);
      } catch (e) {
        receipts = [];
        listError = String(e);
        return;
      }
      const first = receipts.find(r => r.id === initialId) ?? receipts[0];
      if (first) await show(first.id);
    })();
  });

  const answers = $derived(detail?.text ? copyAnswers(detail.text) : []);
  /** A quiz's ticks by field: only right or not, never the right answer. */
  const marks = $derived(detail?.quiz && detail.marks ? detail.marks : null);

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" onclick={onClose}>
  <div class="panel" role="dialog" tabindex="-1" aria-label="My Submissions" onclick={event => event.stopPropagation()}>
    <button class="x" title="Close" aria-label="Close" onclick={onClose}>
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
    </button>
    <header>
      <h2>My Submissions</h2>
      <p class="muted">The forms you sent from {space}. Each one was filed as a copy that the form's reviewers can read; you can't change it.</p>
    </header>

    <div class="body">
      {#if receipts === null}
        <p class="muted pad">Loading…</p>
      {:else if listError}
        <p class="error pad">{listError}</p>
      {:else if !receipts.length}
        <p class="muted pad">You haven't sent any forms from this space yet.</p>
      {:else}
        <nav aria-label="Submissions">
          {#each receipts as r (r.id)}
            <button class:selected={r.id === selected} onclick={() => void show(r.id)}>
              <b>{r.title || r.form}</b>
              <span>{formatWhen(r.submittedAt)}{reviewText(r) ? ` · ${reviewText(r)}` : ''}</span>
            </button>
          {/each}
        </nav>
        <section>
          {#if detailError}
            <p class="error">{detailError}</p>
          {:else if !detail}
            <p class="muted">Loading…</p>
          {:else}
            <h3>{detail.title || detail.form}</h3>
            <dl>
              <dt>Sent</dt><dd>{formatWhen(detail.submittedAt)}</dd>
              <dt>Form</dt><dd>{detail.template}</dd>
              <dt>Filed as</dt><dd>{detail.target}</dd>
              {#if reviewText(detail)}
                <dt>Review</dt><dd>{reviewText(detail)}{detail.quiz && detail.passMark !== undefined && detail.status !== 'submitted' ? `, pass mark ${detail.passMark}%` : ''}{detail.reviewedAt ? ` (${formatWhen(detail.reviewedAt)})` : ''}</dd>
              {/if}
              {#if detail.note}
                <dt>Note</dt><dd class="note">{detail.note}</dd>
              {/if}
            </dl>
            {#if answers.length}
              <table>
                <thead><tr><th>Field</th><th>Answer</th>{#if marks}<th></th>{/if}</tr></thead>
                <tbody>
                  {#each answers as [name, value] (name)}
                    <tr>
                      <td>{name}</td><td>{value || '(blank)'}</td>
                      {#if marks}<td class="mark" title={marks[name] === true ? 'Right' : marks[name] === false ? 'Not right' : marks[name] === null ? 'Waiting for a reviewer' : ''}>{marks[name] === true ? '✓' : marks[name] === false ? '✗' : marks[name] === null ? '…' : ''}</td>{/if}
                    </tr>
                  {/each}
                </tbody>
              </table>
            {/if}
            <details>
              <summary>The filed copy</summary>
              <pre>{detail.text}</pre>
            </details>
          {/if}
        </section>
      {/if}
    </div>

    <footer>
      <span class="grow"></span>
      <button onclick={onClose}>Close</button>
    </footer>
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; z-index: 2500; background: rgb(0 0 0 / .22); display: grid; place-items: center; }
  .panel {
    position: relative; display: flex; flex-direction: column; box-sizing: border-box;
    width: min(860px, calc(100vw - 48px)); height: min(620px, calc(100vh - 64px)); overflow: hidden;
    background: var(--side-input); color: var(--side-fg);
    border: 1px solid var(--side-border); border-radius: 10px; box-shadow: 0 16px 50px rgb(0 0 0 / .28);
    font: 13px/1.45 Inter, "Segoe UI", system-ui, sans-serif;
  }
  .x {
    position: absolute; top: 10px; right: 10px; z-index: 1; display: grid; place-items: center; width: 26px; height: 26px; padding: 0;
    color: var(--side-muted); background: none; border: 0; border-radius: 5px; cursor: pointer;
  }
  .x:hover { color: var(--side-fg); background: var(--side-hover); }
  header { padding: 16px 52px 6px 20px; }
  h2 { margin: 0 0 4px; font-size: 16px; }
  h3 { margin: 0 0 8px; font-size: 15px; }
  p { margin: 0 0 8px; }
  .muted { color: var(--side-muted); }
  .error { color: #c0392b; white-space: pre-line; }
  .pad { padding: 16px 20px; }
  .body { flex: 1; min-height: 0; display: flex; border-top: 1px solid var(--side-border); border-bottom: 1px solid var(--side-border); }
  nav { flex: none; width: 230px; padding: 8px 6px; overflow: auto; background: var(--side-bg); border-right: 1px solid var(--side-border); }
  nav button {
    display: flex; flex-direction: column; width: 100%; padding: 6px 8px; text-align: left;
    font: inherit; color: inherit; background: none; border: 0; border-radius: 5px; cursor: pointer;
  }
  nav button span { font-size: 12px; color: var(--side-muted); }
  nav button:hover { background: var(--side-hover); }
  nav button.selected { background: var(--side-accent-soft); }
  section { flex: 1; min-width: 0; padding: 14px 18px; overflow: auto; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 2px 12px; margin: 0 0 12px; }
  dt { color: var(--side-muted); }
  dd { margin: 0; overflow-wrap: anywhere; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  th, td { padding: 4px 8px; text-align: left; vertical-align: top; border-bottom: 1px solid var(--side-border); }
  th { font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--side-muted); }
  td:first-child { width: 30%; color: var(--side-muted); }
  td:nth-child(2) { white-space: pre-wrap; overflow-wrap: anywhere; }
  td.mark { width: 2em; text-align: center; font-weight: 700; color: var(--side-accent); }
  dd.note { white-space: pre-wrap; font-style: italic; }
  summary { cursor: pointer; color: var(--side-muted); }
  pre {
    margin: 8px 0 0; padding: 10px; white-space: pre-wrap; overflow-wrap: anywhere;
    font: 12px/1.45 "Cascadia Mono", Consolas, monospace; background: var(--side-bg); border-radius: 6px;
  }
  footer { display: flex; gap: 8px; align-items: center; padding: 10px 16px; }
  .grow { flex: 1; }
  footer button {
    padding: 6px 14px; font: inherit; color: inherit; background: var(--side-bg);
    border: 1px solid var(--side-border); border-radius: 6px; cursor: pointer;
  }
  footer button:hover { background: var(--side-hover); }
</style>
