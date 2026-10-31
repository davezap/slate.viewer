// metatrash.com: what the Settings dialog reads and changes, through the site
// API's account routes (/api/v1/site/account, Metatrash 0.79.0). Writes carry
// the session's CSRF token; the steps that need a recent sign-in answer 403
// step_up_needed, and the dialog asks the person to confirm it's them.

import { pickerSession } from './siteSpaces';

const API = '/api/v1/site/account';

export interface AccountSpace { id: string; name: string; slug: string; space?: string; ready: boolean; web?: boolean; timezone?: string }
export interface JoinedSpace { space: string; name: string; owner: string; status: string; open?: boolean }
export interface Invitation { id: string; spaceId?: string; name?: string; owner?: string; email?: string; status?: string; expires: string }
export interface Offer { spaceId: string; name: string; slug: string; from: string; expires: string }

export interface Account {
  email: string;
  username?: string;
  maxSpaces: number;
  canCreate: boolean;
  defaultTimezone: string;
  /** Connected AI apps are on (sharing shows what members' apps may do). */
  apps?: boolean;
  fresh?: boolean;
  spaces: AccountSpace[];
  joined: JoinedSpace[];
  invitations: Invitation[];
  offers: Offer[];
  unavailable?: string[];
}

export interface Member { id: string; email: string; username?: string; status: string; agentPermission: string }

export interface Sharing {
  id: string; name: string; slug: string; space: string;
  invitations: Invitation[];
  members: Member[];
  transfer?: { toEmail: string; toUsername?: string; expires: string; expired?: boolean };
  candidates: Member[];
  fresh?: boolean;
  apps?: boolean;
}

export interface ConfirmWays {
  fresh?: boolean;
  minutes?: number;
  email?: boolean;
  address: string;
  totp?: boolean;
  /** WebAuthn request options (JSON) when the account has passkeys. */
  passkey?: string;
  sent?: boolean;
}

export interface Notice { notice?: string; space?: string; signedOut?: boolean }

export class AccountError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) { super(message); }
}

let csrf: Promise<string> | null = null;
function token(): Promise<string> {
  csrf ??= pickerSession().then(s => s.csrf ?? '').catch(error => { csrf = null; throw error; });
  return csrf;
}

async function call<T>(method: 'GET' | 'POST', path: string, body?: Record<string, unknown>): Promise<T> {
  const headers: Record<string, string> = {};
  if (method === 'POST') {
    headers['Content-Type'] = 'application/json';
    headers['X-Metatrash-CSRF'] = await token();
  }
  const res = await fetch(API + path, { method, headers, credentials: 'same-origin', body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined });
  let data: unknown = null;
  try { data = await res.json(); } catch { /* not JSON */ }
  if (!res.ok) {
    const error = (data as { error?: { message?: string; code?: string } } | null)?.error;
    throw new AccountError(error?.message ?? `The site answered ${res.status}.`, res.status, error?.code ?? '');
  }
  return data as T;
}

export const account = {
  get: () => call<Account>('GET', ''),
  sharing: (id: string) => call<Sharing>('GET', `/spaces/${encodeURIComponent(id)}/sharing`),
  confirmWays: () => call<ConfirmWays>('GET', '/confirm'),
  post: (path: string, body: Record<string, unknown> = {}) => call<Notice>('POST', path, body),
  space: (id: string, action: string, body: Record<string, unknown> = {}) => call<Notice>('POST', `/spaces/${encodeURIComponent(id)}/${action}`, body),
};

/** The app's address for a space (owner/slug), and its download. */
export const openAddress = (space: string) => `/app/${space.split('/').map(encodeURIComponent).join('/')}/`;
export const downloadAddress = (space: string) => `/spaces/${space.split('/').map(encodeURIComponent).join('/')}/?export`;

// Passkeys: base64url <-> bytes, as passkey.js on the account pages does.
function decode(text: string): ArrayBuffer {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64 + '==='.slice((b64.length + 3) % 4));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out.buffer;
}
function encode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let raw = '';
  for (let i = 0; i < bytes.length; i++) raw += String.fromCharCode(bytes[i]);
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export const passkeysSupported = () => typeof window !== 'undefined' && !!window.PublicKeyCredential && !!navigator.credentials;

/** Asks the browser for a passkey with the server's options; returns the fields /confirm/passkey takes. */
export async function passkeyAssertion(optionsJSON: string): Promise<Record<string, string>> {
  const options = JSON.parse(optionsJSON);
  options.challenge = decode(options.challenge);
  if (options.allowCredentials) options.allowCredentials = options.allowCredentials.map((c: { id: string }) => ({ ...c, id: decode(c.id) }));
  const credential = (await navigator.credentials.get({ publicKey: options })) as PublicKeyCredential | null;
  if (!credential) throw new Error('No passkey was chosen.');
  const r = credential.response as AuthenticatorAssertionResponse;
  return {
    credential: encode(credential.rawId),
    client_data: encode(r.clientDataJSON),
    authenticator_data: encode(r.authenticatorData),
    signature: encode(r.signature),
    user_handle: r.userHandle ? encode(r.userHandle) : '',
  };
}

export function passkeyProblem(error: unknown): string {
  switch ((error as { name?: string } | null)?.name) {
    case 'NotAllowedError': return 'Cancelled or timed out. Try again when you’re ready.';
    case 'SecurityError': return 'Passkeys are not available on this address.';
    default: return `Your browser could not use a passkey${error instanceof Error && error.message ? `: ${error.message}` : '.'}`;
  }
}

/** The browser's time zones, for the time zone field's suggestions. */
export function timeZones(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('timeZone') ?? [];
  } catch {
    return [];
  }
}

export function browserZone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone ?? ''; } catch { return ''; }
}
