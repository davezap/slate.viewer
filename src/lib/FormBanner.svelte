<script lang="ts">
  // The bar above a form template (Metatrash 0.49.0): in Preview the form below is ready to fill
  // in (Slate Viewer 0.16.0); in Edit and Source, Fill In goes to Preview. Also My Submissions,
  // Discard Draft and what happened to the last answers sent.
  import { formatWhen } from './history';
  import type { FormDraft, Receipt } from './forms';
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
  }

  let { form, unavailable, editing, draft, sent, onFill, onDiscardDraft, onSubmissions }: Props = $props();

  /** Where the copies go, without the person's own folder: owner/space. */
  const reviewSpace = $derived(form.submitTo.split('/').slice(0, 2).join('/'));
</script>

<div class="bar" class:sent={sent !== null} role="status">
  <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="1.5" width="10" height="13" rx="1.5" /><path d="M5.5 5h5M5.5 8h5M5.5 11h3" /></svg>
  <div class="text">
    <b>{form.title || form.form}</b>
    {#if form.error}
      <span class="error">This form has a mistake, so it can't be filled in yet: {form.error}</span>
    {:else if unavailable}
      <span>{unavailable}</span>
    {:else if editing}
      <span>You're changing the form itself. Fill In (or Preview) shows it ready to fill in.</span>
    {:else if sent}
      <span class="done">✓ Sent on {formatWhen(sent.submittedAt)}. A copy was filed in {sent.target.split('/').slice(0, 2).join('/')}.</span>
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
    {#if draft}
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
