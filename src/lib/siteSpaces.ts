// metatrash.com: the spaces the space picker lists. The site's session answer
// (/api/v1/site/session) names every space the person can open; this browser
// also remembers the spaces it opened lately, so the picker can show them first
// and list other people's web-readable spaces the person visited.

export interface PickerSpace {
  /** owner/slug, or the name of a public space such as "public". */
  space: string;
  name: string;
  owner: string;
  access: 'read_only' | 'read_write';
  owned?: boolean;
  web?: boolean;
}

export interface PickerSession {
  signedIn: boolean;
  account?: string;
  spaces: PickerSpace[];
  /** Invitations and ownership offers waiting for the person. */
  waiting?: number;
  csrf?: string;
}

export async function pickerSession(): Promise<PickerSession> {
  const res = await fetch('/api/v1/site/session', { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`The site answered ${res.status}.`);
  return (await res.json()) as PickerSession;
}

export interface VisitedSpace {
  space: string; name: string; at: number;
  /** Readable on the web when it was opened: only those are listed for people who aren't members. */
  web?: boolean;
}

const KEY = 'metatrash.spaces.visited';
const MAX = 20;
const SPACE = /^(public|[A-Za-z0-9-]+|[A-Za-z0-9-]+\/[A-Za-z0-9-]+)$/;

export function visitedSpaces(): VisitedSpace[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (!Array.isArray(raw)) return [];
    return raw.filter((v): v is VisitedSpace => !!v && typeof v.space === 'string' && SPACE.test(v.space) && typeof v.name === 'string' && typeof v.at === 'number');
  } catch {
    return [];
  }
}

function save(list: VisitedSpace[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))); } catch { /* private window: nothing remembered */ }
}

/** Notes that this browser opened a space, newest first. A name already known is kept. */
export function rememberSpace(space: string, name: string | undefined, web: boolean) {
  if (!SPACE.test(space)) return;
  const list = visitedSpaces();
  const old = list.find(v => v.space === space);
  save([{ space, name: name || old?.name || space, at: Date.now(), web }, ...list.filter(v => v.space !== space)]);
}

export function forgetSpace(space: string) {
  save(visitedSpaces().filter(v => v.space !== space));
}

/** The space of a site path such as /spaces/owner/slug/notes/a.md, or null. */
export function spaceOfPath(path: string | null | undefined): string | null {
  if (!path?.startsWith('/spaces/')) return null;
  const parts = path.slice('/spaces/'.length).split('/');
  if (parts[0] === 'public') return 'public';
  return parts[0] && parts[1] ? `${parts[0]}/${parts[1]}` : null;
}

/** The app's address for a space: its first note opens. */
export function spaceAddress(space: string): string {
  return `/app/${space.split('/').map(encodeURIComponent).join('/')}/`;
}

export interface PickerGroups {
  recent: PickerSpace[];
  public: PickerSpace[];
  yours: PickerSpace[];
  shared: PickerSpace[];
  /** Web-readable spaces opened in this browser that the person isn't a member of. */
  visited: PickerSpace[];
}

const matches = (s: PickerSpace, filter: string) =>
  !filter || s.name.toLowerCase().includes(filter) || s.space.toLowerCase().includes(filter);

/**
 * Groups the session's spaces for the picker. While filtering there is no Recent group, so
 * each space shows once.
 */
export function groupSpaces(session: PickerSession, visited: VisitedSpace[], filter: string, current: string | null): PickerGroups {
  const f = filter.trim().toLowerCase();
  const known = new Map(session.spaces.map(s => [s.space, s]));
  const publicNames = new Set(session.spaces.filter(s => !s.owner).map(s => s.space));
  const others: PickerSpace[] = visited
    .filter(v => v.web === true && !known.has(v.space) && !publicNames.has(v.space) && v.space.includes('/'))
    .map(v => ({ space: v.space, name: v.name, owner: v.space.split('/')[0], access: 'read_only', web: true }));
  const recent = f ? [] : visited
    .filter(v => v.space !== current && known.has(v.space))
    .slice(0, 5)
    .map(v => known.get(v.space)!);
  return {
    recent,
    public: session.spaces.filter(s => !s.owner && matches(s, f)),
    yours: session.spaces.filter(s => s.owner && s.owned && matches(s, f)),
    shared: session.spaces.filter(s => s.owner && !s.owned && matches(s, f)),
    visited: others.filter(s => matches(s, f)),
  };
}
