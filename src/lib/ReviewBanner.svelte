<script lang="ts">
  // The bar above a copy of a form filed in a review space (Metatrash 0.50.0), for someone who can
  // write to that space: who sent it and its review so far. A form is approved or declined, with an
  // optional note. A quiz is marked by its answer key; written answers wait here for a tick or a
  // cross. Use This as Answers makes a quiz copy the key that marks everyone's answers.
  import { formatWhen } from './history';
  import { reviewText, type FiledCopy, type Review } from './forms';

  interface Props {
    copy: FiledCopy;
    busy: boolean;
    /** Why the last review was refused, or ''. */
    problem: string;
    onReview: (review: Review) => void;
    onUseAsAnswers: () => void;
  }

  let { copy, busy, problem, onReview, onUseAsAnswers }: Props = $props();

  let note = $state('');
  let ticks = $state<Record<string, boolean>>({});
  let noteFor = '';

  // A new copy starts with an empty note and no ticks.
  $effect(() => {
    if (copy.submission === noteFor) return;
    noteFor = copy.submission;
    note = '';
    ticks = {};
  });

  const unmarked = $derived(copy.quiz && Object.keys(copy.marks).length === 0);
  /** Written answers still to tick. */
  const toTick = $derived(Object.entries(copy.marks).filter(([, m]) => m === null).map(([name]) => name));
  const allTicked = $derived(toTick.every(name => name in ticks));
  const reviewed = $derived(copy.status !== 'submitted');
  const label = (name: string) => name.replace(/_/g, ' ');

  function tick(name: string, right: boolean) {
    ticks = { ...ticks, [name]: right };
  }

  function sendMarks() {
    onReview({ marks: ticks, ...(note.trim() ? { note: note.trim() } : {}) });
  }

  function sendStatus(status: 'approved' | 'declined') {
    onReview({ status, ...(note.trim() ? { note: note.trim() } : {}) });
  }
</script>

<div class="bar" class:done={reviewed} role="status">
  <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="1.5" width="10" height="13" rx="1.5" /><path d="M5.5 8.2l1.7 1.7 3.3-3.4" /></svg>
  <div class="text">
    <div class="line">
      <b>{copy.title || copy.form}</b>
      <span>from {copy.submittedBy || 'someone'}, sent {formatWhen(copy.submittedAt)}.</span>
      {#if unmarked}
        <span class="ask">Not marked: the quiz had no answers when this was sent.</span>
      {:else}
        <span class:ask={!reviewed} class:ok={copy.status === 'approved'}>{reviewText(copy)}{copy.quiz && copy.passMark !== undefined && reviewed ? `, pass mark ${copy.passMark}%` : ''}{copy.reviewedBy ? ` · ${copy.reviewedBy}, ${formatWhen(copy.reviewedAt ?? '')}` : ''}.</span>
      {/if}
      {#if copy.note}<span class="note">“{copy.note}”</span>{/if}
    </div>
    {#if problem}<div class="error">{problem}</div>{/if}
    {#if copy.quiz && toTick.length}
      <div class="ticks">
        <span>Mark the written answers:</span>
        {#each toTick as name (name)}
          <span class="tick">
            {label(name)}
            <button class="mark" class:on={ticks[name] === true} aria-pressed={ticks[name] === true} title="Right" onclick={() => tick(name, true)}>✓</button>
            <button class="mark" class:on={ticks[name] === false} aria-pressed={ticks[name] === false} title="Not right" onclick={() => tick(name, false)}>✗</button>
          </span>
        {/each}
      </div>
    {/if}
    {#if !copy.quiz || toTick.length}
      <div class="actions">
        <input type="text" maxlength="2000" placeholder="Note for {copy.submittedBy || 'them'} (optional)" bind:value={note} disabled={busy} />
        {#if copy.quiz}
          <button class="primary" disabled={busy || !allTicked} onclick={sendMarks} title={allTicked ? 'Save the marks; the score follows from them' : 'Tick or cross every written answer first'}>{busy ? 'Saving…' : 'Reviewed'}</button>
        {:else}
          <button class="primary" disabled={busy} onclick={() => sendStatus('approved')}>{busy ? 'Saving…' : reviewed ? 'Approve Instead' : 'Approve'}</button>
          <button disabled={busy} onclick={() => sendStatus('declined')}>{reviewed ? 'Decline Instead' : 'Decline'}</button>
        {/if}
      </div>
    {/if}
  </div>
  {#if copy.quiz}
    <button class:primary={unmarked} onclick={onUseAsAnswers} title="Make these answers the key that marks everyone's answers to this text of the quiz">Use This as Answers</button>
  {/if}
</div>

<style>
  .bar {
    display: flex; align-items: flex-start; gap: 10px; padding: 7px 14px;
    font: 13px/1.4 Inter, "Segoe UI", system-ui, sans-serif;
    color: var(--side-fg); background: var(--side-accent-soft); border-bottom: 1px solid var(--side-border);
  }
  .bar.done { background: var(--side-bg); }
  svg { flex: none; width: 18px; height: 18px; margin-top: 2px; fill: none; stroke: var(--side-accent); stroke-width: 1.2; stroke-linejoin: round; stroke-linecap: round; }
  .text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
  .line span { color: var(--side-muted); }
  .line .ask { color: var(--side-fg); font-weight: 600; }
  .line .ok { color: var(--side-accent); }
  .line .note { font-style: italic; }
  .error { color: #c0392b; white-space: pre-line; }
  .ticks { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 14px; color: var(--side-muted); }
  .tick { display: inline-flex; align-items: center; gap: 4px; color: var(--side-fg); }
  .actions { display: flex; gap: 8px; align-items: center; }
  input {
    flex: 1; min-width: 0; padding: 4px 8px; font: inherit; color: inherit;
    background: var(--side-input); border: 1px solid var(--side-border); border-radius: 6px;
  }
  button {
    flex: none; padding: 4px 12px; font: inherit; color: inherit; cursor: pointer;
    background: var(--side-input); border: 1px solid var(--side-border); border-radius: 6px;
  }
  button:hover:not(:disabled) { background: var(--side-hover); }
  button.mark { padding: 1px 8px; }
  button.mark.on { color: #fff; background: var(--side-accent); border-color: var(--side-accent); }
  button.primary { color: #fff; background: var(--side-accent); border-color: var(--side-accent); }
  button.primary:hover:not(:disabled) { background: var(--side-accent); filter: brightness(1.08); }
  :global([data-theme="dark"]) .bar button.primary, :global([data-theme="dark"]) .bar button.mark.on { color: #1d1a22; }
  button:disabled { opacity: .6; cursor: default; }
</style>
