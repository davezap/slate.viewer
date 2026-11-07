// Folder actions in a folder's .metatrash.json (Metatrash 0.54.0 to 0.57.x): an agent that runs when
// files arrive in the folder, or on a schedule, and records each job in the folder's runner.md. The
// rules mirror Metatrash's own checks (actions.go checkActions and checkActionsWriter, schedules.go
// parseEvery, runner_tools.go checkActionTools, agent_config.go actionModel), so the Automation page
// can say what Metatrash would refuse before Metatrash Sync sends the file.

/** JSON with object keys sorted (as folderSettings' stableJson; kept here so the two files don't import each other). */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export const MAX_ACTIONS = 20;
export const MAX_PATTERNS = 20;
export const MAX_DO = 4000;
export const DEFAULT_STEPS = 40;
export const MAX_STEPS = 200;
export const RUNNER_LOG = 'runner.md';

const NAME = /^[a-z0-9][a-z0-9-]{0,39}$/;
const USERNAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MODEL = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/;

/** The providers Metatrash knows, with the model it suggests for each (agent_config.go agentProviders). */
export const PROVIDERS: { value: string; name: string; model: string }[] = [
  { value: 'minimax', name: 'MiniMax', model: 'MiniMax-M3' },
  { value: 'anthropic', name: 'Claude', model: 'claude-sonnet-5-5' },
];

/** The tools an action's agent can have (runner_tools.go runnerToolNames), in the page's words. */
export const TOOLS: { name: string; title: string }[] = [
  { name: 'read', title: 'Read files' },
  { name: 'search', title: 'Search files' },
  { name: 'list', title: 'List files' },
  { name: 'history', title: 'See file history' },
  { name: 'write', title: 'Write files' },
  { name: 'edit', title: 'Edit part of a file' },
  { name: 'append', title: 'Add to a file' },
  { name: 'move', title: 'Move or rename files' },
  { name: 'delete', title: 'Delete files' },
  { name: 'web_search', title: 'Search the web' },
  { name: 'web_fetch', title: 'Read web pages' },
];
const TOOL_NAMES = TOOLS.map(t => t.name);

/** One action as the Automation page edits it. Empty text means "left out". */
export interface ActionForm {
  /** The action as the file had it, or null for a new one: an unchanged action is written back as it was. */
  raw: Record<string, unknown> | null;
  name: string;
  trigger: 'files' | 'schedule';
  /** File patterns relative to the folder (inbound/*.md), or subfolders ending in / . */
  on: string[];
  /** "" (arrive, the default, left out), "arrive" as written, or "change". */
  when: '' | 'arrive' | 'change';
  every: string;
  /** The instructions, or the name of a .md file in the folder that holds them. */
  doMode: 'text' | 'file';
  doText: string;
  doFile: string;
  /** provider/model, or "" for the owner's (or member's) default agent. */
  model: string;
  /** "" (the owner, left out), "owner" as written, or "contributor". */
  pays: '' | 'owner' | 'contributor';
  /** The member whose own action this is, or "". */
  member: string;
  /** Most tool calls per job, or null for the default (40). */
  steps: number | null;
  /** null: left out (the web tools are allowed); true or false as written. */
  web: boolean | null;
  /** The tools the agent may use, or null for all of them. */
  tools: string[] | null;
  agentsMd: boolean;
}

export const newAction = (member: string, taken: string[]): ActionForm => {
  let name = 'new-action';
  for (let i = 2; taken.includes(name); i++) name = `new-action-${i}`;
  return {
    raw: null, name, trigger: 'files', on: ['inbound/*.md'], when: '', every: 'day 06:00',
    doMode: 'text', doText: '', doFile: '', model: '', pays: '', member,
    steps: null, web: null, tools: null, agentsMd: false,
  };
};

/** Whether `do` names a file: one .md path with no spaces (actions.go doFile). */
export const isDoFile = (text: string) => {
  const t = text.trim();
  return /\.md$/i.test(t) && !/\s/.test(t) && !t.startsWith('/') && !t.split('/').some(s => s === '' || s === '.' || s === '..');
};

