<script lang="ts">
  // The bar above a form template (Metatrash 0.49.0): in Preview the form below is ready to fill
  // in (Slate Viewer 0.16.0); in Edit and Source, Fill In goes to Preview. Also My Submissions,
  // Discard Draft and what happened to the last answers sent. A quiz (Metatrash 0.50.0) also
  // says where this person is with it, and after a fail offers Fix My Answers and Start Again.
  import { formatWhen } from './history';
  import type { FormDraft, Receipt } from './forms';
  import type { PolicyFile, PolicyQuiz } from './policies';
  import type { SlateForm } from '../../public/slate/slate-editor';

  interface Props {
    form: SlateForm;
    /** Why it can't be sent from here (not in a space), or null. */
    unavailable: string | null;
    /** Edit or Source: the template shows, not the form to fill in. */
    editing: boolean;
    draft: FormDraft | null;
    /** What was sent from this window just now, for this form. */
    sent: Receipt | null;
    onFill: () => void;
    onDiscardDraft: () => void;
    onSubmissions: (id?: string) => void;
    /** The form is a quiz: this person's state in it and the file it covers. */
    quiz?: { quiz: PolicyQuiz; covered: PolicyFile } | null;
    /** A failed quiz is open to fill in again. */
    canRetry?: boolean;
    onFixAnswers?: () => void;
    onStartAgain?: () => void;
  }

  let { form, unavailable, editing, draft, sent, onFill, onDiscardDraft, onSubmissions, quiz = null, canRetry = false, onFixAnswers, onStartAgain }: Props = $props();

  /** Where the copies go, without the person's own folder: owner/space. */
  const reviewSpace = $derived(form.submitTo.split('/').slice(0, 2).join('/'));
  const filedIn = $derived(sent ? sent.target.split('/').slice(0, 2).join('/') : '');
  const covered = $derived(quiz ? quiz.covered.path.split('/').pop() : '');
  const state = $derived(quiz?.quiz.status ?? '');
  const passMark = $derived(sent?.passMark ?? 100);
</script>

<div class="bar" class:sent={sent !== null || state === 'passed'} role="status">
  <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="1.5" width="10" height="13" rx="1.5" /><path d="M5.5 5h5M5.5 8h5M5.5 11h3" /></svg>
  <div class="text">
    <b>{form.title || form.form}</b>
    {#if form.error}
      <span class="error">This form has a mistake, so it can't be filled in yet: {form.error}</span>
    {:else if unavailable}
      <span>{unavailable}</span>
    {:else if editing}
      <span>You're changing the form itself. Fill In (or Preview) shows it ready to fill in.</span>
    {:else if sent?.quiz && sent.status === 'approved'}
      <span class="done">✓ Passed{sent.score !== undefined ? ` with ${sent.score}%` : ''}. That confirms you read {covered || 'what it covers'}.</span>
    {:else if sent?.quiz && sent.status === 'declined'}
      <span class="ask">Not passed: {sent.score ?? 0}%, and the pass mark is {passMark}%.</span>
      <span>Read {covered || 'what it covers'} again{quiz?.quiz.retryAt ? `, then try again from ${formatWhen(quiz.quiz.retryAt)}` : ', then try again'}.</span>
    {:else if sent?.quiz && !sent.marks}
      <span>Sent, unmarked: this quiz has no answers yet. If yours are right, open the copy in {filedIn} and choose Use This as Answers.</span>
    {:else if sent?.quiz}
      <span class="done">✓ Sent on {formatWhen(sent.submittedAt)}. A reviewer will mark your written answers.</span>
    {:else if sent}
      <span class="done">✓ Sent on {formatWhen(sent.submittedAt)}. A copy was filed in {filedIn}, where it waits for review.{#if sent.acknowledged} It also counts as reading version {sent.acknowledged}.{/if}</span>
    {:else if state === 'passed'}
      <span class="done">✓ You passed this quiz{quiz?.quiz.score !== undefined ? ` with ${quiz.quiz.score}%` : ''}.</span>
    {:else if state === 'waiting'}
      <span>Your answers are waiting for a reviewer to mark them.</span>
    {:else if state === 'failed'}
      <span class="ask">Not passed{quiz?.quiz.score !== undefined ? ` (${quiz.quiz.score}%)` : ''}.</span>
      <span>{canRetry ? 'Fix My Answers shows which were not right; Start Again clears them.' : quiz?.quiz.retryAt ? `You can try again from ${formatWhen(quiz.quiz.retryAt)}.` : ''}</span>
    {:else if quiz}
      <span>{quiz.quiz.older ? 'The quiz changed since you passed it. ' : ''}Answer the questions and choose Send. Passing confirms you read {covered}.</span>
    {:else if draft}
      <span>Your answers are saved on this computer as you type. They aren't sent until you choose Send.</span>
    {:else}
      <span>Fill in the form below and choose Send. Your answers are filed in {reviewSpace}.</span>
    {/if}
  </div>
  {#if !unavailable}
    <button onclick={() => onSubmissions(sent?.id)} title="The forms you sent from this space">My Submissions</button>
  {/if}
  {#if !form.error && !unavailable}
    {#if canRetry && !editing}
      <button onclick={() => onFixAnswers?.()} title="Your last answers, with the ones that were not right marked">Fix My Answers</button>
      <button onclick={() => onStartAgain?.()} title="Clear the answers">Start Again</button>
    {:else if draft}
      <button onclick={onDiscardDraft} title="Forget the answers saved on this computer">Discard Draft</button>
    {/if}
    {#if editing}
      <button class="primary" onclick={onFill}>Fill In</button>
    {/if}
  {/if}
</div>

<style>
  .bar {
    display: flex; align-items: center; gap: 10px; padding: 7px 14px;
    font: 13px/1.4 Inter, "Segoe UI", system-ui, sans-serif;
    color: var(--side-fg); background: var(--side-bg); border-bottom: 1px solid var(--side-border);
  }
  .bar.sent { background: var(--side-accent-soft); }
  svg { flex: none; width: 18px; height: 18px; fill: none; stroke: var(--side-accent); stroke-width: 1.2; stroke-linejoin: round; stroke-linecap: round; }
  .text { flex: 1; min-width: 0; }
  .text span { color: var(--side-muted); }
  .text .done { color: var(--side-accent); }
  .text .ask { color: var(--side-fg); font-weight: 600; }
  .text .error { color: #c0392b; }
  button {
    flex: none; padding: 4px 12px; font: inherit; color: inherit; cursor: pointer;
    background: var(--side-input); border: 1px solid var(--side-border); border-radius: 6px;
  }
  button:hover { background: var(--side-hover); }
  button.primary { color: #fff; background: var(--side-accent); border-color: var(--side-accent); }
  button.primary:hover { background: var(--side-accent); filter: brightness(1.08); }
  :global([data-theme="dark"]) .bar button.primary { color: #1d1a22; }
</style>
