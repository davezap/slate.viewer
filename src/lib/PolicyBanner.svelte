<script lang="ts">
  // The bar above a document in a folder that publishes versions: which version it is, whether a
  // draft is shown instead, and (when people are asked to) I Have Read This. A file that quizzes
  // cover also offers Take the Quiz (Metatrash 0.51.0); reading it and passing them are separate.
  import { describeAuthor, formatWhen } from './history';
  import type { PolicyFile, PolicyFolder, PolicyQuiz } from './policies';

  interface Props {
    folder: PolicyFolder;
    /** The file's published entry, or null when it is new since the version. */
    file: PolicyFile | null;
    /** The text shown: the published one, or the file as it is now. */
    viewing: 'published' | 'current';
    busy: boolean;
    onShowDraft: () => void;
    onShowPublished: () => void;
    onConfirm: () => void;
    /** The quizzes that cover this file, with this person's state in each. */
    quizzes?: { path: string; quiz: PolicyQuiz }[];
    /** Opens a quiz (its path in the space). */
    onTakeQuiz: (relative: string) => void;
    /** Show Changes from the file as published in `version` to the text on screen. */
    onChangesSince: (version: number, label: string) => void;
  }

  let { folder, file, viewing, busy, onShowDraft, onShowPublished, onConfirm, quizzes = [], onTakeQuiz, onChangesSince }: Props = $props();

  const where = $derived(folder.folder ? folder.folder.replace(/\/$/, '') : 'this space');
  const by = $derived(describeAuthor(folder.by));
  const published = $derived(`Published version ${folder.version} · ${formatWhen(folder.timestamp)}${by ? ` by ${by}` : ''}`);
  /** A quiz is passed, not read: its own bar (FormBanner) says where this person is with it. */
  const isQuiz = $derived(!!file?.quiz);
  const toRead = $derived(file?.tracked === true && file.outstanding && !isQuiz);
  /** The first quiz covering this file that this person hasn't passed. */
  const nextQuiz = $derived(quizzes.find(q => q.quiz.status !== 'passed') ?? null);
  const quizName = (p: string) => p.split('/').pop()?.replace(/\.md$/i, '') ?? p;
  /** The text on screen is the published one: shown from history, or the file has no draft. */
  const readingPublished = $derived(viewing === 'published' || (file !== null && !file.draft));
  /** The older version this person read, when this version changed it. */
  const readBefore = $derived(readingPublished && file?.acknowledged && !file.acknowledged.current && file.acknowledged.version < folder.version
    ? file.acknowledged.version
    : null);
  const previous = $derived(readingPublished && file && folder.version > 1 && readBefore !== folder.version - 1 ? folder.version - 1 : null);
</script>

<div class="bar" class:to-read={toRead} role="status">
  <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5l1.6 1.2 2-.1.6 1.9 1.6 1.2-.6 1.9.6 1.9-1.6 1.2-.6 1.9-2-.1L8 14.5l-1.6-1.2-2 .1-.6-1.9-1.6-1.2.6-1.9-.6-1.9 1.6-1.2.6-1.9 2 .1z" /><path d="M5.6 8.1l1.6 1.6 3.2-3.3" /></svg>
  <div class="text">
    {#if !file}
      <b>Not published yet.</b> <span>This file is new since version {folder.version} of {where}, so it is a draft until the next version.</span>
    {:else if file.draft && viewing === 'published'}
      <b>{published}</b>
      <span>This is the official text. The file has changed since; those changes are a draft until the next version.</span>
    {:else if file.draft}
      <b>Draft.</b> <span>Changed since published version {folder.version}{toRead ? '; to confirm you have read it, read the published version' : ''}.</span>
    {:else}
      <b>{published}</b>
    {/if}
    {#if toRead && readingPublished}
      <span class="ask">{file?.acknowledged ? `You read version ${file.acknowledged.version}; this version changed it. ` : ''}Please read it, then confirm.</span>
    {:else if file?.tracked && !isQuiz && file.acknowledged?.current}
      <span class="done">✓ You confirmed reading it on {formatWhen(file.acknowledged.timestamp)}.</span>
    {/if}
    {#if !toRead && nextQuiz}
      <span class="ask">{nextQuiz.quiz.status === 'waiting' ? `Your answers to ${quizName(nextQuiz.path)} are waiting for a reviewer.` : `There's a quiz on it to pass: ${quizName(nextQuiz.path)}.`}</span>
    {:else if !toRead && quizzes.length}
      <span class="done">✓ You passed {quizzes.length === 1 ? 'its quiz' : 'its quizzes'}.</span>
    {/if}
  </div>
  {#if readBefore !== null}
    <button onclick={() => onChangesSince(readBefore!, `version ${readBefore}, which you read`)} title="Show what changed since version {readBefore}, the one you read">Changes Since You Read It</button>
  {/if}
  {#if previous !== null}
    <button onclick={() => onChangesSince(previous!, `version ${previous}`)} title="Show what changed since version {previous}">Changes in v{folder.version}</button>
  {/if}
  {#if file?.draft && viewing === 'published'}
    <button onclick={onShowDraft} title="Show the file as it is now, with the changes since version {folder.version}">Show Draft</button>
  {:else if file?.draft}
    <button onclick={onShowPublished}>Show Published Version</button>
  {/if}
  {#if nextQuiz && nextQuiz.quiz.status !== 'waiting'}
    <button class:primary={!toRead} onclick={() => onTakeQuiz(nextQuiz!.path)} title="Open {quizName(nextQuiz.path)}">Take the Quiz</button>
  {/if}
  {#if toRead && readingPublished}
    <button class="primary" disabled={busy} onclick={onConfirm}>{busy ? 'Confirming…' : 'I Have Read This'}</button>
  {/if}
</div>

<style>
  .bar {
    display: flex; align-items: center; gap: 10px; padding: 7px 14px;
    font: 13px/1.4 Inter, "Segoe UI", system-ui, sans-serif;
    color: var(--side-fg); background: var(--side-bg); border-bottom: 1px solid var(--side-border);
  }
  .bar.to-read { background: var(--side-accent-soft); }
  svg { flex: none; width: 18px; height: 18px; fill: none; stroke: var(--side-accent); stroke-width: 1.2; stroke-linejoin: round; stroke-linecap: round; }
  .text { flex: 1; min-width: 0; }
  .text span { color: var(--side-muted); }
  .text .ask { color: var(--side-fg); font-weight: 600; }
  .text .done { color: var(--side-accent); }
  button {
    flex: none; padding: 4px 12px; font: inherit; color: inherit; cursor: pointer;
    background: var(--side-input); border: 1px solid var(--side-border); border-radius: 6px;
  }
  button:hover:not(:disabled) { background: var(--side-hover); }
  button.primary { color: #fff; background: var(--side-accent); border-color: var(--side-accent); }
  button.primary:hover:not(:disabled) { background: var(--side-accent); filter: brightness(1.08); }
  :global([data-theme="dark"]) .bar button.primary { color: #1d1a22; }
  button:disabled { opacity: .6; cursor: default; }
  /* On paper the asks ("Please read it, then confirm") mean nothing. */
  @media print { .text .ask { display: none; } }
</style>
