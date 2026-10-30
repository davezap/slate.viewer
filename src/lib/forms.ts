// Forms (Metatrash 0.49.0, mtsync 0.49.0, Slate 0.18.0). A form template is a Markdown file whose
// front matter has form, title and submitTo, with {{type name=…}} fields. Slate's fill mode draws
// the inputs; Slate Viewer keeps the answers as a draft on this computer while they are filled in
// and sends them with mtsync, and Metatrash files the filled-in copy in a review folder.

import { backend } from './backend';
import type { SlateFormAnswers, SlateFormProblem } from '../../public/slate/slate-editor';

export interface Receipt {
  id: string;
  form: string;
  title: string;
  /** The template's path in the space. */
  template: string;
  revision: string;
  /** Where the copy was filed: owner/space/path. */
  target: string;
  /** UTC, RFC 3339. */
  submittedAt: string;
  /** The filed copy (after sending, and for one receipt). */
  text?: string;
  /** After sending: the published version sending it confirmed reading, in a folder that asks people to read it (Metatrash 0.49.4). */
  acknowledged?: number;
  /** Every copy is reviewed (Metatrash 0.50.0): submitted (waiting), approved or declined. */
  status?: ReviewStatus;
  /** The reviewer's note. */
  note?: string;
  reviewedAt?: string;
  /** A quiz: passed is approved, not passed is declined, with the score in percent once marked. */
  quiz?: boolean;
  passMark?: number;
  score?: number;
  /** Right (true), wrong (false) or still to tick (null), by field; never the right answers. */
  marks?: Record<string, boolean | null>;
  /** The answers sent (one receipt only). */
  answers?: SlateFormAnswers;
}

export type ReviewStatus = 'submitted' | 'approved' | 'declined';

/** What the review of a receipt says, in a few words. */
export function reviewText(r: Pick<Receipt, 'status' | 'quiz' | 'score'>): string {
  if (r.quiz) {
    if (r.status === 'approved') return r.score !== undefined ? `Passed (${r.score}%)` : 'Passed';
    if (r.status === 'declined') return r.score !== undefined ? `Not passed (${r.score}%)` : 'Not passed';
    return 'Waiting for a reviewer';
  }
  if (r.status === 'approved') return 'Approved';
  if (r.status === 'declined') return 'Declined';
  return r.status ? 'Waiting for review' : '';
}

export interface SubmitRefusal {
  code: string;
  message: string;
  fields?: SlateFormProblem[];
}

export type SubmitResult = { ok: true; receipt: Receipt } | { ok: false; error: SubmitRefusal };

/**
 * Sends `answers` to the form `file` (a full path in a synced folder). With `version`, they are
 * answers to the form as published in that version of its folder (Metatrash 0.50.0).
 */
export async function submitForm(file: string, answers: SlateFormAnswers, version?: number): Promise<SubmitResult> {
  return backend.sync.submit(file, answers, version ?? null);
}

/** A review of a filed copy: a form's status, or a quiz's marks for the answers still to tick. */
export interface Review {
  status?: 'approved' | 'declined';
  marks?: Record<string, boolean>;
  note?: string;
}

/** Records a review of the filed copy `file` (a full path in the synced review space). */
export async function reviewCopy(file: string, review: Review): Promise<SubmitResult> {
  return backend.sync.review(file, review);
}

/** The forms this person sent from the space synced at `folder`, newest first. */
export async function fetchReceipts(folder: string): Promise<Receipt[]> {
  return backend.sync.submissions(folder);
}

/** One receipt with the filed copy. */
export async function fetchReceipt(folder: string, id: string): Promise<Receipt> {
  return backend.sync.submission(folder, id);
}

/** The answers in a filed copy's front matter, in order: [name, answer]. */
export function copyAnswers(text: string): [string, string][] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  if (lines[0] !== '---') return [];
  const out: [string, string][] = [];
  let inAnswers = false;
  for (const line of lines.slice(1)) {
    if (line === '---') break;
    if (!line.startsWith(' ')) { inAnswers = line.trimEnd() === 'answers:'; continue; }
    if (!inAnswers) continue;
    const match = line.match(/^ {2}([A-Za-z][A-Za-z0-9_]*): (.*)$/);
    if (!match) continue;
    let value: unknown = match[2];
    try { value = JSON.parse(match[2]); } catch { /* as written */ }
    out.push([match[1], Array.isArray(value) ? value.join(', ') : String(value ?? '')]);
  }
  return out;
}

// ---- Filed copies (Metatrash 0.50.0): what a reviewer opens --------------------------

export interface FiledCopy {
  form: string;
  title: string;
  /** owner/space/path of the form it came from. */
  template: string;
  submission: string;
  submittedBy: string;
  submittedAt: string;
  status: ReviewStatus;
  quiz: boolean;
  passMark?: number;
  score?: number;
  marks: Record<string, boolean | null>;
  reviewedBy?: string;
  reviewedAt?: string;
  note?: string;
}