const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** The form for one action object from the file. */
export function toActionForm(raw: Record<string, unknown>): ActionForm {
  const on = typeof raw.on === 'string' ? raw.on.split(',').map(p => p.trim())
    : Array.isArray(raw.on) ? raw.on.map(String) : [];
  const every = str(raw.every);
  const doValue = str(raw.do);
  const file = isDoFile(doValue);
  return {
    raw,
    name: str(raw.name),
    trigger: every && !on.length ? 'schedule' : 'files',
    on,
    when: raw.when === 'arrive' || raw.when === 'change' ? raw.when : '',
    every,
    doMode: file ? 'file' : 'text',
    doText: file ? '' : doValue,
    doFile: file ? doValue.trim() : '',
    model: str(raw.model),
    pays: raw.pays === 'owner' || raw.pays === 'contributor' ? raw.pays : '',
    member: str(raw.member),
    steps: typeof raw.steps === 'number' ? raw.steps : null,
    web: typeof raw.web === 'boolean' ? raw.web : null,
    tools: Array.isArray(raw.tools) ? raw.tools.map(String) : null,
    agentsMd: raw.agentsMd === true,
  };
}

/** The object the form writes for one action, keys in a fixed, readable order. */
export function actionObject(a: ActionForm): Record<string, unknown> {
  const out: Record<string, unknown> = { name: a.name.trim() };
  if (a.trigger === 'files') {
    const on = a.on.map(p => p.trim()).filter(Boolean);
    out.on = on.length === 1 ? on[0] : on;
    if (a.when) out.when = a.when;
  } else {
    out.every = a.every.trim();
  }
  out.do = a.doMode === 'file' ? a.doFile.trim() : a.doText;
  if (a.model.trim()) out.model = a.model.trim();
  if (a.pays) out.pays = a.pays;
  if (a.member) out.member = a.member;
  if (a.web !== null) out.web = a.web;
  if (a.steps !== null) out.steps = a.steps;
  if (a.tools !== null) out.tools = a.tools;
  if (a.agentsMd) out.agentsMd = true;
  return out;
}

/** An action's meaning, so `on` as one string equals the list it stands for and key order doesn't count. */
function meaning(value: Record<string, unknown>): string {
  const v = { ...value };
  if (typeof v.on === 'string') v.on = v.on.split(',').map(p => p.trim());
  return stableJson(v);
}

/** The actions list to write: actions whose meaning didn't change keep the form they were written in. */
export function actionsValue(forms: ActionForm[]): Record<string, unknown>[] {
  return forms.map(a => {
    const value = actionObject(a);
    return a.raw && meaning(a.raw) === meaning(value) ? a.raw : value;
  });
}

/** Whether two actions (as written) are the same action, as Metatrash's sameAction compares them. */
export function sameAction(a: Record<string, unknown> | undefined, b: Record<string, unknown> | undefined): boolean {
  return !!a && !!b && meaning(a) === meaning(b);
}

// ---- Schedules ("every", schedules.go) ---------------------------------------------------------

export type ScheduleKind = 'hour' | 'day' | 'weekday' | 'week' | 'month';
export interface Schedule { kind: ScheduleKind; hour: number; minute: number; weekday: string; monthDay: number }

export const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Reads an "every" schedule as Metatrash does, or null when Metatrash would refuse it. */
export function parseSchedule(text: string): Schedule | null {
  const fields = text.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!fields.length || text.length > 40) return null;
  const clock = (s: string): [number, number] | null => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(s);
    if (!m) return null;
    const h = Number(m[1]), min = Number(m[2]);
    return h <= 23 && min <= 59 ? [h, min] : null;
  };
  const base: Schedule = { kind: 'day', hour: 0, minute: 0, weekday: 'monday', monthDay: 1 };
  if (fields[0] === 'hour' && fields.length === 1) return { ...base, kind: 'hour' };
  if (fields[0] === 'hour' && fields.length === 2 && fields[1].startsWith(':')) {
    const c = clock('0' + fields[1]);
    return c ? { ...base, kind: 'hour', minute: c[1] } : null;
  }
  if ((fields[0] === 'day' || fields[0] === 'weekday') && fields.length === 2) {
    const c = clock(fields[1]);
    return c ? { ...base, kind: fields[0], hour: c[0], minute: c[1] } : null;
  }
  if (fields[0] === 'month' && fields.length === 3) {
    const day = /^\d+$/.test(fields[1]) ? Number(fields[1]) : NaN;
    const c = clock(fields[2]);
    return c && day >= 1 && day <= 28 ? { ...base, kind: 'month', monthDay: day, hour: c[0], minute: c[1] } : null;
  }
  if (WEEKDAYS.includes(fields[0]) && fields.length === 2) {
    const c = clock(fields[1]);
    return c ? { ...base, kind: 'week', weekday: fields[0], hour: c[0], minute: c[1] } : null;
  }
  return null;
}

const two = (n: number) => String(n).padStart(2, '0');

