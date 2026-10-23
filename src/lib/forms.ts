// Forms (Metatrash 0.49.0, mtsync 0.49.0, Slate 0.18.0). A form template is a Markdown file whose
// front matter has form, title and submitTo, with {{type name=…}} fields. Slate's fill mode draws
// the inputs; Slate Viewer keeps the answers as a draft on this computer while they are filled in
// and sends them with mtsync, and Metatrash files the filled-in copy in a review folder.

import { invoke } from '@tauri-apps/api/core';
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
}

export interface SubmitRefusal {
  code: string;
  message: string;
  fields?: SlateFormProblem[];
}

export type SubmitResult = { ok: true; receipt: Receipt } | { ok: false; error: SubmitRefusal };

/** Sends `answers` to the form `file` (a full path in a synced folder). */
export async function submitForm(file: string, answers: SlateFormAnswers): Promise<SubmitResult> {
  const out = await invoke<{ ok: boolean; json: string; message: string }>('mtsync_submit', { file, answers: JSON.stringify(answers) });
  let parsed: unknown = null;
  try { parsed = out.json ? JSON.parse(out.json) : null; } catch { /* not JSON */ }
  if (out.ok && parsed) return { ok: true, receipt: parsed as Receipt };
  const error = (parsed as { error?: SubmitRefusal } | null)?.error;
  return { ok: false, error: error ?? { code: '', message: out.message || 'The form could not be sent.' } };
}

/** The forms this person sent from the space synced at `folder`, newest first. */
export async function fetchReceipts(folder: string): Promise<Receipt[]> {
  const out = JSON.parse(await invoke<string>('mtsync_submissions', { folder })) as { submissions?: Receipt[] };
  return out.submissions ?? [];
}

/** One receipt with the filed copy. */
export async function fetchReceipt(folder: string, id: string): Promise<Receipt> {
  return JSON.parse(await invoke<string>('mtsync_submissions', { folder, id })) as Receipt;
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