/** The open document as a copy filed from Metatrash 0.50.0 on (front matter names its submission), or null. */
export function parseFiledCopy(text: string): FiledCopy | null {
  const lines = text.replace(/^\ufeff/, '').replace(/\r\n?/g, '\n').split('\n');
  if (lines[0] !== '---') return null;
  const keys: Record<string, string> = {};
  const marks: Record<string, boolean | null> = {};
  let block = '';
  for (const line of lines.slice(1)) {
    if (line === '---' || line === '...') break;
    if (!line.startsWith(' ')) {
      const match = line.match(/^([A-Za-z][A-Za-z0-9_]*):\s*(.*)$/);
      block = match && !match[2] ? match[1] : '';
      if (match && match[2]) keys[match[1]] = unquote(match[2].trim());
      continue;
    }
    if (block !== 'marks') continue;
    const match = line.match(/^ +([A-Za-z][A-Za-z0-9_]*): (true|false|null)\s*$/);
    if (match) marks[match[1]] = match[2] === 'null' ? null : match[2] === 'true';
  }
  if (!keys.form || !keys.submittedAt || !/^[0-9a-f]{32}$/.test(keys.submission ?? '')) return null;
  const number = (v?: string) => (v && /^\d+$/.test(v) ? Number(v) : undefined);
  const status = keys.status === 'approved' || keys.status === 'declined' ? keys.status : 'submitted';
  return {
    form: keys.form,
    title: keys.title ?? '',
    template: keys.template ?? '',
    submission: keys.submission,
    submittedBy: keys.submittedBy ?? '',
    submittedAt: keys.submittedAt,
    status,
    quiz: keys.quiz === 'true',
    passMark: number(keys.passMark),
    score: number(keys.score),
    marks,
    reviewedBy: keys.reviewedBy,
    reviewedAt: keys.reviewedAt,
    note: keys.note,
  };
}

/** A front-matter value: JSON-quoted strings come back as their text. */
function unquote(value: string): string {
  if (value.startsWith('"')) {
    try { return String(JSON.parse(value)); } catch { /* as written */ }
  }
  return value;
}

/** The answer key a quiz copy makes: `<space slug>-<form>-answers.md`, next to the copy. */
export function answerKeyName(copy: FiledCopy): string {
  const slug = copy.template.split('/')[1] ?? '';
  return `${slug}-${copy.form}-answers.md`;
}

/**
 * A quiz copy as its answer key: the same front matter and answers without the submission and
 * its review, so it marks everyone's answers to the same text of the quiz.
 */
export function answerKeyText(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [lines[0]];
  let i = 1;
  let skipping = false;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line === '---' || line === '...') break;
    if (!line.startsWith(' ')) skipping = /^(submission|status|score|marks|reviewedBy|reviewedAt|note):/.test(line);
    if (!skipping) out.push(line);
  }
  return [...out, ...lines.slice(i)].join('\n');
}

// ---- Drafts: answers kept on this computer until the form is sent ----------------------

const DRAFT_PREFIX = 'slate-viewer.form-draft:';
const MAX_DRAFTS = 50;

export interface FormDraft {
  answers: SlateFormAnswers;
  /** When it was last changed, ms since 1970. */
  savedAt: number;
}

function draftKey(file: string): string {
  return DRAFT_PREFIX + file.replace(/\\/g, '/').toLowerCase();
}

export function loadDraft(file: string): FormDraft | null {
  try {
    const value = JSON.parse(localStorage.getItem(draftKey(file)) ?? 'null') as FormDraft | null;
    return value && typeof value.answers === 'object' && value.answers ? value : null;
  } catch {
    return null;
  }
}

/** Keeps the answers for `file`; answers with nothing in them remove the draft. */
export function saveDraft(file: string, answers: SlateFormAnswers): void {
  const empty = Object.values(answers).every(v => (Array.isArray(v) ? v.length === 0 : !String(v).trim()));
  if (empty) { clearDraft(file); return; }
  try {
    localStorage.setItem(draftKey(file), JSON.stringify({ answers, savedAt: Date.now() }));
    pruneDrafts();
  } catch { /* storage full or blocked: the answers stay on screen */ }
}

export function clearDraft(file: string): void {
  try { localStorage.removeItem(draftKey(file)); } catch { /* blocked */ }
}

/** Forgets the oldest drafts beyond MAX_DRAFTS. */
function pruneDrafts(): void {
  const drafts: [string, number][] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(DRAFT_PREFIX)) continue;
    try { drafts.push([key, (JSON.parse(localStorage.getItem(key) ?? '{}') as FormDraft).savedAt || 0]); } catch { drafts.push([key, 0]); }
  }
  drafts.sort((a, b) => b[1] - a[1]).slice(MAX_DRAFTS).forEach(([key]) => localStorage.removeItem(key));
}