/** The "every" text for a schedule. */
export function scheduleText(s: Schedule): string {
  const at = `${two(s.hour)}:${two(s.minute)}`;
  switch (s.kind) {
    case 'hour': return s.minute ? `hour :${two(s.minute)}` : 'hour';
    case 'day': return `day ${at}`;
    case 'weekday': return `weekday ${at}`;
    case 'week': return `${s.weekday} ${at}`;
    case 'month': return `month ${s.monthDay} ${at}`;
  }
}

/** A schedule in words: "Every weekday at 08:00". */
export function describeSchedule(text: string): string {
  const s = parseSchedule(text);
  if (!s) return `On the schedule "${text}"`;
  const at = `${two(s.hour)}:${two(s.minute)}`;
  switch (s.kind) {
    case 'hour': return s.minute ? `Every hour at ${two(s.minute)} past` : 'Every hour, on the hour';
    case 'day': return `Every day at ${at}`;
    case 'weekday': return `Every weekday (Monday to Friday) at ${at}`;
    case 'week': return `Every ${cap(s.weekday)} at ${at}`;
    case 'month': return `On day ${s.monthDay} of every month at ${at}`;
  }
}

/** One line saying when an action runs. */
export function describeTrigger(a: ActionForm): string {
  if (a.trigger === 'schedule') return describeSchedule(a.every);
  const on = a.on.map(p => p.trim()).filter(Boolean);
  if (!on.length) return 'When files arrive (no files chosen yet)';
  const list = on.length > 3 ? `${on.slice(0, 3).join(', ')} and ${on.length - 3} more` : on.join(', ');
  return `When ${a.when === 'change' ? 'files arrive or change' : 'files arrive'}: ${list}`;
}

// ---- Matching files ---------------------------------------------------------------------------

