// Published versions and read confirmations (Metatrash 0.48.0, mtsync 0.48.0). A folder whose
// .metatrash.json sets "publishedVersion" has an official version: its files as they were when the
// number was last raised. With an acknowledge service, everyone in the space is asked to read them
// and confirm; Metatrash keeps who confirmed what. Slate Viewer shows the published text by default,
// a dot on files still to read, and the count on its taskbar button.

import { invoke } from '@tauri-apps/api/core';
import type { ChangeAuthor } from './history';

export interface PolicyAck {
  version: number;
  /** UTC, RFC 3339. */
  timestamp: string;
  /** True when the confirmation was for the text published now. */
  current: boolean;
}

export interface PolicyFile {
  id: string;
  /** Where the file is now, relative to the synced folder (with /). */
  path: string;
  /** Where it was when the version was published. */
  publishedPath: string;
  /** The published text has changed since: the file on disk is a draft. */
  draft: boolean;
  /** The acknowledge service asks people to read this file. */
  tracked: boolean;
  /** This person hasn't confirmed reading the published text yet. */
  outstanding: boolean;
  acknowledged?: PolicyAck;
  /** The file on this computer (mtsync adds it). */
  file?: string;
  /** Where publishedPath is on this computer, for `mtsync show` with the folder's revision. */
  publishedFile?: string;
  /** A quiz (Metatrash 0.50.0): passed, not read. This person's state in it. */
  quiz?: PolicyQuiz;
  /** A quiz: the tracked files it covers, where they are now (Metatrash 0.51.0). */
  covers?: string[];
  /** The quizzes that cover this file; reading it is confirmed on its own. */
  quizzes?: string[];
}

export interface PolicyQuiz {
  /** new, waiting (for a reviewer to tick free-text answers), failed or passed. */
  status: 'new' | 'waiting' | 'failed' | 'passed' | string;
  /** The last score, in percent. */
  score?: number;
  /** After a fail: when it can be taken again (UTC, RFC 3339). */
  retryAt?: string;
  /** This person passed an earlier text of the quiz. */
  older?: boolean;
  /** The files it covers must be read before it can be sent (the default). */
  readFirst: boolean;
  /** With readFirst: the files it covers that this person still has to read. */
  toRead?: string[];
}

/** The quiz at `relative` and this person's state in it, or null when it isn't one. */
export function quizFor(folder: PolicyFolder, relative: string): { quiz: PolicyQuiz; file: PolicyFile } | null {
  const file = folder.files.find(f => f.path === relative && f.quiz);
  return file?.quiz ? { quiz: file.quiz, file } : null;
}

/** The quizzes (path and state) that cover the file at `relative`, in any published folder. */
export function quizzesCovering(policies: Policies | null, relative: string): { path: string; quiz: PolicyQuiz }[] {
  if (!policies) return [];
  const all = policies.folders.flatMap(f => f.files);
  const file = all.find(f => f.path === relative);
  return (file?.quizzes ?? []).flatMap(path => {
    const quiz = all.find(f => f.path === path)?.quiz;
    return quiz ? [{ path, quiz }] : [];
  });
}

export interface PolicyFolder {
  /** "" for the top of the synced folder, else "hr/policies/" style. */
  folder: string;
  version: number;
  /** The commit that published the version. */
  revision: string;
  timestamp: string;
  by?: ChangeAuthor;
  acknowledge: boolean;
  files: PolicyFile[];
}

export interface Policies {
  space: string;
  folders: PolicyFolder[];
  /** How many files this person still has to read. */
  outstanding: number;
}

export interface ReaderReport {
  space: string;
  files: { id: string; path: string; folder: string; version: number }[];
  /** Everyone in the space; each person's files line up with `files`. */
  people: { name: string; outstanding: number; files: { status: 'read' | 'older' | 'unread' | string; acknowledged?: PolicyAck; quiz?: { status: string; score?: number; retryAt?: string; older?: boolean } }[] }[];
}

/** The published folders of the space synced at `folder` (the space's local folder). */
export async function fetchPolicies(folder: string): Promise<Policies> {
  const out = JSON.parse(await invoke<string>('mtsync_policies', { folder })) as Policies;
  return { ...out, folders: out.folders ?? [] };
}

/** Confirms that this person read `file` (a full path) as published in `version`. */
export function acknowledge(file: string, version: number): Promise<void> {
  return invoke<void>('mtsync_ack', { file, version });
}

/** Who has read what in the space synced at `folder`. Needs read-write access to the space. */
export async function fetchReaders(folder: string): Promise<ReaderReport> {
  return JSON.parse(await invoke<string>('mtsync_readers', { folder })) as ReaderReport;
}

/** Puts `count` on the taskbar button (a red number), or clears it at 0. */
export function setAttentionBadge(count: number): Promise<void> {
  return invoke<void>('set_attention_badge', { count: Math.max(0, Math.min(count, 100_000)) });
}

/** The published folder a file belongs to (the nearest one holding it), and its entry if it was published. */
export function policyFor(policies: Policies | null, relative: string): { folder: PolicyFolder; file: PolicyFile | null } | null {
  if (!policies) return null;
  let best: PolicyFolder | null = null;
  for (const f of policies.folders) {
    if (relative.startsWith(f.folder) && (!best || f.folder.length > best.folder.length)) best = f;
  }
  if (!best) return null;
  return { folder: best, file: best.files.find(f => f.path === relative) ?? null };
}

/** Files (relative) this person still has to read, and quizzes still to pass. */
export function outstandingFiles(policies: Policies | null): string[] {
  return policies ? policies.folders.flatMap(f => f.files.filter(x => x.outstanding).map(x => x.path)) : [];
}
