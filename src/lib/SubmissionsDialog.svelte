<script lang="ts">
  // My Submissions: the forms this person sent, newest first, and for the one picked, the answers
  // and the copy Metatrash filed (Metatrash 0.49.0), with its review (0.50.0). On the website it
  // covers every space they can open (Metatrash 0.95.22, Viewer 0.36.0), lists the forms started
  // here and not sent yet, and can start a new copy from an old one's answers while the form is
  // unchanged. The desktop app (and an older server) shows the open space's forms.
  import { onMount } from 'svelte';
  import { formatWhen } from './history';
  import {
    clearDraft, copyAnswers, fetchAccountReceipt, fetchAccountReceipts, fetchReceipt, fetchReceipts, listDrafts, reviewText,
    type AccountReceipt,
  } from './forms';

  interface Props {
    /** The synced folder of the open space, if one is open. */
    folder: string | null;
    space: string | null;
    /** Where this app's drafts live: /spaces/ on the website, the open space's folder on the desktop. */
    draftRoot: string | null;
    /** The receipt to show first. */
    initialId?: string;
    /** The form to open for a receipt (its file now), or null when it can't be opened from here. */
    formFileOf: (receipt: AccountReceipt) => string | null;
    onOpenForm: (file: string) => void;
    /** Starts a new copy of the receipt's form with its answers (the receipt has them). */
    onUseAnswers: (receipt: AccountReceipt) => void;
    onClose: () => void;
  }

  let { folder, space, draftRoot, initialId, formFileOf, onOpenForm, onUseAnswers, onClose }: Props = $props();

  let receipts = $state<AccountReceipt[] | null>(null);
  /** Across all spaces (the website with Metatrash 0.95.22), or only the open one. */
  let everywhere = $state(false);
  let listError = $state('');
  let drafts = $state<{ file: string; savedAt: number; answered: number }[]>([]);
  let selected = $state<string | null>(null);
  let selectedDraft = $state<string | null>(null);
  let detail = $state<AccountReceipt | null>(null);
  let detailError = $state('');
  const cache = new Map<string, AccountReceipt>();

  async function show(id: string) {
    selected = id;
    selectedDraft = null;
    detailError = '';
    detail = cache.get(id) ?? null;
    if (detail) return;
    try {
      const listed = receipts?.find(r => r.id === id);
      let one: AccountReceipt | null = everywhere ? await fetchAccountReceipt(id) : folder ? await fetchReceipt(folder, id) : null;
      if (!one) throw new Error('This submission could not be found.');
      // The single answer leaves out what only the list says.
      one = { ...one, space: one.space ?? listed?.space, current: one.current ?? listed?.current, sameForm: one.sameForm ?? listed?.sameForm };
      cache.set(id, one);
      if (selected === id) detail = one;
    } catch (e) {
      if (selected === id) detailError = String(e);
    }
  }

  function showDraft(file: string) {
    selected = null;
    detail = null;
    detailError = '';
    selectedDraft = file;
  }

  function readDrafts() {
    drafts = draftRoot ? listDrafts(draftRoot) : [];
  }

  onMount(() => {
    readDrafts();
    void (async () => {
      try {
        const all = await fetchAccountReceipts();
        everywhere = all !== null;
        receipts = all ?? (folder ? await fetchReceipts(folder) : []);
      } catch (e) {
        receipts = [];
        listError = String(e);
        return;
      }
      const first = receipts.find(r => r.id === initialId) ?? (initialId || !drafts.length ? receipts[0] : undefined);
      if (first) await show(first.id);
      else if (drafts.length) showDraft(drafts[0].file);
    })();
  });

  const answers = $derived(detail?.text ? copyAnswers(detail.text) : []);
  /** A quiz's ticks by field: only right or not, never the right answer. */
  const marks = $derived(detail?.quiz && detail.marks ? detail.marks : null);
  const draft = $derived(drafts.find(d => d.file === selectedDraft) ?? null);
  const formFile = $derived(detail ? formFileOf(detail) : null);

  /** Why Use These Answers can't be used for this receipt, or '' when it can. */
  const reuseProblem = $derived.by(() => {
    if (!detail || !everywhere) return 'unknown';
    if (detail.quiz) return 'quiz';
    if (!detail.current || !formFile) return "The form isn't there any more, or you can't open its space, so these answers can't start a new copy.";
    if (!detail.sameForm) return 'The form has changed since you sent this, so its answers would not fit it. Open the form to fill it in again.';
    return '';
  });

  /** A draft's form, for the list: its name, and its space on the website. */
  function draftName(file: string): { name: string; where: string } {
    const parts = file.replace(/\\/g, '/').split('/');
    const name = (parts.pop() ?? file).replace(/\.md$/i, '');
    const where = file.startsWith('/spaces/') ? parts.slice(2, 4).join('/') : '';
    return { name, where };
  }

  function discardDraft(file: string) {
    clearDraft(file);
    readDrafts();
    selectedDraft = null;
    if (receipts?.[0]) void show(receipts[0].id);
  }

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
      {#if receipts !== null && !everywhere && space}
        <p class="muted">The forms you sent from {space}. Each one was filed as a copy that the form's reviewers can read; you can't change it.</p>
      {:else}
        <p class="muted">The forms you sent from all your spaces. Each one was filed as a copy that the form's reviewers can read; you can't change it.</p>
      {/if}
    </header>

    <div class="body">
      {#if receipts === null}
        <p class="muted pad">Loading…</p>
      {:else if listError}
        <p class="error pad">{listError}</p>
      {:else if !receipts.length && !drafts.length}
        <p class="muted pad">You haven't sent any forms {everywhere || !space ? '' : 'from this space '}yet.</p>
      {:else}
        <nav aria-label="Submissions">
          {#if drafts.length}
            <h4>Not sent yet</h4>
            {#each drafts as d (d.file)}
              {@const n = draftName(d.file)}
              <button class:selected={d.file === selectedDraft} onclick={() => showDraft(d.file)}>
                <b><span class="pencil" aria-hidden="true">✎</span>{n.name}</b>
                <span>{n.where ? `${n.where} · ` : ''}{formatWhen(new Date(d.savedAt).toISOString())}</span>
              </button>
            {/each}
            {#if receipts.length}<h4>Sent</h4>{/if}
          {/if}
          {#each receipts as r (r.id)}
            <button class:selected={r.id === selected} onclick={() => void show(r.id)}>
              <b>{#if r.status === 'approved'}<span class="tick" title={r.quiz ? 'Passed' : 'Approved'} aria-label={r.quiz ? 'Passed' : 'Approved'}>✓</span>{:else if r.status === 'needs-info'}<span class="dot" title="Sent back: the reviewer needs more from you" aria-label="Sent back">●</span>{/if}{r.title || r.form}</b>
              {#if everywhere && r.space}<span class="space">{r.space}</span>{/if}
              <span class:asked={r.status === 'needs-info'}>{formatWhen(r.submittedAt)}{reviewText(r) ? ` · ${reviewText(r)}` : ''}</span>
            </button>
          {/each}
        </nav>
        <section>
          {#if draft}
            {@const n = draftName(draft.file)}
            <h3>{n.name}</h3>
            <dl>
              {#if n.where}<dt>Space</dt><dd>{n.where}</dd>{/if}
              <dt>Saved</dt><dd>{formatWhen(new Date(draft.savedAt).toISOString())}</dd>
              <dt>Answered</dt><dd>{draft.answered === 1 ? '1 question' : `${draft.answered} questions`}</dd>
            </dl>
            <p class="muted">You started this form and haven't sent it. Your answers are kept in this {draftRoot?.startsWith('/spaces/') ? 'browser' : 'app'} only.</p>
            <div class="actions">
              <button class="primary" onclick={() => onOpenForm(draft.file)}>Continue Filling In</button>
              <button onclick={() => discardDraft(draft.file)}>Discard Draft</button>
            </div>
          {:else if detailError}
            <p class="error">{detailError}</p>
          {:else if !detail}
            <p class="muted">{selected ? 'Loading…' : ''}</p>
          {:else}
            <h3>{detail.title || detail.form}</h3>
            <dl>
              <dt>Sent</dt><dd>{formatWhen(detail.submittedAt)}</dd>
              {#if everywhere && detail.space}<dt>Space</dt><dd>{detail.space}</dd>{/if}
              <dt>Form</dt><dd>{detail.current ?? detail.template}</dd>
              <dt>Filed as</dt><dd>{detail.target}</dd>
              {#if reviewText(detail)}
                <dt>Review</dt><dd class:approved={detail.status === 'approved'}>{detail.status === 'approved' ? '✓ ' : ''}{reviewText(detail)}{detail.quiz && detail.passMark !== undefined && detail.status !== 'submitted' ? `, pass mark ${detail.passMark}%` : ''}{detail.reviewedAt ? ` (${formatWhen(detail.reviewedAt)})` : ''}</dd>
              {/if}
              {#if detail.note && detail.status !== 'needs-info'}
                <dt>Note</dt><dd class="note">{detail.note}</dd>
              {/if}
            </dl>
            {#if detail.status === 'needs-info'}
              <div class="sent-back" role="note">
                <div class="label">The reviewer needs more from you</div>
                {#if detail.note}<p class="what">{detail.note}</p>{/if}
                <p>Open {(detail.current ?? detail.template).split('/').pop()} and choose <b>Fix My Answers</b>, change what they asked for and send it again; the new copy replaces this one.</p>
                {#if formFile}<div class="actions"><button class="primary" onclick={() => formFile && onOpenForm(formFile)}>Open the Form</button></div>{/if}
              </div>
            {:else if reuseProblem === ''}
              <div class="actions">
                <button class="primary" title="Opens the form with these answers filled in, to check and send as a new copy" onclick={() => detail && onUseAnswers(detail)}>Use These Answers</button>
                {#if formFile}<button onclick={() => formFile && onOpenForm(formFile)}>Open the Form</button>{/if}
              </div>
              <p class="muted small">Use These Answers starts a new copy of the form with these answers, for you to change and send. Photos aren't copied.</p>
            {:else if reuseProblem !== 'unknown' && reuseProblem !== 'quiz'}
              <p class="muted small">{reuseProblem}</p>
              {#if formFile}<div class="actions"><button onclick={() => formFile && onOpenForm(formFile)}>Open the Form</button></div>{/if}
            {/if}
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
  dd.approved { color: #1e8e3e; font-weight: 600; }
  nav .tick { margin-right: 5px; color: #1e8e3e; font-weight: 700; }
  nav .dot { margin-right: 5px; color: #d93025; font-size: 10px; vertical-align: 1px; }
  nav button span.asked { color: #d93025; font-weight: 600; }
  :global([data-theme="dark"]) dd.approved, :global([data-theme="dark"]) nav .tick { color: #5bb974; }
  .sent-back { margin: 10px 0 14px; padding: 10px 12px; border: 1px solid #f0b400; border-left: 4px solid #e37400; border-radius: 6px; background: #fff8e1; color: #3c2f00; }
  .sent-back .label { font-weight: 700; color: #b05a00; }
  .sent-back .what { margin: 6px 0; font-size: 15px; font-weight: 600; white-space: pre-wrap; }
  .sent-back p { margin: 4px 0 0; }
  :global([data-theme="dark"]) .sent-back { background: #3a2c10; color: #f6e7c1; border-color: #8a6a1c; border-left-color: #f29900; }
  :global([data-theme="dark"]) .sent-back .label { color: #f6b26b; }
  summary { cursor: pointer; color: var(--side-muted); }
  pre {
    margin: 8px 0 0; padding: 10px; white-space: pre-wrap; overflow-wrap: anywhere;
    font: 12px/1.45 "Cascadia Mono", Consolas, monospace; background: var(--side-bg); border-radius: 6px;
  }
  nav h4 { margin: 8px 8px 2px; font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--side-muted); }
  nav h4:first-child { margin-top: 2px; }
  nav button span.space { color: var(--side-fg); opacity: .75; }
  nav .pencil { margin-right: 5px; color: var(--side-accent); }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 4px 0 8px; }
  .actions button {
    padding: 6px 14px; font: inherit; color: inherit; background: var(--side-bg);
    border: 1px solid var(--side-border); border-radius: 6px; cursor: pointer;
  }
  .actions button:hover { background: var(--side-hover); }
  .actions button.primary { color: var(--side-input); background: var(--side-accent); border-color: var(--side-accent); font-weight: 600; }
  .actions button.primary:hover { filter: brightness(1.08); }
  .small { font-size: 12px; }
  .sent-back .actions { margin: 8px 0 0; }
  footer { display: flex; gap: 8px; align-items: center; padding: 10px 16px; }
  .grow { flex: 1; }
  footer button {
    padding: 6px 14px; font: inherit; color: inherit; background: var(--side-bg);
    border: 1px solid var(--side-border); border-radius: 6px; cursor: pointer;
  }
  footer button:hover { background: var(--side-hover); }
</style>