/** A path.Match segment as a regular expression, or null when it isn't a valid pattern. */
function segmentRegex(segment: string): RegExp | null {
  let out = '';
  for (let i = 0; i < segment.length; i++) {
    const c = segment[i];
    if (c === '*') out += '[^/]*';
    else if (c === '?') out += '[^/]';
    else if (c === '\\') {
      if (++i >= segment.length) return null;
      out += segment[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    } else if (c === '[') {
      const end = segment.indexOf(']', i + 2);
      if (end < 0) return null;
      out += `[${segment.slice(i + 1, end).replace(/^(\^?)\]/, '$1\\]')}]`;
      i = end;
    } else out += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  try { return new RegExp(`^${out}$`); } catch { return null; }
}

/** Why Metatrash would refuse an `on` pattern, or "" (actions.go checkActionPattern). */
export function patternProblem(pattern: string): string {
  const name = pattern.replace(/\/$/, '');
  const bad = `"${pattern}" should be a file name or pattern in this folder, such as *.md or inbound/*.pdf, or a subfolder ending in /, such as inbound/.`;
  if (!name || pattern.length > 240 || name.includes('\\') || name.startsWith('/') || name.split('/').length > 8) return bad;
  for (const segment of name.split('/')) {
    if (!segment || segment === '.' || segment === '..' || segment.includes('**') || !segmentRegex(segment)) return bad;
  }
  return '';
}

/** Files of the space (relative, with /) under `folder` that set off an action with these patterns. */
export function matchingFiles(patterns: string[], folder: string, files: string[]): string[] {
  const compiled = patterns.map(p => p.trim()).filter(p => p && !patternProblem(p)).map(p => {
    const prefix = p.endsWith('/');
    return { prefix, segments: p.replace(/\/$/, '').split('/').map(segmentRegex) };
  });
  return files.filter(f => {
    if (!f.startsWith(folder)) return false;
    const rel = f.slice(folder.length);
    const base = rel.slice(rel.lastIndexOf('/') + 1).toLowerCase();
    if (rel === RUNNER_LOG || base === 'agents.md' || base === '.metatrash.json') return false;
    const have = rel.split('/');
    return compiled.some(({ prefix, segments }) => {
      if (prefix ? have.length <= segments.length : have.length !== segments.length) return false;
      return segments.every((re, i) => !!re && re.test(have[i]));
    });
  });
}

// ---- Checks -----------------------------------------------------------------------------------

/** Who is changing the actions: the space's owner, or a member (by username). */
export interface ActionWriter {
  /** The signed-in account's username, or "" when it isn't known (an older server). */
  account: string;
  /** The space owner's username (owner/slug), or "" for a space without one. */
  owner: string;
}

export const isOwner = (w: ActionWriter) => !w.account || !w.owner || w.account === w.owner;

/** Every reason Metatrash would refuse these actions (checkActions), in the page's words. */
export function actionProblems(forms: ActionForm[], ownedSpace: boolean): string[] {
  const problems: string[] = [];
  if (forms.length && !ownedSpace) problems.push('Actions run only in your own spaces (on metatrash.com, a space under your name), not in the public space.');
  if (forms.length > MAX_ACTIONS) problems.push(`A folder can have ${MAX_ACTIONS} actions at most; this one has ${forms.length}.`);
  const names = new Set<string>();
  for (const a of forms) {
    const name = a.name.trim();
    const label = name ? `"${name}"` : 'An action';
    const say = (text: string) => problems.push(`${label}: ${text}`);
    if (!NAME.test(name)) say('the name should be a short slug of lowercase letters, digits and hyphens, such as tidy-draft (40 characters at most).');
    else if (names.has(name)) say('another action in this folder has that name; names must be different.');
    names.add(name);

    if (a.trigger === 'files') {
      const on = a.on.map(p => p.trim()).filter(Boolean);
      if (!on.length) say('choose which files set it off, such as inbound/*.md.');
      if (on.length > MAX_PATTERNS) say(`${MAX_PATTERNS} file patterns at most.`);
      for (const p of on) { const why = patternProblem(p); if (why) say(why); }
    } else {
      if (!parseSchedule(a.every)) say('the schedule isn\'t one Metatrash understands: every hour, every day, weekdays, one day a week or one day of the month (1 to 28), at a time.');
      if (a.pays === 'contributor') say('a scheduled run has no file and so nobody who brought one to pay; the owner pays for scheduled actions.');
    }

    const doValue = a.doMode === 'file' ? a.doFile.trim() : a.doText;
    if (!doValue.trim()) say(a.doMode === 'file' ? 'choose the .md file that holds the instructions.' : 'say what the agent should do.');
    else if ([...doValue].length > MAX_DO) say(`the instructions are ${[...doValue].length} characters; ${MAX_DO} is the most. Put longer instructions in a .md file in this folder and choose it instead.`);
    else if (a.doMode === 'file' && !isDoFile(doValue)) say('the instructions file should be a .md file in this folder, with no spaces in its name.');

    const model = a.model.trim();
    if (model) {
      const [provider, rest] = [model.slice(0, model.indexOf('/')), model.slice(model.indexOf('/') + 1)];
      if (!model.includes('/') || !PROVIDERS.some(p => p.value === provider) || !MODEL.test(rest)) {
        say(`the model should be a provider and model, such as ${PROVIDERS.map(p => `${p.value}/${p.model}`).join(' or ')}; leave it empty to use the default agent.`);
      }
    }
    if (a.pays === 'contributor' && !model) say('when whoever brings a file pays, choose a model, so the same model runs whoever brings it.');
    if (a.tools !== null && !a.tools.length) say('choose at least one tool, or allow all of them.');
    if (a.tools?.some(t => !TOOL_NAMES.includes(t))) say(`the tools are ${TOOL_NAMES.join(', ')}.`);
    if (a.steps !== null && (!Number.isInteger(a.steps) || a.steps < 1 || a.steps > MAX_STEPS)) say(`the most tool calls per job is a whole number from 1 to ${MAX_STEPS} (${DEFAULT_STEPS} if left empty).`);
    if (a.member) {
      if (a.member.length < 3 || a.member.length > 32 || !USERNAME.test(a.member)) say(`"${a.member}" isn't a username.`);
      if (a.pays) say('a member\'s own action always runs on that member\'s agent, so who pays can\'t be chosen.');
    }
  }
  return problems;
}

/**
 * Why Metatrash would refuse this person's change to the actions (checkActionsWriter): the owner may
 * change their own actions, remove a member's, or adopt one by taking out its member, but never add
 * or change one in a member's name; a member may add, change or remove only their own.
 */
export function writerProblems(before: Record<string, unknown>[], after: Record<string, unknown>[], writer: ActionWriter): string[] {
  if (!writer.account) return [];
  const byName = (list: Record<string, unknown>[]) => new Map(list.map(a => [str(a.name), a]));
  const was = byName(before), now = byName(after);
  const problems: string[] = [];
  if (isOwner(writer)) {
    for (const [name, a] of now) {
      const member = str(a.member);
      if (member && !sameAction(a, was.get(name))) problems.push(`"${name}" is ${member}'s own action and runs on their agent: you can remove it, or adopt it, but not add or change it in their name.`);
    }
    return problems;
  }
  for (const name of new Set([...was.keys(), ...now.keys()])) {
    const a = now.get(name), b = was.get(name);
    if (a && b && sameAction(a, b)) continue;
    if ((b && str(b.member) !== writer.account) || (a && str(a.member) !== writer.account)) {
      problems.push(`"${name}" isn't your action. As a member you can add, change or remove only your own actions, which run on your agent and only for files you bring.`);
    }
  }
  return problems;
}
