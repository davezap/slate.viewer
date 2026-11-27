<script lang="ts">
  import { onMount } from 'svelte';
  import { backend, capabilities } from './backend';
  import { joinPath } from './paths';
  import { mtsync, type FolderDescription } from './space';
  import {
    DEFAULT_STEPS, MAX_DO, PROVIDERS, RUNNER_LOG, SUBMIT_TOOL, TOOLS, WEEKDAYS, actionObject, allTools, sameAction, sendsForms, setSendsForms, describeSchedule, describeTrigger, isOwner, matchingFiles, newAction,
    parseSchedule, scheduleText, type ActionForm, type ActionWriter, type Schedule, type ScheduleKind,
  } from './folderActions';
  import { account as siteAccount, rerunAction, type Agent, type Rerun } from './siteAccount';
  import {
    SETTINGS_FILE, LOCK_KEYS, LOCK_KEY_LABELS, MAX_FOOTER, check, defaultSettingsText, effectiveLocks, effectiveSettings, folderChain,
    MAX_EMAILS, footerFrom, frozenKeys, isLockLevel, lockedBy, newEmail, parentFolder, parseObject, stableJson, toObject, toSavedVersion, toSettings, toText,
    type EmailService, type FolderSettings, type LockKey, type LockLevel, type Problem, type PushMode, type SpaceContext,
  } from './folderSettings';
  import { fetchReaders, type ReaderReport } from './policies';
  import { formatWhen } from './history';
  import { footerMarks } from './footer';

  interface Props {
    /** The space's local folder. */
    root: string;
    /** The folder whose settings these are: "" for the top of the space, else "notes/" style. */
    folder: string;
    space: { space: string; server: string; access: string };
    descriptions: FolderDescription[];
    onClose: () => void;
    /** The settings file was written; Metatrash Sync uploads it. */
    onSaved: () => void;
    /** Opens a file of the space (relative) in the editor. */
    onOpenFile: (relative: string) => void;
    /** The page to open on, by its guide's name (general, security, … settings-file); General if unknown. */
    initialPage?: string;
  }

  let { root, folder, space, descriptions, onClose, onSaved, onOpenFile, initialPage = 'general' }: Props = $props();

  type Page = 'general' | 'security' | 'connections' | 'publishing' | 'automation' | 'file';

  const PAGES: { id: Page; title: string; about: string; help: string }[] = [
    { id: 'general', title: 'General', about: 'What the folder is for', help: 'general.md' },
    { id: 'security', title: 'Security', about: 'Read-only files and locks', help: 'security.md' },
    { id: 'connections', title: 'Connections', about: 'GitHub repository', help: 'connections.md' },
    { id: 'publishing', title: 'Publishing', about: 'Versions, readers, printouts and the page footer', help: 'publishing.md' },
    { id: 'automation', title: 'Automation', about: 'Receiving email, and agents that work here by themselves', help: 'automation.md' },
    { id: 'file', title: 'Settings File', about: SETTINGS_FILE, help: 'settings-file.md' },
  ];

  /** The Folder properties guides in the Metatrash docs: one page per page here. */
  const HELP_ROOT = 'https://collumii.com/docs/guides/folder-properties/';

  const LEVELS: { level: LockLevel; title: string; about: string }[] = [
    { level: '', title: 'Unlocked', about: 'Anyone with write access can, agents included.' },
    { level: 'folderAgents', title: 'Locked for folder actions', about: 'The agents of folder actions (Automation) can\'t. People and connected agents can.' },
    { level: 'connectedAgents', title: 'Locked for connected agents', about: 'Agents connected over MCP, such as Claude, other apps and space keys, can\'t. People and folder actions can.' },
    { level: 'agents', title: 'Locked for agents', about: 'No agent can. You and members can, here or through Metatrash Sync.' },
    { level: 'everyone', title: 'Locked for everyone', about: 'Nobody can, people included, until a person lifts the lock.' },
  ];
  const FILE_LEVELS = LEVELS.filter(l => l.level !== '');

  const PUSH_MODES: { mode: PushMode; title: string; about: string }[] = [
    { mode: 'agent', title: 'When an agent pushes', about: 'Changes go to GitHub only when an agent uses its push tool, with a commit message. The default.' },
    { mode: 'auto', title: 'Automatically', about: 'Accepted now, and works like "When an agent pushes" until automatic pushing exists.' },
    { mode: 'review', title: 'After review', about: 'Accepted now, but pushing is refused until a review screen exists.' },
  ];

  const isRoot = $derived(folder === '');
  const readOnlySpace = $derived(space.access === 'read only');
  const folderLabel = (f: string) => (f ? f : 'the top of the space');
  const title = $derived(isRoot ? space.space : folder.replace(/\/$/, ''));

  let page = $state<Page>(PAGES.find(p => p.help === `${initialPage}.md`)?.id ?? 'general');
  const currentPage = $derived(PAGES.find(p => p.id === page)!);
  const openHelp = () => void backend.opener.url(HELP_ROOT + currentPage.help);
  let loading = $state(true);
  let loadError = $state('');
  let saveError = $state('');
  let saving = $state(false);
  let confirmDiscard = $state(false);

  /** Settings texts of this folder and those above it, as on disk (null: no file yet). */
  let texts = $state(new Map<string, string | null>());
  let original = $state<Record<string, unknown>>({});
  let form = $state<FolderSettings | null>(null);
  /** Files in this folder and below (relative to the space), the first FILES_SHOWN of them. */
  let files = $state<string[]>([]);
  const FILES_SHOWN = 100;
  /** The folder holds more than FILES_SHOWN files, so counts of matches are a lower bound. */
  let filesCut = $state(false);
  const among = $derived(filesCut ? ` (among its first ${FILES_SHOWN} files)` : '');
  let agentsFile = $state<string | null>(null);
  let agentsExcerpt = $state('');
  /** Who is signed in, for whose actions they may change ('' account: not known, so nothing is held back). */
  let writer = $state<ActionWriter>({ account: '', owner: '' });
  /** The signed-in person's agents (the website only), for choosing an action's model. */
  let myAgents = $state<Agent[]>([]);

  const ownPath = $derived(folder + SETTINGS_FILE);
  const readText = (relative: string) =>
    backend.files.read(joinPath(root, relative)).then(doc => doc.text, () => null);

  onMount(() => {
    void (async () => {
      try {
        const chain = folderChain(folder);
        const read = await Promise.all(chain.map(f => readText(f + SETTINGS_FILE)));
        texts = new Map(chain.map((f, i) => [f, read[i]]));
        const parsed = parseObject(read[0] ?? defaultSettingsText(folder));
        if (typeof parsed === 'string') {
          loadError = `${ownPath} can't be read as settings. ${parsed}`;
          return;
        }
        original = parsed;
        form = toSettings(parsed);
        const owner = space.space.includes('/') ? space.space.split('/')[0] : '';
        void mtsync.whoami(space.server).then(who => {
          if (who?.signedIn && who.account) writer = { account: who.account, owner };
        }, () => {});
        if (capabilities.kind === 'web' && space.space.includes('/')) {
          void siteAccount.services().then(s => { myAgents = s.agents?.list ?? []; }, () => {});
        }
        // This folder's files (pattern suggestions, read-only matches, the AGENTS.md excerpt) come
        // after the dialog opens, and only the first FILES_SHOWN: enough to suggest and show matches.
        void loadFiles();
      } finally {
        loading = false;
      }
    })();
  });

  async function loadFiles() {
    const listing = await backend.files.list(root, true, { prefix: folder, limit: FILES_SHOWN }).catch(() => null);
    files = listing?.files ?? [];
    filesCut = !!listing?.truncated;
    agentsFile = files.find(f => f.toLowerCase() === (folder + 'agents.md').toLowerCase()) ?? null;
    // A folder of more than FILES_SHOWN files may hold these beyond the first page: look for them directly.
    let agentsText: string | null = null;
    if (!agentsFile && filesCut) {
      agentsText = await readText(folder + 'AGENTS.md');
      if (agentsText !== null) agentsFile = folder + 'AGENTS.md';
    }
    if (filesCut && !files.includes(folder + RUNNER_LOG)) runnerFound = (await readText(folder + RUNNER_LOG)) !== null;
    if (agentsFile) {
      const text = agentsText ?? await readText(agentsFile);
      agentsExcerpt = (text ?? '').split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#')).slice(0, 3).join(' ');
      if (agentsExcerpt.length > 280) agentsExcerpt = agentsExcerpt.slice(0, 280) + '…';
    }
  }

  // ---- What the form writes, and what's wrong with it -------------------------------------

  const output = $derived(form ? toObject(form, original, isRoot) : {});
  const outputText = $derived(toText(output));
  const changed = $derived(form !== null && stableJson(output) !== stableJson(original));
  const githubFolders = $derived(descriptions.filter(d => d.github).map(d => d.folder));
  const ownedSpace = $derived(space.space.includes('/'));
  const context = $derived<SpaceContext>({ texts, githubFolders, files, publicSpace: space.space === 'public', ownedSpace, writer });
  const problems = $derived<Problem[]>(form && changed ? check(form, outputText, folder, context) : []);
  const problemsOn = (p: Page) => problems.filter(x => x.page === p);

  /** Keys nobody can change now, and the folder whose lock says so. */
  const frozen = $derived(form ? frozenKeys(texts, folder) : new Map<string, string>());
  /** Locks as on disk, inherited ones included: what stops agents (or everyone). */
  const savedLocks = $derived(effectiveLocks(effectiveSettings(texts, folder)));
  const lockNote = (key: LockKey) => {
    const where = frozen.get(key);
    if (where !== undefined) return `Locked for everyone${where === folder ? '' : ` by ${folderLabel(where)}`}: nobody can change it until a person lifts the lock.`;
    if (savedLocks[key] === 'agents') return 'Locked for agents: only people can change it.';
    if (savedLocks[key] === 'folderAgents') return 'Locked for folder actions: their agents can\'t change it.';
    if (savedLocks[key] === 'connectedAgents') return 'Locked for connected agents: they can\'t change it.';
    return '';
  };
  const disabled = (key: LockKey) => readOnlySpace || frozen.has(key);
  /** The lock note for one key, or for several (each labelled when they differ), for a section's padlock. */
  const lockNotes = (keys: LockKey | LockKey[]) => {
    const list = Array.isArray(keys) ? keys : [keys];
    const notes = list.map(k => ({ k, note: lockNote(k) })).filter(x => x.note);
    if (new Set(notes.map(x => x.note)).size <= 1) return notes[0]?.note ?? '';
    return notes.map(x => `${LOCK_KEY_LABELS[x.k]?.title ?? x.k}: ${x.note}`).join('\n');
  };

  /** What the parent folder's settings give this folder when it inherits. */
  const parentEffective = $derived(!isRoot ? effectiveSettings(texts, parentFolder(folder)) : null);
  function inherited(key: string): { value: unknown; from: string } | null {
    if (!form?.inherit || !parentEffective || !(key in parentEffective.keys)) return null;
    return { value: JSON.parse(parentEffective.keys[key]), from: parentEffective.from[key] };
  }
  const inheritedPurpose = $derived(form?.inherit && !form.purpose.trim() ? inherited('purpose') : null);
  const inheritedChildren = $derived(form?.inherit && !form.children.some(c => c.name.trim()) ? inherited('children') : null);
  const inheritedLocks = $derived(inherited('locked'));
  const inheritedPrintImage = $derived.by(() => {
    const value = form?.inherit && !form.printImage.trim() ? inherited('print')?.value : null;
    return value && typeof value === 'object' && typeof (value as { image?: unknown }).image === 'string' ? (value as { image: string }).image : null;
  });
  /** The footer this folder's pages get from a folder above when it sets none itself. */
  const footerAbove = $derived(form ? footerFrom(texts, folder) : null);
  const usesParentLocks = $derived(!!form && !isRoot && form.inherit && !form.ownLocks);

  /** What the folder will see once saved, with inherited settings filled in. */
  const effectiveAfter = $derived.by(() => {
    const after = new Map(texts);
    after.set(folder, outputText);
    const eff = effectiveSettings(after, folder);
    return JSON.stringify(Object.fromEntries(Object.entries(eff.keys).map(([k, v]) => [k, JSON.parse(v)])), null, 2);
  });

  /** Names directly in this folder, for the name boxes: files, and subfolders ending in /. */
  const entries = $derived.by(() => {
    const names = new Set<string>();
    for (const f of files) {
      if (!f.startsWith(folder)) continue;
      const rest = f.slice(folder.length);
      const slash = rest.indexOf('/');
      const name = slash < 0 ? rest : rest.slice(0, slash + 1);
      if (name !== SETTINGS_FILE && name.toLowerCase() !== 'agents.md') names.add(name);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  });

  /** The GitHub folder this one is inside (or is), if any. */
  const githubAround = $derived(githubFolders.find(g => g !== folder && folder.startsWith(g)) ?? null);
  const githubWhy = $derived(
    isRoot ? 'The top of a space can\'t mirror a repository: use a folder.'
      : space.space === 'public' ? 'Only your own spaces can mirror a GitHub repository.'
      : githubAround ? `This folder is inside ${githubAround}, which already mirrors a repository, and GitHub folders can't nest.`
      : null,
  );

  // ---- Publishing ---------------------------------------------------------------------------------

  /** The version published now (as saved), or null. */
  const savedVersion = $derived(toSavedVersion(texts.get(folder) ?? null));
  const nextVersion = $derived((savedVersion ?? 0) + 1);
  const servicesWhy = $derived(space.space === 'public' ? 'Only your own spaces can track who has read the published files.' : null);

  function setPublishing(on: boolean) {
    if (!form) return;
    form.publishedVersion = on ? savedVersion ?? 1 : null;
  }

  function setAcknowledge(on: boolean) {
    if (!form) return;
    form.acknowledge = on ? { files: [], newFiles: false } : null;
  }

  let readers = $state<ReaderReport | null>(null);
  let readersError = $state('');
  let readersLoading = $state(false);

  async function loadReaders() {
    readersLoading = true;
    readersError = '';
    try {
      readers = await fetchReaders(root);
    } catch (e) {
      readersError = String(e);
    } finally {
      readersLoading = false;
    }
  }

  // ---- Receiving email (Metatrash 0.97.0; several per folder, by name, 0.97.2) ---------------------

  /** The email services as saved: the addresses shown are the saved ones'. */
  const savedEmails = $derived(toSettings(original).emails);
  const savedEmailOf = (e: EmailService) => (e.saved === null ? null : savedEmails.find(x => x.name === e.saved) ?? null);
  /** Addresses fetched so far, by the saved service's name. */
  let emailAddresses = $state<Record<string, string>>({});
  let emailAddressErrors = $state<Record<string, string>>({});
  let emailAddressLoading = $state<Record<string, boolean>>({});
  let emailCopied = $state('');
  const emailWhy = $derived(
    !ownedSpace ? 'Only your own spaces can receive email, not the public space.'
      : form?.github || githubAround ? 'A folder that mirrors a GitHub repository can\'t receive email.'
      : null,
  );
  /** Where the space's owner reads an address on the website (the desktop app can't ask yet). */
  const emailAddressPage = (name: string) => `${space.server}/api/v1/site/spaces/${space.space}/email?folder=${encodeURIComponent(folder)}${name ? `&name=${encodeURIComponent(name)}` : ''}`;

  async function loadEmailAddress(name: string) {
    if (!backend.sync.emailAddress) return;
    emailAddressLoading = { ...emailAddressLoading, [name]: true };
    emailAddressErrors = { ...emailAddressErrors, [name]: '' };
    try {
      const address = await backend.sync.emailAddress(root, folder, name);
      emailAddresses = { ...emailAddresses, [name]: address };
    } catch (e) {
      emailAddressErrors = { ...emailAddressErrors, [name]: e instanceof Error ? e.message : String(e) };
    } finally {
      emailAddressLoading = { ...emailAddressLoading, [name]: false };
    }
  }

  $effect(() => {
    if (page !== 'automation') return;
    for (const e of savedEmails) {
      if (!emailAddresses[e.name] && !emailAddressLoading[e.name] && !emailAddressErrors[e.name]) void loadEmailAddress(e.name);
    }
  });

  /** The website can save an email service on its own and show the address straight away. */
  const emailNow = $derived(capabilities.kind === 'web' && !!backend.sync.emailAddress);
  /** The email service (by its place in the list) being saved on its own, and why that failed. */
  let emailCreating = $state<EmailService | null>(null);
  let emailCreateErrors = $state(new Map<EmailService, string>());
  const setCreateError = (e: EmailService, text: string) => { emailCreateErrors = new Map(emailCreateErrors).set(e, text); };

  function addEmail() {
    if (!form) return;
    const email = newEmail(form.emails.map(e => e.name.trim()));
    form.emails.push(email);
    openItem = `email-${form.emails.length - 1}`;
    if (emailNow) void saveEmailNow(form.emails[form.emails.length - 1]);
  }

  /**
   * Saves only this email service as it is in the form (other edits stay pending for Save) and shows its
   * address: on adding Receive email, and for a new address.
   */
  async function saveEmailNow(email: EmailService) {
    if (!form || readOnlySpace || emailCreating) return;
    emailCreating = email;
    setCreateError(email, '');
    try {
      const now = await readText(ownPath);
      if (now !== texts.get(folder)) {
        setCreateError(email, `${ownPath} changed while this was open (perhaps a sync). Close and open Properties again.`);
        return;
      }
      const next = toSettings(original);
      const copy = { ...email, name: email.name.trim() };
      const at = email.saved === null ? -1 : next.emails.findIndex(x => x.name === email.saved);
      if (at >= 0) next.emails[at] = copy; else next.emails.push(copy);
      const value = toObject(next, original, isRoot);
      const text = toText(value);
      const issues = check(next, text, folder, context).filter(p => p.page === 'automation');
      if (issues.length) {
        setCreateError(email, issues[0].text);
        return;
      }
      await backend.files.write(joinPath(root, ownPath), text, false);
      texts = new Map(texts).set(folder, text);
      original = value;
      onSaved();
      email.name = copy.name;
      email.saved = copy.name;
      const { [copy.name]: _gone, ...rest } = emailAddresses;
      emailAddresses = rest;
      await loadEmailAddress(copy.name);
    } catch (e) {
      setCreateError(email, e instanceof Error ? e.message : String(e));
    } finally {
      emailCreating = null;
    }
  }

  /** Raises the address's version by one from the saved one: saving retires the address. */
  function newEmailAddress(email: EmailService) {
    const saved = savedEmailOf(email);
    if (saved) email.address = saved.address + 1;
  }

  async function copyEmailAddress(address: string) {
    try {
      await navigator.clipboard.writeText(address);
      emailCopied = address;
      setTimeout(() => (emailCopied = ''), 2000);
    } catch {
      emailCopied = '';
    }
  }

  /** The report's files in this folder (all of them when the space is synced under a prefix). */
  const readerColumns = $derived.by(() => {
    if (!readers) return [];
    const all = readers.files.map((f, i) => ({ ...f, i }));
    const here = all.filter(f => f.path.startsWith(folder));
    return here.length ? here : all;
  });

  // ---- Editing helpers --------------------------------------------------------------------------

  function setInherit(on: boolean) {
    if (!form) return;
    form.inherit = on;
  }

  /** Switching to own locks starts from the parent's, so nothing is unlocked by surprise. */
  function setOwnLocks(own: boolean) {
    if (!form) return;
    if (own && !form.ownLocks && inheritedLocks) {
      const map = inheritedLocks.value as Record<string, string> | string[];
      const levels = Array.isArray(map) ? Object.fromEntries(map.map(k => [k, 'agents'])) : map;
      for (const key of LOCK_KEYS) form.locked[key] = (isLockLevel(levels[key]) ? levels[key] : '') as LockLevel;
    }
    form.ownLocks = own;
  }

  function addChild() { form?.children.push({ name: '', text: '' }); }
  function addReadOnly(name = '') { form?.readOnly.push({ name, level: 'agents' }); }

  function setGithub(on: boolean) {
    if (!form) return;
    form.github = on ? { repo: '', branch: '', push: '', pull: '' } : null;
  }

  /** The default mode is left out of the file unless it was written there already. */
  function setPush(mode: PushMode) {
    if (!form?.github) return;
    form.github.push = mode === 'agent' && toSettings(original).github?.push !== 'agent' ? '' : mode;
  }

  function previewMatches(name: string): string {
    const entry = name.trim();
    if (!entry) return '';
    const hits = lockedBy(entry, folder, files);
    if (!hits.length) return (entry.endsWith('/') ? 'No files in a subfolder of that name yet' : 'No file matches yet') + `${among}.`;
    const shown = hits.slice(0, 3).map(h => h.slice(folder.length)).join(', ');
    return `Locks ${hits.length === 1 ? '' : `${hits.length}${filesCut ? '+' : ''} files: `}${shown}${hits.length > 3 ? ', …' : ''}${among}`;
  }

  // ---- Automation (folder actions) ---------------------------------------------------------------

  const owning = $derived(isOwner(writer));
  /** The Automation entry whose details are open: `email-<i>` or `action-<i>`, by place in its list. */
  let openItem = $state<string | null>(null);
  /** The entry whose delete is waiting for a yes. */
  let confirmRemove = $state<string | null>(null);
  /** Actions whose model is typed rather than picked. */
  let typedModel = $state(new Set<number>());

  const savedActionNames = $derived(new Set(toSettings(original).actions.map(a => a.name)));
  const canEditAction = (a: ActionForm) => !readOnlySpace && !frozen.has('actions') && ownedSpace && (owning ? !a.member : a.member === writer.account);
  const canRemoveAction = (a: ActionForm) => !readOnlySpace && !frozen.has('actions') && (owning || a.member === writer.account);
  /** runner.md exists though it wasn't among the first FILES_SHOWN files. */
  let runnerFound = $state(false);
  const runnerLog = $derived(files.includes(folder + RUNNER_LOG) || runnerFound ? folder + RUNNER_LOG : null);

  /** Markdown files in this folder and below, relative to it, for instructions kept in a file. */
  const instructionFiles = $derived(
    files.filter(f => f.startsWith(folder) && /\.md$/i.test(f) && !/\s/.test(f.slice(folder.length)))
      .map(f => f.slice(folder.length))
      .filter(f => f !== RUNNER_LOG && !/(^|\/)agents\.md$/i.test(f))
      .sort((a, b) => a.localeCompare(b)),
  );

  /** Subfolders of this folder (relative, ending in /), offered as patterns. */
  const subfolders = $derived.by(() => {
    const out = new Set<string>();
    for (const f of files) {
      if (!f.startsWith(folder)) continue;
      const parts = f.slice(folder.length).split('/');
      for (let i = 1; i < parts.length; i++) out.add(parts.slice(0, i).join('/') + '/');
    }
    return [...out].sort((a, b) => a.localeCompare(b));
  });
  const patternSuggestions = $derived([...new Set([...subfolders.flatMap(d => [d, `${d}*.md`]), '*.md', '*.pdf', ...entries.filter(e => !e.endsWith('/'))])]);

  /** The models to choose from: the person's own agents (website), then each provider's suggested model. */
  const modelChoices = $derived.by(() => {
    const out: { value: string; label: string }[] = [];
    for (const agent of myAgents) {
      const value = `${agent.provider}/${agent.model}`;
      if (!out.some(c => c.value === value)) out.push({ value, label: `${agent.name}: ${agent.providerName} ${agent.model}${agent.default ? ' (your default)' : ''}` });
    }
    for (const p of PROVIDERS) {
      const value = `${p.value}/${p.model}`;
      if (!out.some(c => c.value === value)) out.push({ value, label: `${p.name} ${p.model}` });
    }
    return out;
  });
  const defaultAgent = $derived(myAgents.find(a => a.default) ?? myAgents[0] ?? null);
  const agentLabel = (a: ActionForm) => {
    const who = a.member ? `${a.member}'s` : a.pays === 'contributor' ? 'the contributor\'s' : owning ? 'your' : 'the owner\'s';
    return a.model ? `${a.model} on ${who} agent` : `${who} default agent`;
  };

  function addAction() {
    if (!form) return;
    form.actions.push(newAction(owning ? '' : writer.account, form.actions.map(a => a.name)));
    openItem = `action-${form.actions.length - 1}`;
  }

  function removeAction(i: number) {
    if (!form) return;
    form.actions.splice(i, 1);
    openItem = null;
    confirmRemove = null;
    typedModel = new Set([...typedModel].filter(x => x !== i).map(x => (x > i ? x - 1 : x)));
    onlyTools = new Set([...onlyTools].filter(x => x !== i).map(x => (x > i ? x - 1 : x)));
  }

  function removeEmail(i: number) {
    if (!form) return;
    form.emails.splice(i, 1);
    openItem = null;
    confirmRemove = null;
  }

  /** Add action: what kind. */
  let addKind = $state('');
  function addItem(kind: string) {
    addKind = '';
    if (kind === 'agent') addAction();
    else if (kind === 'email') addEmail();
  }

  // Drag to reorder: within its own kind, since email services and agent actions are kept in
  // separate lists of the settings file (services and actions). The order is saved as shown.
  let dragging = $state<{ kind: 'email' | 'action'; from: number } | null>(null);
  let dropAt = $state<string | null>(null);
  function moveItem(kind: 'email' | 'action', from: number, to: number) {
    if (!form || from === to) return;
    const list: unknown[] = kind === 'email' ? form.emails : form.actions;
    const [item] = list.splice(from, 1);
    list.splice(to, 0, item);
    openItem = null;
    confirmRemove = null;
    if (kind === 'action') { typedModel = new Set(); onlyTools = new Set(); }
  }
  function onDrop(kind: 'email' | 'action', to: number) {
    if (dragging && dragging.kind === kind) moveItem(kind, dragging.from, to);
    dragging = null;
    dropAt = null;
  }

  function setTrigger(a: ActionForm, trigger: 'files' | 'schedule') {
    a.trigger = trigger;
    if (trigger === 'files' && !a.on.some(p => p.trim())) a.on = ['inbound/*.md'];
    if (trigger === 'schedule') {
      if (!parseSchedule(a.every)) a.every = 'day 06:00';
      if (a.pays === 'contributor') a.pays = '';
    }
  }

  function setSchedule(a: ActionForm, change: Partial<Schedule>) {
    const now = parseSchedule(a.every) ?? { kind: 'day' as ScheduleKind, hour: 6, minute: 0, weekday: 'monday', monthDay: 1 };
    a.every = scheduleText({ ...now, ...change });
  }

  function setTime(a: ActionForm, value: string) {
    const m = /^(\d{1,2}):(\d{2})/.exec(value);
    if (m) setSchedule(a, { hour: Number(m[1]), minute: Number(m[2]) });
  }

  const clock = (s: Schedule) => `${String(s.hour).padStart(2, '0')}:${String(s.minute).padStart(2, '0')}`;

  function setModel(i: number, a: ActionForm, value: string) {
    if (value === '\u0000other') { typedModel = new Set([...typedModel, i]); return; }
    a.model = value;
    if (!value && a.pays === 'contributor') a.pays = '';
  }

  /** Actions whose tools are being chosen one by one, though every tool may still be ticked. */
  let onlyTools = $state(new Set<number>());
  const choosingTools = (i: number, a: ActionForm) => onlyTools.has(i) || !allTools(a);

  function setTools(a: ActionForm, name: string, on: boolean) {
    const list = a.tools ?? TOOLS.map(t => t.name);
    const chosen = on ? TOOLS.map(t => t.name).filter(t => t === name || list.includes(t)) : TOOLS.map(t => t.name).filter(t => t !== name && list.includes(t));
    a.tools = sendsForms(a) ? [...chosen, SUBMIT_TOOL] : chosen;
  }

  function setWeb(a: ActionForm, on: boolean) {
    a.web = on ? (a.raw?.web === true ? true : null) : false;
  }

  function setChange(a: ActionForm, on: boolean) {
    a.when = on ? 'change' : a.raw?.when === 'arrive' ? 'arrive' : '';
  }

  function setPays(a: ActionForm, contributor: boolean) {
    a.pays = contributor ? 'contributor' : a.raw?.pays === 'owner' ? 'owner' : '';
  }

  function matchNote(a: ActionForm): string {
    const hits = matchingFiles(a.on, folder, files);
    if (!hits.length) return `No files here match yet${among}. Only files that arrive after you save start a job.`;
    const shown = hits.slice(0, 3).map(h => h.slice(folder.length)).join(', ');
    return `${hits.length === 1 ? 'One file matches' : `${hits.length}${filesCut ? '+' : ''} files match`} now${among} (${shown}${hits.length > 3 ? ', …' : ''}). They don't start a job: only files that arrive after you save do.`;
  }

  // ---- Run again (Metatrash 0.101.0) ------------------------------------------------------

  /** The action being run again: what the site said it covers (asked first), then what it queued, or why not. */
  let rerun = $state<{ key: string; busy: boolean; preview: Rerun | null; queued: number; error: string } | null>(null);

  /** An action as saved, unchanged here, that files start, in a space on this website: it can run again now. */
  const canRunAgain = (a: ActionForm) =>
    capabilities.kind === 'web' && ownedSpace && !readOnlySpace && a.trigger === 'files' && !!a.raw && sameAction(actionObject(a), a.raw);

  async function askRerun(key: string, a: ActionForm, confirm: boolean) {
    rerun = { key, busy: true, preview: confirm ? rerun?.preview ?? null : null, queued: 0, error: '' };
    try {
      const out = await rerunAction(space.space, folder, a.name, confirm);
      if (rerun?.key !== key) return;
      rerun = confirm ? { key, busy: false, preview: null, queued: out.queued ?? 0, error: '' } : { key, busy: false, preview: out, queued: 0, error: '' };
    } catch (error) {
      if (rerun?.key === key) rerun = { key, busy: false, preview: null, queued: 0, error: error instanceof Error ? error.message : String(error) };
    }
  }

  const fileCount = (n: number) => (n === 1 ? 'one file' : `${n} files`);

  function openAgentsSettings() {
    void backend.opener.url(`${capabilities.kind === 'web' ? location.origin : space.server}/#settings/services/agents`);
  }

  // ---- Save -------------------------------------------------------------------------------

  async function save() {
    if (!form || !changed || problems.length || saving || readOnlySpace) return;
    saving = true;
    saveError = '';
    try {
      // Someone (or Sync) may have changed the file since it was opened here.
      const now = await readText(ownPath);
      if (now !== texts.get(folder)) {
        saveError = `${ownPath} changed while this was open (perhaps a sync). Close and open Properties again to see the new settings.`;
        return;
      }
      await backend.files.write(joinPath(root, ownPath), outputText, false);
      onSaved();
      onClose();
    } catch (e) {
      saveError = String(e);
    } finally {
      saving = false;
    }
  }

  function close() {
    if (changed && !readOnlySpace && !confirmDiscard) { confirmDiscard = true; return; }
    onClose();
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void save(); }
  }

  const footerProblem = $derived.by(() => {
    if (!problems.length) return '';
    const pages = [...new Set(problems.map(p => PAGES.find(x => x.id === p.page)!.title))];
    return `${problems.length === 1 ? 'One thing needs' : `${problems.length} things need`} fixing first (${pages.join(', ')}).`;
  });
</script>

<svelte:window onkeydown={onKeydown} />

{#snippet lockMark(keys: LockKey | LockKey[])}
  {@const note = lockNotes(keys)}
  {#if note}
    <span class="lock-mark" role="img" aria-label={note} title={note}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2M3.5 7h9a1 1 0 0 1 1 1v5.5a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z" /></svg></span>
  {/if}
{/snippet}

{#snippet binIcon()}
  <svg class="bin" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.6a1 1 0 0 0 1 .9h4.6a1 1 0 0 0 1-.9L12 4M6.6 6.5v5M9.4 6.5v5" /></svg>
{/snippet}

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" onclick={close}>
  <div class="panel" role="dialog" tabindex="-1" aria-label="Folder Properties" onclick={event => event.stopPropagation()}>
    <header>
      <svg class="folder-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 3.5a1 1 0 0 1 1-1h3.5l1.5 2h6a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z" /></svg>
      <div class="heading">
        <h2>{title} <span class="muted">Properties</span></h2>
        <p class="muted">{isRoot ? `The top folder of ${space.space}` : `${folder} in ${space.space}`}{readOnlySpace ? ' · read-only space' : ''}</p>
      </div>
      <button class="close" aria-label="Close" title="Close (Esc)" onclick={close}>×</button>
    </header>

    {#if loading}
      <p class="body-message">Reading the folder's settings…</p>
    {:else if loadError || !form}
      <div class="body-message">
        <p class="error">{loadError || 'The settings could not be read.'}</p>
        <p class="muted">Fix the file by hand, then open Properties again.</p>
        <div class="buttons">
          <span class="grow"></span>
          <button onclick={onClose}>Close</button>
          <button class="primary" onclick={() => { onOpenFile(ownPath); onClose(); }}>Open {SETTINGS_FILE} as Text</button>
        </div>
      </div>
    {:else}
      <div class="main">
        <nav aria-label="Settings pages">
          {#each PAGES as p (p.id)}
            <button class:active={page === p.id} onclick={() => (page = p.id)}>
              <span class="nav-title">{p.title}{#if problemsOn(p.id).length}<span class="dot" title="Needs fixing">●</span>{/if}</span>
              <span class="nav-about">{p.about}</span>
            </button>
          {/each}
        </nav>

        <div class="content">
          <button class="help" aria-label="Help with the {currentPage.title} page" title="Help with the {currentPage.title} page (opens the guide)" onclick={openHelp}>?</button>
          {#if readOnlySpace}
            <p class="note">You can read these settings, but this space is read-only for you, so they can't be changed here.</p>
          {/if}
          {#each problemsOn(page) as problem (problem.text)}
            <p class="problem">{problem.text}</p>
          {/each}

          {#if page === 'general'}
            {#if !isRoot}
              <section>
                <label class="check">
                  <input type="checkbox" checked={form.inherit} disabled={disabled('inherit')} onchange={event => setInherit(event.currentTarget.checked)} />
                  <span>
                    <b>Use the settings of {folderLabel(parentFolder(folder))}</b>{@render lockMark('inherit')}
                    <span class="hint">This folder takes its parent's summary, descriptions and locks, except where it sets its own. Read-only files and connections always belong to one folder and are never passed down. New folders start this way.</span>
                  </span>
                </label>
              </section>
            {/if}

            <section>
              <h3>Instructions for agents</h3>
              {#if agentsFile}
                <div class="card">
                  <p class="hint">Agents read <code>{agentsFile}</code> before working in this folder: what it holds, how it's organised, and any house rules. Write it as you would brief a new colleague.</p>
                  {#if agentsExcerpt}<p class="excerpt">{agentsExcerpt}</p>{/if}
                  <button class="small" onclick={() => { onOpenFile(agentsFile!); onClose(); }}>Open AGENTS.md</button>
                </div>
              {:else}
                <p class="hint">Every folder in a space gets an AGENTS.md once it holds a file. This one doesn't have one yet.</p>
              {/if}
            </section>

            <section>
              <h3>Summary{@render lockMark('purpose')}</h3>
              <p class="hint">A sentence or two about what this folder is for. Slate Viewer shows it when you point at the folder in Files, and agents see it in the settings. Longer guidance belongs in AGENTS.md.</p>
              <textarea
                rows="3"
                bind:value={form.purpose}
                disabled={disabled('purpose')}
                placeholder={inheritedPurpose ? `From ${folderLabel(inheritedPurpose.from)}: ${String(inheritedPurpose.value)}` : 'For example: Meeting notes for the website project, newest first.'}
              ></textarea>
              <p class="meta">
                {#if inheritedPurpose}<span>Showing the summary passed down from {folderLabel(inheritedPurpose.from)}; type to give this folder its own.</span>{/if}
                <span class="grow"></span><span class:over={form.purpose.length > 2000}>{form.purpose.length} / 2000</span>
              </p>
            </section>

            <section>
              <h3>Descriptions of what's inside{@render lockMark('children')}</h3>
              <p class="hint">A line about a file or subfolder (subfolders end in <code>/</code>). Slate Viewer shows it when you point at the entry.</p>
              {#if inheritedChildren}
                <p class="hint">Using the descriptions from {folderLabel(inheritedChildren.from)} until this folder has its own.</p>
              {/if}
              <datalist id="folder-entries">{#each entries as e (e)}<option value={e}></option>{/each}</datalist>
              {#each form.children as child, i (i)}
                <div class="pair">
                  <input class="name" list="folder-entries" bind:value={child.name} placeholder="notes/ or plan.md" spellcheck="false" disabled={disabled('children')} />
                  <input class="grow" bind:value={child.text} placeholder="What it holds" disabled={disabled('children')} />
                  <button class="remove" aria-label="Remove" title="Remove" disabled={disabled('children')} onclick={() => form!.children.splice(i, 1)}>×</button>
                </div>
              {/each}
              <button class="small" disabled={disabled('children')} onclick={addChild}>Add a Description</button>
            </section>

            <section>
              <h3>Opens on{@render lockMark('home')}</h3>
              <p class="hint">{folder === '' ? 'The file the space opens on, at the top of the space.' : 'The file this folder opens on when you click it in Files.'} Empty opens dashboard.md when there is one, else README.md.</p>
              <datalist id="folder-notes">{#each entries.filter(e => /\.md$/i.test(e)) as e (e)}<option value={e}></option>{/each}</datalist>
              <input class="name wide" list="folder-notes" bind:value={form.home} placeholder="dashboard.md" spellcheck="false" disabled={disabled('home')} />
            </section>

            <section>
              <h3>Order in Files{@render lockMark('sort')}</h3>
              <p class="hint">How {folder === '' ? 'the top of the space' : 'this folder'} lists its files and subfolders in Files, here and on the website. Subfolders always come first. Z to A suits names that start with a date, so the newest is on top. Only this folder: a subfolder chooses its own.</p>
              <div class="choice row">
                <label><input type="radio" name="folder-sort" checked={!form.zToA} disabled={disabled('sort')} onchange={() => (form!.zToA = false)} /> Name, A to Z</label>
                <label><input type="radio" name="folder-sort" checked={form.zToA} disabled={disabled('sort')} onchange={() => (form!.zToA = true)} /> Name, Z to A</label>
              </div>
            </section>

          {:else if page === 'security'}
            <section class="card">
              <p class="hint"><b>People and agents.</b> A change you make here, in Files or through Metatrash Sync counts as a person's, and so does one by a member with write access. Everything else is an agent, of one of two kinds: <b>folder actions</b>, the agents on the Automation page, and <b>connected agents</b>, such as Claude and other AI apps, space keys and the public connection. Anything not locked can be changed by anyone with write access.</p>
            </section>

            <section>
              <h3>Read-only files{@render lockMark('readOnly')}</h3>
              <p class="hint">Lock files in this folder so they can't be written, edited, renamed, moved or deleted, and no file of that name can be created. Name one file (<code>plan.md</code>), a pattern (<code>*.pdf</code>, <code>2025-*.md</code>) or a subfolder for everything in it (<code>archive/</code>). Only this folder's files: a subfolder sets its own.</p>
              {#each form.readOnly as entry, i (i)}
                <div class="pair">
                  <input class="name wide" list="folder-entries" bind:value={entry.name} placeholder="plan.md, *.pdf or archive/" spellcheck="false" disabled={disabled('readOnly')} />
                  <select bind:value={entry.level} disabled={disabled('readOnly')}>
                    {#each FILE_LEVELS as l (l.level)}<option value={l.level}>{l.title}</option>{/each}
                  </select>
                  <button class="remove" aria-label="Remove" title="Remove" disabled={disabled('readOnly')} onclick={() => form!.readOnly.splice(i, 1)}>×</button>
                </div>
                <p class="matches">{previewMatches(entry.name)}</p>
              {/each}
              <datalist id="folder-entries">{#each entries as e (e)}<option value={e}></option>{/each}</datalist>
              <button class="small" disabled={disabled('readOnly')} onclick={() => addReadOnly()}>Add a Read-only File</button>
              <p class="hint small-print">A file locked for everyone stays as it is: if it is changed on this computer anyway, Metatrash Sync puts the space's version back and keeps yours as a conflict copy. {SETTINGS_FILE} itself can be locked for agents at most, so its locks can always be lifted.</p>
            </section>

            <section>
              <h3>Locked settings</h3>
              <p class="hint">Stop the settings on these pages from being changed, and choose who may fill in this folder's forms and take its quizzes. A lock applies to subfolders that use this folder's settings, and they can't override a locked value.</p>
              {#if !isRoot && form.inherit}
                <div class="choice">
                  <label><input type="radio" name="own-locks" checked={!form.ownLocks} disabled={readOnlySpace} onchange={() => setOwnLocks(false)} /> Use the locks of {folderLabel(inheritedLocks?.from ?? parentFolder(folder))}</label>
                  <label><input type="radio" name="own-locks" checked={form.ownLocks} disabled={readOnlySpace} onchange={() => setOwnLocks(true)} /> Set this folder's own locks</label>
                </div>
              {/if}
              <table class="locks">
                <tbody>
                  {#each LOCK_KEYS as key (key)}
                    <tr>
                      <th>
                        {LOCK_KEY_LABELS[key].title}
                        <span class="hint">{LOCK_KEY_LABELS[key].about}</span>
                      </th>
                      <td>
                        {#if key === 'locked'}
                          <span class="fixed">Always locked for agents</span>
                        {:else if usesParentLocks}
                          {@const level = (inheritedLocks ? (Array.isArray(inheritedLocks.value) ? ((inheritedLocks.value as string[]).includes(key) ? 'agents' : '') : ((inheritedLocks.value as Record<string, string>)[key] ?? '')) : '')}
                          <span class="fixed">{LEVELS.find(l => l.level === level)?.title ?? 'Unlocked'} (from {folderLabel(inheritedLocks?.from ?? parentFolder(folder))})</span>
                        {:else}
                          <select bind:value={form.locked[key]} disabled={readOnlySpace}>
                            {#each LEVELS as l (l.level)}<option value={l.level}>{l.title}</option>{/each}
                          </select>
                        {/if}
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
              <ul class="levels">
                {#each LEVELS as l (l.level)}<li><b>{l.title}:</b> {l.about}</li>{/each}
              </ul>
              <p class="hint small-print">To change a setting locked for everyone, set its lock to Unlocked or Locked for agents, save, and make the change once Metatrash Sync has sent it (two saves, so nobody lifts a lock by accident). Using the parent's settings is locked for agents whenever any lock applies, so agents can't step out of the parent's locks.</p>
            </section>

          {:else if page === 'connections'}
            <section>
              <h3>GitHub repository{@render lockMark('services')}</h3>
              <p class="hint">Mirror a GitHub repository in this folder. Agents pull it in, edit the files, and push their changes back with a commit message; GitHub records the commit as the Metatrash app. Files outside the folder stay in the space only.</p>
              <label class="check">
                <input type="checkbox" checked={form.github !== null} disabled={disabled('services') || (githubWhy !== null && form.github === null)} onchange={event => setGithub(event.currentTarget.checked)} />
                <span><b>This folder mirrors a GitHub repository</b>
                  {#if githubWhy && form.github === null}<span class="hint">{githubWhy}</span>{/if}
                </span>
              </label>
              {#if form.github}
                <div class="fields">
                  <label>
                    <span>Repository</span>
                    <input bind:value={form.github.repo} placeholder="owner/name, for example dave-zap/website" spellcheck="false" disabled={disabled('services')} />
                  </label>
                  <label>
                    <span>Branch</span>
                    <input bind:value={form.github.branch} placeholder="main" spellcheck="false" disabled={disabled('services')} />
                  </label>
                </div>
                <h4>Send changes to GitHub</h4>
                <div class="choice">
                  {#each PUSH_MODES as m (m.mode)}
                    <label>
                      <input type="radio" name="push" checked={(form.github.push || 'agent') === m.mode} disabled={disabled('services')} onchange={() => setPush(m.mode)} />
                      <span><b>{m.title}</b> <span class="hint">{m.about}</span></span>
                    </label>
                  {/each}
                </div>
                <h4>Bring changes from GitHub</h4>
                <p class="hint">Agents pull at the start of their work. Files changed on GitHub come in; files changed here and not yet pushed stay as they are. A file changed on both sides stops the pull until it is sorted out.</p>
                <div class="card">
                  <p class="hint"><b>Before the first pull:</b> connect GitHub on <button class="link" onclick={() => void backend.opener.url(`${space.server}/account`)}>your Metatrash account</button> for the repository's owner. The folder should be empty, or hold only files identical to the repository's. Files in <code>.github/workflows/</code> are changed on GitHub directly. Names starting with a dot are allowed only inside GitHub folders.</p>
                </div>
              {/if}
            </section>

          {:else if page === 'publishing'}
            <section>
              <h3>Published versions{@render lockMark('publishedVersion')}</h3>
              <p class="hint">Publish this folder's files as numbered versions, like an official edition. Everyone opens the published text by default, and History marks it. Edits after it are a draft, visible to the space, until you publish the next version. A subfolder can publish on its own.</p>
              <label class="check">
                <input type="checkbox" checked={form.publishedVersion !== null} disabled={disabled('publishedVersion')} onchange={event => setPublishing(event.currentTarget.checked)} />
                <span><b>This folder publishes versions</b></span>
              </label>
              {#if form.publishedVersion !== null}
                <div class="card version">
                  {#if savedVersion === null}
                    <p>Saving publishes version {form.publishedVersion}: the folder's files as they are now.</p>
                  {:else if form.publishedVersion === savedVersion}
                    <p>Version <b>{savedVersion}</b> is published. Publishing the next version makes the files as they are now the official text.</p>
                  {:else}
                    <p>Saving publishes version <b>{form.publishedVersion}</b>: the folder's files as they are now. Version {savedVersion} is published until then.</p>
                  {/if}
                  <div class="buttons">
                    <button class="small" disabled={disabled('publishedVersion') || form.publishedVersion === nextVersion} onclick={() => (form!.publishedVersion = nextVersion)}>Publish Version {nextVersion}</button>
                    {#if savedVersion !== null && form.publishedVersion !== savedVersion}
                      <button class="small" onclick={() => (form!.publishedVersion = savedVersion)}>Keep Version {savedVersion}</button>
                    {/if}
                  </div>
                </div>
                <p class="hint small-print">Save any edits to the files first, and let Metatrash Sync send them: a version is the files as the space has them when this setting arrives. The number only goes up. Agents can publish too when asked, unless the published version is locked for agents on the Security page.</p>
              {/if}
            </section>

            <section>
              <h3>Ask people to confirm they've read them{@render lockMark('services')}</h3>
              <p class="hint">Everyone in the space sees a dot on each published file, and a count on Slate Viewer's taskbar button, until they open it and choose I Have Read This. A new version asks again for the files whose text changed. Metatrash keeps who confirmed what, and when.</p>
              <label class="check">
                <input type="checkbox" checked={form.acknowledge !== null} disabled={disabled('services') || (servicesWhy !== null && form.acknowledge === null)} onchange={event => setAcknowledge(event.currentTarget.checked)} />
                <span><b>Ask everyone to confirm they've read {form.acknowledge?.newFiles ? 'its files' : 'the published files'}</b>
                  {#if servicesWhy && form.acknowledge === null}<span class="hint">{servicesWhy}</span>{/if}
                  {#if form.acknowledge && !form.acknowledge.newFiles && form.publishedVersion === null}<span class="hint">Nobody is asked until the folder publishes a version, or you choose to ask for new files as they arrive.</span>{/if}
                </span>
              </label>
              {#if form.acknowledge}
                <h4>When to ask</h4>
                <div class="choice">
                  <label><input type="radio" name="ack-when" checked={!form.acknowledge.newFiles} disabled={disabled('services')} onchange={() => (form!.acknowledge!.newFiles = false)} /> When the folder publishes a version (a new version asks again for the files that changed)</label>
                  <label><input type="radio" name="ack-when" checked={form.acknowledge.newFiles === true} disabled={disabled('services') || form.publishedVersion !== null} onchange={() => (form!.acknowledge!.newFiles = true)} /> As soon as a new file arrives in the folder</label>
                </div>
                {#if form.publishedVersion !== null}
                  <p class="hint small-print">New files are asked for only in a folder that doesn't publish versions. Turn off publishing above to choose it.</p>
                {:else if form.acknowledge.newFiles}
                  <p class="hint small-print">Each file added from now on gets a dot for everyone until they open it and choose I Have Read This. Files already here aren't asked for, and later edits don't ask again.</p>
                {/if}
                <h4>Which files</h4>
                <div class="choice">
                  <label><input type="radio" name="ack-files" checked={form.acknowledge.files.length === 0} disabled={disabled('services')} onchange={() => (form!.acknowledge!.files = [])} /> Every Markdown file (.md) in this folder and its subfolders</label>
                  <label><input type="radio" name="ack-files" checked={form.acknowledge.files.length > 0} disabled={disabled('services')} onchange={() => (form!.acknowledge!.files = [''])} /> Only these</label>
                </div>
                {#if form.acknowledge.files.length}
                  {#each form.acknowledge.files as _, i (i)}
                    <div class="pair">
                      <input class="name wide" list="folder-entries" bind:value={form.acknowledge.files[i]} placeholder="leave.md, *.md or hr/" spellcheck="false" disabled={disabled('services')} />
                      <button class="remove" aria-label="Remove" title="Remove" disabled={disabled('services') || form.acknowledge.files.length === 1} onclick={() => form!.acknowledge!.files.splice(i, 1)}>×</button>
                    </div>
                    <p class="matches">{previewMatches(form.acknowledge.files[i]).replace(/^Locks /, 'Asks for ')}</p>
                  {/each}
                  <datalist id="folder-entries">{#each entries as e (e)}<option value={e}></option>{/each}</datalist>
                  <button class="small" disabled={disabled('services')} onclick={() => form!.acknowledge!.files.push('')}>Add a File</button>
                {/if}
              {/if}
            </section>

            <section>
              <h3>Printed copies{@render lockMark('print')}</h3>
              <p class="hint">An image, such as a logo, printed centred at the top of the first page, above the title, on every document printed from this folder{isRoot ? '' : ' (and from subfolders that use its settings)'}. It is never added to the files. Give the image's web address; it is loaded when you print.</p>
              <input class="address" bind:value={form.printImage} placeholder={inheritedPrintImage ?? 'https://example.com/logo.png'} spellcheck="false" disabled={disabled('print')} />
              {#if inheritedPrintImage}<p class="hint small-print">Empty uses the image from {folderLabel(inherited('print')!.from)}.</p>{/if}
            </section>

            <section>
              <h3>Page footer{@render lockMark('footer')}</h3>
              <p class="hint">Up to three lines shown centred below a rule at the bottom of every page of this folder{isRoot ? '' : ' and its subfolders'} on the website, such as a notice or a link. Subfolders get it whether or not they use this folder's settings, unless they set their own. It is never added to the files.</p>
              <textarea class="address" rows="3" bind:value={form.footer} placeholder={footerAbove?.footer || ':metatrash: is a [Zaptronics](https://zaptronics.co.nz/) product'} spellcheck="false" maxlength={MAX_FOOTER} disabled={disabled('footer') || form.footerOff}></textarea>
              <p class="hint small-print">Markdown, up to three lines (Enter starts a new line): <code>[text](https://…)</code> for a link (or a page of the site, such as <code>/docs/about.md</code>), <code>**bold**</code>, <code>*italic*</code> and <code>`code`</code>; no HTML. {#each footerMarks() as mark, n}{n ? ', ' : ''}<code>:{mark.name}:</code> shows the {mark.label} wordmark{/each}.</p>
              {#if !form.footerOff && !form.footer.trim() && footerAbove}<p class="hint small-print">{footerAbove.footer ? `Empty uses the footer from ${folderLabel(footerAbove.from)}.` : `${folderLabel(footerAbove.from)} turns the footer off, so these pages have none.`}</p>{/if}
              <label class="check">
                <input type="checkbox" bind:checked={form.footerOff} disabled={disabled('footer')} />
                <span>No footer here{isRoot ? '' : ', even if a folder above sets one'}, nor in subfolders that set none</span>
              </label>
            </section>

            {#if toSettings(original).acknowledge && (savedVersion !== null || toSettings(original).acknowledge?.newFiles)}
              <section>
                <h3>Who has read them</h3>
                <p class="hint">Everyone in the space, and which {savedVersion !== null ? 'published' : 'new'} files each still has to read. Needs read-write access to the space.</p>
                {#if readersError}<p class="problem">{readersError}</p>{/if}
                {#if readers}
                  {#if !readerColumns.length}
                    <p class="hint">{savedVersion !== null ? 'No published files to read yet.' : 'No new files to read yet.'}</p>
                  {:else}
                    <table class="readers">
                      <tbody>
                        {#each readers.people as person (person.name)}
                          {@const missing = readerColumns.filter(f => person.files[f.i]?.status !== 'read')}
                          <tr>
                            <th>{person.name}</th>
                            <td>
                              {#if !missing.length}
                                <span class="all-read">All read</span>
                              {:else}
                                {#each missing as f (f.id)}
                                  {@const st = person.files[f.i]}
                                  <span class="to-read" title={st?.acknowledged ? `Read version ${st.acknowledged.version} on ${formatWhen(st.acknowledged.timestamp)}` : 'Not read yet'}>{f.path.slice(folder.length)}{st?.status === 'older' ? ' (read an older version)' : ''}</span>
                                {/each}
                              {/if}
                            </td>
                          </tr>
                        {/each}
                      </tbody>
                    </table>
                  {/if}
                {/if}
                <button class="small" disabled={readersLoading} onclick={() => void loadReaders()}>{readersLoading ? 'Asking Metatrash…' : readers ? 'Refresh' : 'Show Who Has Read Them'}</button>
              </section>
            {/if}

          {:else if page === 'automation'}
            <section>
              <h3>Actions{@render lockMark(['actions', 'services'])}</h3>
              <p class="hint">What happens in this folder by itself. <b>Receive email</b> gives the folder an address, and each message becomes a Markdown file here. <b>Run an agent</b> starts an agent when files arrive, email included, or on a schedule; it sees only this folder and those inside it, notes each job in <code>{RUNNER_LOG}</code>, and runs on an agent from <button class="link" onclick={openAgentsSettings}>Settings → Services → Agents</button>.</p>
              {#if !ownedSpace}
                <div class="card"><p class="hint">Actions run only in your own spaces, the ones under your name on {space.server.replace(/^https?:\/\//, '')}, not in the public space.</p></div>
              {:else}
                {#if !owning}
                  <p class="note">You're a member of this space. Agent actions you add are your own: they run on your agent and only for files you bring. The owner's and other members' actions are shown, but only they can change them.</p>
                {/if}

                {#each form.emails as email, i (i)}
                  {@const key = `email-${i}`}
                  {@const isOpen = openItem === key}
                  {@const saved = savedEmailOf(email)}
                  {@const savedName = saved ? saved.name : null}
                  {@const address = savedName !== null ? emailAddresses[savedName] : ''}
                  {@const canChange = !disabled('services') && !emailWhy}
                  {@const createError = emailCreateErrors.get(email) ?? ''}
                  <div class="action" class:open={isOpen} class:drop={dropAt === key}
                    ondragover={event => { if (dragging?.kind === 'email') { event.preventDefault(); dropAt = key; } }}
                    ondragleave={() => { if (dropAt === key) dropAt = null; }}
                    ondrop={event => { event.preventDefault(); onDrop('email', i); }}>
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div class="action-head" draggable={canChange && form.emails.length > 1}
                      ondragstart={event => { dragging = { kind: 'email', from: i }; event.dataTransfer?.setData('text/plain', key); }}
                      ondragend={() => { dragging = null; dropAt = null; }}>
                      {#if canChange && form.emails.length > 1}<span class="grip" title="Drag to reorder" aria-hidden="true">⠿</span>{/if}
                      <button class="action-toggle" aria-expanded={isOpen} onclick={() => { openItem = isOpen ? null : key; confirmRemove = null; }}>
                        <span class="chevron" aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
                        <span class="kind-icon" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M2 3.5h12a.5.5 0 0 1 .5.5v8a.5.5 0 0 1-.5.5H2a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5zM1.8 4l6.2 5 6.2-5" /></svg></span>
                        <span class="action-text">
                          <span class="action-name">Receive email{#if email.name.trim()}<span class="tag">{email.name.trim()}</span>{/if}{#if !saved}<span class="tag new">New</span>{/if}</span>
                          <span class="hint">{address || (saved ? 'Its own address' : 'Saving creates its address')}</span>
                        </span>
                      </button>
                      {#if canChange && confirmRemove !== key}
                        <button class="remove" aria-label="Delete this Receive email action" title="Delete this action" onclick={() => (confirmRemove = key)}>{@render binIcon()}</button>
                      {/if}
                    </div>
                    {#if confirmRemove === key}
                      <div class="confirm-remove">
                        <span>Delete this action?{saved ? ' Its address stops working when you save, and mail sent to it is refused.' : ''}</span>
                        <button class="small" onclick={() => (confirmRemove = null)}>Keep It</button>
                        <button class="small danger" onclick={() => removeEmail(i)}>Delete</button>
                      </div>
                    {/if}
                    {#if isOpen}
                      <fieldset class="action-body" disabled={!canChange}>
                        {#if emailWhy}<p class="hint">{emailWhy}</p>{/if}
                        <label class="field">
                          <span>Name</span>
                          <input bind:value={email.name} spellcheck="false" maxlength="40" placeholder={form.emails.length > 1 ? 'alerts' : 'Optional while it is the only one'} />
                          <span class="hint">Tells this folder's addresses apart: lowercase letters, digits and hyphens.{#if saved && email.name.trim() !== saved.name} <b>Renaming gives it a new address</b>, and the current one stops working when you save.{/if}</span>
                        </label>
                        <div class="card mail-card">
                          {#if emailCreating === email}
                            <p class="hint">Creating the address…</p>
                          {:else if !saved && emailNow}
                            <p class="hint">{createError ? `The address couldn't be created: ${createError}` : 'This action has no address yet.'}</p>
                            <div class="buttons"><button class="small" onclick={() => void saveEmailNow(email)}>Create the Address</button></div>
                          {:else if !saved}
                            <p class="hint">Save, and once Metatrash Sync has sent the change, <button class="link" onclick={() => void backend.opener.url(emailAddressPage(email.name.trim()))}>open the address on the website</button>, signed in as the space's owner.</p>
                          {:else if email.address !== saved.address}
                            <p class="hint"><b>A new address retires the current one:</b> mail sent to it is refused from then on.{emailNow ? '' : ' The change takes effect when you save.'}</p>
                            {#if createError}<p class="hint">The new address couldn't be created: {createError}</p>{/if}
                            <div class="buttons">
                              {#if emailNow}<button class="small" onclick={() => void saveEmailNow(email)}>Retire It and Create the New Address</button>{/if}
                              <button class="small" onclick={() => { email.address = saved.address; setCreateError(email, ''); }}>Keep the Current Address</button>
                            </div>
                          {:else}
                            {#if address}
                              <p class="mail-address"><code>{address}</code> <button class="small" onclick={() => void copyEmailAddress(address)}>{emailCopied === address ? 'Copied' : 'Copy'}</button></p>
                              <p class="hint">Anyone who has this address can send to the folder unless you list allowed senders below, so share it only where it's needed. Anything after a + is ignored, so you can tag where you gave it out (…+aws@…).</p>
                            {:else if emailAddressLoading[saved.name]}
                              <p class="hint">Getting the address…</p>
                            {:else if backend.sync.emailAddress}
                              <p class="hint">The address couldn't be fetched{emailAddressErrors[saved.name] ? `: ${emailAddressErrors[saved.name]}` : '.'} Only the space's owner sees it. <button class="link" onclick={() => void loadEmailAddress(saved.name)}>Try again</button></p>
                            {:else}
                              <p class="hint">Slate Viewer can't show the address yet. <button class="link" onclick={() => void backend.opener.url(emailAddressPage(saved.name))}>Open it on the website</button>, signed in as the space's owner.</p>
                            {/if}
                            <div class="buttons"><button class="small" onclick={() => newEmailAddress(email)}>Get a New Address</button></div>
                          {/if}
                        </div>
                        <h4>Who can send</h4>
                        <p class="hint">One sender per line: an address (alerts@example.com), a domain (example.com) or a domain and its subdomains (*.example.com). With no allowed senders, anyone can send. Blocked senders are always refused, and an allowed sender whose mail fails its domain's DMARC check is refused as forged.</p>
                        <div class="mail-rules">
                          <label><span>Allowed senders</span><textarea rows="4" bind:value={email.allow} placeholder="alerts@example.com" spellcheck="false"></textarea></label>
                          <label><span>Blocked senders</span><textarea rows="4" bind:value={email.block} spellcheck="false"></textarea></label>
                        </div>
                        <h4>Replies</h4>
                        <div class="choice">
                          <label>
                            <input type="radio" name="mail-history-{i}" checked={email.history === 'strip'} onchange={() => (email.history = 'strip')} />
                            <span><b>Leave out what they quote</b> <span class="hint">When the earlier message is already in the space, the reply's file links to it and keeps only the new text. The default.</span></span>
                          </label>
                          <label>
                            <input type="radio" name="mail-history-{i}" checked={email.history === 'keep'} onchange={() => (email.history = 'keep')} />
                            <span><b>Keep the whole message</b> <span class="hint">Replies keep the earlier messages they quote.</span></span>
                          </label>
                        </div>
                        <p class="hint small-print">Everything in an email was written by whoever sent it, so give agent actions that read email only the tools they need. The original message is kept beside each file. A message can bring up to 25 MB of attachments, and a folder takes up to 200 messages an hour.</p>
                      </fieldset>
                    {/if}
                  </div>
                {/each}

                {#each form.actions as action, i (i)}
                  {@const editable = canEditAction(action)}
                  {@const key = `action-${i}`}
                  {@const isOpen = openItem === key}
                  {@const canDrag = owning && !readOnlySpace && !frozen.has('actions') && form.actions.length > 1}
                  <div class="action" class:open={isOpen} class:drop={dropAt === key}
                    ondragover={event => { if (dragging?.kind === 'action') { event.preventDefault(); dropAt = key; } }}
                    ondragleave={() => { if (dropAt === key) dropAt = null; }}
                    ondrop={event => { event.preventDefault(); onDrop('action', i); }}>
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div class="action-head" draggable={canDrag}
                      ondragstart={event => { dragging = { kind: 'action', from: i }; event.dataTransfer?.setData('text/plain', key); }}
                      ondragend={() => { dragging = null; dropAt = null; }}>
                      {#if canDrag}<span class="grip" title="Drag to reorder" aria-hidden="true">⠿</span>{/if}
                      <button class="action-toggle" aria-expanded={isOpen} onclick={() => { openItem = isOpen ? null : key; confirmRemove = null; }}>
                        <span class="chevron" aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
                        <span class="kind-icon" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M8 1.5v2M4.5 4.5h7a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 11V6a1.5 1.5 0 0 1 1.5-1.5zM6 8h.01M10 8h.01M6.5 10.5h3M1.5 7.5v2M14.5 7.5v2" /></svg></span>
                        <span class="action-text">
                          <span class="action-name">{action.name.trim() || 'Unnamed action'}{#if !action.raw}<span class="tag new">New</span>{/if}{#if action.member}<span class="tag">{action.member === writer.account ? 'Yours' : `${action.member}'s`}</span>{/if}</span>
                          <span class="hint">Run an agent · {describeTrigger(action)} · {agentLabel(action)}</span>
                        </span>
                      </button>
                      {#if canRemoveAction(action) && confirmRemove !== key}
                        <button class="remove" aria-label="Delete {action.name}" title="Delete this action" onclick={() => (confirmRemove = key)}>{@render binIcon()}</button>
                      {/if}
                    </div>
                    {#if confirmRemove === key}
                      <div class="confirm-remove">
                        <span>Delete {action.name.trim() || 'this action'}?{action.raw ? ' It stops running when you save.' : ''}</span>
                        <button class="small" onclick={() => (confirmRemove = null)}>Keep It</button>
                        <button class="small danger" onclick={() => removeAction(i)}>Delete</button>
                      </div>
                    {/if}

                    {#if isOpen && owning && action.member}
                      <div class="card adopt">
                        <p class="hint">This is {action.member}'s own action: it runs on their agent, only for files they bring, so you can't change it. You can remove it, or adopt it to run it for everyone's files on your agent.</p>
                        <button class="small" disabled={readOnlySpace || frozen.has('actions')} onclick={() => (action.member = '')}>Adopt It</button>
                      </div>
                    {/if}
                    {#if isOpen}
                      <fieldset class="action-body" disabled={!editable}>
                        <label class="field">
                          <span>Name</span>
                          <input bind:value={action.name} spellcheck="false" maxlength="40" placeholder="tidy-draft" />
                          <span class="hint">Lowercase letters, digits and hyphens. {RUNNER_LOG} and notice emails use it.{' '}{#if action.raw && savedActionNames.has(action.raw.name as string) && action.name !== action.raw.name} Renaming starts it afresh: its schedule and anyone who agreed to pay for it start over.{/if}</span>
                        </label>

                        <h4>When it runs</h4>
                        <div class="choice">
                          <label><input type="radio" name="trigger-{i}" checked={action.trigger === 'files'} onchange={() => setTrigger(action, 'files')} /> <span><b>When files arrive</b> <span class="hint">A job for each file that is added or moved in, matching the patterns below.</span></span></label>
                          <label><input type="radio" name="trigger-{i}" checked={action.trigger === 'schedule'} onchange={() => setTrigger(action, 'schedule')} /> <span><b>On a schedule</b> <span class="hint">A job at set times, whatever has changed.</span></span></label>
                        </div>

                        {#if action.trigger === 'files'}
                          <datalist id="action-patterns">{#each patternSuggestions as p (p)}<option value={p}></option>{/each}</datalist>
                          {#each action.on as _, j (j)}
                            <div class="pair">
                              <input class="name wide" list="action-patterns" bind:value={action.on[j]} placeholder="inbound/*.md, *.pdf or inbound/" spellcheck="false" />
                              <button class="remove" aria-label="Remove" title="Remove" disabled={action.on.length === 1} onclick={() => action.on.splice(j, 1)}>×</button>
                            </div>
                          {/each}
                          <p class="matches">{matchNote(action)}</p>
                          <button class="small" onclick={() => action.on.push('')}>Add a Pattern</button>
                          <p class="hint small-print">A name or pattern relative to this folder (<code>*.md</code>, <code>inbound/*.pdf</code>), or a subfolder ending in <code>/</code> for every file in it. AGENTS.md, {SETTINGS_FILE} and {RUNNER_LOG} never start a job.</p>
                          <label class="check">
                            <input type="checkbox" checked={action.when === 'change'} onchange={event => setChange(action, event.currentTarget.checked)} />
                            <span>Also when a matching file is edited <span class="hint">Every saved change starts a job, so keep the instructions from editing the file it works on.</span></span>
                          </label>
                        {:else}
                          {@const sched = parseSchedule(action.every)}
                          {#if sched}
                            <div class="schedule">
                              <select value={sched.kind} onchange={event => setSchedule(action, { kind: event.currentTarget.value as ScheduleKind })}>
                                <option value="hour">Every hour</option>
                                <option value="day">Every day</option>
                                <option value="weekday">Every weekday (Mon to Fri)</option>
                                <option value="week">Once a week</option>
                                <option value="month">Once a month</option>
                              </select>
                              {#if sched.kind === 'week'}
                                <select value={sched.weekday} onchange={event => setSchedule(action, { weekday: event.currentTarget.value })}>
                                  {#each WEEKDAYS as d (d)}<option value={d}>on {d.charAt(0).toUpperCase() + d.slice(1)}</option>{/each}
                                </select>
                              {:else if sched.kind === 'month'}
                                <select value={sched.monthDay} onchange={event => setSchedule(action, { monthDay: Number(event.currentTarget.value) })}>
                                  {#each Array.from({ length: 28 }, (_, d) => d + 1) as d (d)}<option value={d}>on day {d}</option>{/each}
                                </select>
                              {/if}
                              {#if sched.kind === 'hour'}
                                <select value={sched.minute} onchange={event => setSchedule(action, { minute: Number(event.currentTarget.value) })}>
                                  {#each Array.from({ length: 12 }, (_, m) => m * 5) as m (m)}<option value={m}>{m === 0 ? 'on the hour' : `at ${String(m).padStart(2, '0')} past`}</option>{/each}
                                  {#if sched.minute % 5}<option value={sched.minute}>at {String(sched.minute).padStart(2, '0')} past</option>{/if}
                                </select>
                              {:else}
                                <span>at</span>
                                <input type="time" value={clock(sched)} onchange={event => setTime(action, event.currentTarget.value)} />
                              {/if}
                            </div>
                            <p class="matches">{describeSchedule(action.every)}, in the space's time zone (set under Settings → Spaces).</p>
                          {:else}
                            <input class="address" bind:value={action.every} spellcheck="false" />
                            <p class="matches">Metatrash doesn't understand this schedule. <button class="link" onclick={() => (action.every = 'day 06:00')}>Start from every day at 06:00</button></p>
                          {/if}
                        {/if}

                        <h4>What to do</h4>
                        <div class="choice row">
                          <label><input type="radio" name="do-{i}" checked={action.doMode === 'text'} onchange={() => (action.doMode = 'text')} /> Instructions written here</label>
                          <label><input type="radio" name="do-{i}" checked={action.doMode === 'file'} onchange={() => { action.doMode = 'file'; if (!action.doFile && instructionFiles.length) action.doFile = instructionFiles[0]; }} /> Instructions kept in a file</label>
                        </div>
                        {#if action.doMode === 'text'}
                          <textarea rows="5" bind:value={action.doText} placeholder={action.trigger === 'files' ? 'For example: Rewrite this draft in plain English, keep its headings, save it in completed/ with the same name, then delete the draft.' : 'For example: Search the web for this week\'s news about our industry and write a one-page summary in news/ named by today\'s date.'}></textarea>
                          <p class="meta"><span>Write it as you would brief a colleague: what to do{action.trigger === 'files' ? ' with the file' : ''}, where results go, and when to stop.</span><span class="grow"></span><span class:over={[...action.doText].length > MAX_DO}>{[...action.doText].length} / {MAX_DO}</span></p>
                        {:else}
                          <select class="address" bind:value={action.doFile}>
                            {#if !instructionFiles.includes(action.doFile)}<option value={action.doFile}>{action.doFile || 'Choose a file'}</option>{/if}
                            {#each instructionFiles as f (f)}<option value={f}>{f}</option>{/each}
                          </select>
                          <p class="hint small-print">A Markdown file in this folder holds longer instructions; editing it changes what the next job does.{#if action.doFile && !instructionFiles.includes(action.doFile)} This file isn't in the folder yet.{/if}</p>
                        {/if}

                        <h4>Agent</h4>
                        {#if typedModel.has(i)}
                          <div class="pair">
                            <input class="name wide" bind:value={action.model} placeholder="provider/model, such as minimax/MiniMax-M3" spellcheck="false" />
                            <button class="small" onclick={() => { typedModel = new Set([...typedModel].filter(x => x !== i)); }}>Pick from List</button>
                          </div>
                        {:else}
                          <select class="address" value={action.model} onchange={event => setModel(i, action, event.currentTarget.value)}>
                            <option value="">{action.member ? `${action.member}'s default agent` : owning ? `Your default agent${defaultAgent ? ` (${defaultAgent.name})` : ''}` : 'The owner\'s default agent'}</option>
                            {#each modelChoices as c (c.value)}<option value={c.value}>{c.label}</option>{/each}
                            {#if action.model && !modelChoices.some(c => c.value === action.model)}<option value={action.model}>{action.model}</option>{/if}
                            <option value={'\u0000other'}>Another model…</option>
                          </select>
                        {/if}
                        <p class="hint small-print">A model picks which of the payer's agents runs the job, by its provider and model; the default agent is used when none is chosen. {#if capabilities.kind === 'web' && !myAgents.length && ownedSpace}You have no agents yet: <button class="link" onclick={openAgentsSettings}>add one</button> with your provider's API key.{/if}</p>

                        {#if !action.member}
                          <h4>Who pays</h4>
                          {#if action.trigger === 'schedule'}
                            <p class="hint">The space owner pays for scheduled jobs.</p>
                          {:else}
                            <div class="choice">
                              <label><input type="radio" name="pays-{i}" checked={action.pays !== 'contributor'} onchange={() => setPays(action, false)} /> <span><b>The space owner</b> <span class="hint">Every file's job runs on the owner's agent.</span></span></label>
                              <label><input type="radio" name="pays-{i}" checked={action.pays === 'contributor'} disabled={!action.model} onchange={() => setPays(action, true)} /> <span><b>Whoever brings the file</b> <span class="hint">Each person pays for the files they add, once they agree: Metatrash emails them a link to choose their agent, and holds their files until then. Needs a model above.</span></span></label>
                            </div>
                          {/if}
                        {/if}

                        <details class="advanced">
                          <summary>Limits and tools</summary>
                          <label class="field">
                            <span>Most tool calls per job</span>
                            <input type="number" min="1" max="200" value={action.steps ?? ''} placeholder={String(DEFAULT_STEPS)} oninput={event => { const v = event.currentTarget.value; action.steps = v === '' ? null : Number(v); }} />
                            <span class="hint">Stops a job that goes round in circles. Empty is {DEFAULT_STEPS}; up to 200.</span>
                          </label>
                          <label class="check">
                            <input type="checkbox" checked={action.agentsMd} onchange={event => (action.agentsMd = event.currentTarget.checked)} />
                            <span>Give the agent this folder's AGENTS.md <span class="hint">It is written for general work here, so a job with set instructions does without it unless it helps. It can still read it.</span></span>
                          </label>
                          <label class="check">
                            <input type="checkbox" checked={action.web !== false} onchange={event => setWeb(action, event.currentTarget.checked)} />
                            <span>Allow the web tools <span class="hint">Search the web and read pages it found; copies are kept for 29 days.</span></span>
                          </label>
                          <h4>Tools</h4>
                          <div class="choice row">
                            <label><input type="radio" name="tools-{i}" checked={!choosingTools(i, action)} onchange={() => { onlyTools = new Set([...onlyTools].filter(n => n !== i)); action.tools = sendsForms(action) ? [...TOOLS.map(t => t.name), SUBMIT_TOOL] : null; }} /> All tools</label>
                            <label><input type="radio" name="tools-{i}" checked={choosingTools(i, action)} onchange={() => { onlyTools = new Set([...onlyTools, i]); action.tools = [...TOOLS.map(t => t.name), ...(sendsForms(action) ? [SUBMIT_TOOL] : [])]; }} /> Only these</label>
                          </div>
                          {#if action.tools !== null && choosingTools(i, action)}
                            <div class="tools">
                              {#each TOOLS as t (t.name)}
                                <label class:off={action.web === false && t.name.startsWith('web_')}><input type="checkbox" checked={action.tools.includes(t.name)} onchange={event => setTools(action, t.name, event.currentTarget.checked)} /> {t.title}</label>
                              {/each}
                            </div>
                            <p class="hint small-print">Fewer tools cost fewer tokens per step. Leave out Write, Move and Delete for an agent that should only read and report.</p>
                          {/if}
                          <label class="check">
                            <input type="checkbox" checked={sendsForms(action)} onchange={event => setSendsForms(action, event.currentTarget.checked)} />
                            <span>Let it send forms in this folder <span class="hint">The agent fills in and sends forms here as the person who pays for the job; the form decides where its copy goes, and the copy says an agent sent it. It can't sign, and the folder's Fill in forms and Take quizzes locks apply (Security page).</span></span>
                          </label>
                        </details>
                      </fieldset>
                      {#if canRunAgain(action)}
                        {@const r = rerun?.key === key ? rerun : null}
                        <div class="card rerun">
                          {#if r?.preview}
                            {@const p = r.preview}
                            <p>Run {action.name} again on {fileCount(p.files)} ({p.sample.join(', ')}{p.files > p.sample.length ? ', …' : ''})? {p.payer === 'you' ? 'It runs on your' : `It runs on ${p.payer}'s`} {p.model === 'the default agent' ? 'default agent' : `${p.model} agent`}, one job per file, and each job uses tokens as a new file would.</p>
                            <div class="buttons">
                              <button class="small" disabled={r.busy} onclick={() => (rerun = null)}>Cancel</button>
                              <button class="small primary" disabled={r.busy} onclick={() => void askRerun(key, action, true)}>Run on {fileCount(p.files)}</button>
                            </div>
                          {:else}
                            <p class="hint">Runs this action once more on every file it covers now, such as after you change its instructions. Up to 100 files, outside the folder's limit of 20 jobs an hour; you see how many and who pays first.</p>
                            <button class="small" disabled={r?.busy} onclick={() => void askRerun(key, action, false)}>Run Again on All Files…</button>
                            {#if r?.queued}<p class="ok">Queued {fileCount(r.queued)}. Each result is added to {RUNNER_LOG} as it finishes.</p>{/if}
                            {#if r?.error}<p class="error">{r.error}</p>{/if}
                          {/if}
                        </div>
                      {/if}
                    {/if}
                  </div>
                {/each}

                <div class="buttons">
                  <select class="add-action" aria-label="Add an action" bind:value={addKind} onchange={() => addItem(addKind)} disabled={readOnlySpace || (frozen.has('actions') && frozen.has('services'))}>
                    <option value="" disabled>Add Action…</option>
                    <option value="email" disabled={disabled('services') || !!emailWhy || form.emails.length >= MAX_EMAILS || !!emailCreating}>Receive email</option>
                    <option value="agent" disabled={frozen.has('actions') || form.actions.length >= 20 || (!owning && !writer.account)}>Run an agent</option>
                  </select>
                  {#if runnerLog}<button class="small" onclick={() => { onOpenFile(runnerLog!); onClose(); }}>Open the Run Log</button>{/if}
                </div>
                {#if !form.actions.length && !form.emails.length}
                  <p class="hint small-print">No actions here yet. Saving writes them to {SETTINGS_FILE}; a subfolder never runs this folder's actions.</p>
                {:else if form.actions.length > 1 || form.emails.length > 1}
                  <p class="hint small-print">Drag an action by its handle to reorder it among those of its kind. Order doesn't change what runs yet.</p>
                {/if}
              {/if}
            </section>

            <section>
              <div class="card">
                <p class="hint"><b>Also automatic in this folder</b></p>
                <ul class="levels">
                  <li>Every folder gets an AGENTS.md and a {SETTINGS_FILE} when it gets its first file, and loses them with its last one.</li>
                  {#if capabilities.kind === 'desktop'}<li>Metatrash Sync keeps this folder and the space in step, both ways.</li>{/if}
                  {#if form.publishedVersion !== null}<li>Version {form.publishedVersion} of this folder's files is what people open by default{form.acknowledge ? ', and everyone is asked to confirm they read it' : ''} (Publishing).</li>{/if}
                  {#if form.github}<li>Pushing to GitHub: {PUSH_MODES.find(m => m.mode === (form!.github!.push || 'agent'))!.title.toLowerCase()} (Connections).</li>{/if}
                </ul>
              </div>
            </section>

          {:else}
            <section>
              <h3>{ownPath}</h3>
              <p class="hint">The settings are kept in this file, which Metatrash Sync sends to the space. This is what Save writes{changed ? '' : ' (nothing has changed yet)'}.</p>
              <pre>{outputText}</pre>
              {#if !isRoot && form.inherit}
                <h4>What the folder sees, with its parent's settings</h4>
                <pre>{effectiveAfter}</pre>
              {/if}
              <button class="small" onclick={() => { onOpenFile(ownPath); onClose(); }}>Open as Text</button>
            </section>
          {/if}
        </div>
      </div>

      <footer>
        {#if confirmDiscard}
          <span class="grow">Discard your changes to these settings?</span>
          <button onclick={() => (confirmDiscard = false)}>Keep Editing</button>
          <button class="primary" onclick={onClose}>Discard</button>
        {:else}
          <span class="grow footer-note" class:error={!!saveError || !!footerProblem}>{saveError || footerProblem || (changed ? (capabilities.kind === 'web' ? 'Save writes the settings to the space.' : 'Save writes the settings; Metatrash Sync sends them to the space.') : '')}</span>
          <button onclick={close}>{readOnlySpace ? 'Close' : 'Cancel'}</button>
          {#if !readOnlySpace}
            <button class="primary" disabled={!changed || problems.length > 0 || saving} title="Save (Ctrl+Enter)" onclick={() => void save()}>{saving ? 'Saving…' : 'Save'}</button>
          {/if}
        {/if}
      </footer>
    {/if}
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; z-index: 2500; background: rgb(0 0 0 / .22); display: grid; place-items: start center; }
  .panel {
    display: flex; flex-direction: column;
    width: min(780px, calc(100% - 32px)); height: min(640px, calc(100% - 80px)); margin-top: 40px; box-sizing: border-box;
    background: var(--side-input); color: var(--side-fg);
    border: 1px solid var(--side-border); border-radius: 10px; box-shadow: 0 16px 50px rgb(0 0 0 / .28);
    font: 13px/1.45 Inter, "Segoe UI", system-ui, sans-serif; overflow: hidden;
  }
  header { display: flex; align-items: center; gap: 12px; padding: 14px 16px 12px 20px; border-bottom: 1px solid var(--side-border); }
  .heading { flex: 1; min-width: 0; }
  h2 { margin: 0; font-size: 16px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  h2 .muted { font-weight: 400; }
  header p { margin: 0; }
  .folder-icon { width: 26px; height: 26px; fill: var(--side-accent-soft); stroke: var(--side-accent); stroke-width: 1; }
  .close { font-size: 20px; line-height: 1; padding: 2px 8px; color: var(--side-muted); background: none; border: 0; border-radius: 5px; cursor: pointer; }
  .close:hover { background: var(--side-hover); color: var(--side-fg); }
  .body-message { padding: 20px; }
  .main { flex: 1; display: flex; min-height: 0; }
  nav { width: 180px; flex: none; padding: 10px 8px; border-right: 1px solid var(--side-border); background: var(--side-bg); overflow: auto; }
  nav button {
    display: block; width: 100%; padding: 7px 10px; margin-bottom: 2px; text-align: left;
    font: inherit; color: inherit; background: none; border: 0; border-radius: 6px; cursor: pointer;
  }
  nav button:hover { background: var(--side-hover); }
  nav button.active { background: var(--side-accent-soft); color: var(--side-accent); }
  .nav-title { display: block; font-weight: 600; }
  .nav-about { display: block; font-size: 11px; color: var(--side-muted); }
  .dot { margin-left: 6px; font-size: 9px; color: #c0392b; vertical-align: middle; }
  .content { flex: 1; min-width: 0; overflow: auto; padding: 14px 20px 18px; }
  .help {
    float: right; position: sticky; top: 0; z-index: 1; margin: 0 0 6px 10px;
    width: 22px; height: 22px; padding: 0; border-radius: 50%; border: 1px solid var(--side-border);
    font: inherit; font-size: 12px; font-weight: 700; line-height: 20px; text-align: center;
    color: var(--side-muted); background: var(--side-bg); cursor: pointer;
  }
  .help:hover, .help:focus-visible { color: var(--side-accent); border-color: var(--side-accent); }
  section { margin-bottom: 18px; }
  h3 { margin: 0 0 4px; font-size: 13px; }
  h4 { margin: 14px 0 4px; font-size: 12px; }
  p { margin: 0 0 8px; }
  .muted { color: var(--side-muted); }
  .hint { display: block; color: var(--side-muted); font-weight: 400; }
  .small-print { font-size: 12px; margin-top: 8px; }
  .note { padding: 8px 10px; border-radius: 6px; background: var(--side-accent-soft); }
  .problem { padding: 7px 10px; border-radius: 6px; color: #8f2318; background: #fbe4e1; }
  :global([data-theme="dark"]) .problem { color: #ffb4a8; background: #4a2420; }
  h3 { display: flex; align-items: center; gap: 6px; }
  .lock-mark { display: inline-flex; margin-left: auto; padding: 2px; color: var(--side-accent); cursor: help; }
  .lock-mark svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linejoin: round; }
  .check .lock-mark { margin-left: 6px; vertical-align: -2px; }
  .error { color: #c0392b; }
  .card { padding: 10px 12px; border: 1px solid var(--side-border); border-radius: 8px; background: var(--side-bg); }
  .card p:last-child { margin-bottom: 0; }
  .excerpt { padding-left: 10px; border-left: 3px solid var(--side-border); font-style: italic; }
  code { font-size: 12px; padding: 1px 4px; border-radius: 3px; background: var(--side-hover); }
  pre {
    margin: 0 0 10px; padding: 10px 12px; max-height: 240px; overflow: auto; font-size: 12px;
    background: var(--side-bg); border: 1px solid var(--side-border); border-radius: 6px;
  }
  input:not([type]), textarea, select {
    box-sizing: border-box; padding: 6px 8px; font: inherit; color: inherit;
    background: var(--side-bg); border: 1px solid var(--side-border); border-radius: 6px; outline: none;
  }
  input:not([type]):focus, textarea:focus, select:focus { border-color: var(--side-accent); }
  input:disabled, textarea:disabled, select:disabled { opacity: .6; }
  textarea { width: 100%; resize: vertical; }
  .meta { display: flex; gap: 8px; font-size: 11px; color: var(--side-muted); }
  .meta .over { color: #c0392b; }
  .grow { flex: 1; }
  .pair { display: flex; gap: 6px; margin-bottom: 6px; align-items: center; }
  .pair .name { width: 170px; }
  .pair .name.wide { flex: 1; }
  .address { width: 100%; box-sizing: border-box; }
  .matches { margin: -3px 0 8px; font-size: 11px; color: var(--side-muted); }
  .check { display: flex; gap: 10px; align-items: flex-start; cursor: pointer; }
  .check input { margin-top: 3px; }
  .choice { display: flex; flex-direction: column; gap: 6px; margin: 6px 0 10px; }
  .choice label { display: flex; gap: 8px; align-items: flex-start; cursor: pointer; }
  .choice input { margin-top: 3px; }
  .fields { display: grid; grid-template-columns: 2fr 1fr; gap: 10px; margin: 10px 0 4px; }
  .fields label { display: flex; flex-direction: column; gap: 3px; font-weight: 600; font-size: 12px; }
  .fields input { font-weight: 400; }
  table.locks { width: 100%; border-collapse: collapse; margin: 6px 0 8px; }
  .locks th, .locks td { padding: 6px 4px; border-top: 1px solid var(--side-border); text-align: left; vertical-align: top; }
  .locks th { font-weight: 600; }
  .locks th .hint { font-size: 11px; }
  .locks td { width: 220px; }
  .locks select { width: 100%; }
  .fixed { display: inline-block; padding-top: 6px; color: var(--side-muted); }
  .levels { margin: 4px 0 8px; padding-left: 18px; color: var(--side-muted); }
  .version { margin-top: 8px; }
  table.readers { width: 100%; border-collapse: collapse; margin: 6px 0 10px; }
  .readers th, .readers td { padding: 5px 4px; border-top: 1px solid var(--side-border); text-align: left; vertical-align: top; }
  .readers th { width: 160px; font-weight: 600; }
  .readers .to-read { display: inline-block; margin: 0 6px 2px 0; padding: 0 6px; border-radius: 9px; font-size: 12px; color: #8f2318; background: #fbe4e1; }
  :global([data-theme="dark"]) .readers .to-read { color: #ffb4a8; background: #4a2420; }
  .readers .all-read { color: var(--side-muted); }
  .levels li { margin-bottom: 3px; }
  footer { display: flex; gap: 8px; align-items: center; padding: 10px 16px 12px 20px; border-top: 1px solid var(--side-border); }
  .footer-note { font-size: 12px; color: var(--side-muted); }
  .footer-note.error { color: #c0392b; }
  button.small, footer button, .buttons button {
    padding: 5px 12px; font: inherit; color: inherit; background: var(--side-bg);
    border: 1px solid var(--side-border); border-radius: 6px; cursor: pointer;
  }
  footer button, .buttons button { padding: 6px 14px; }
  button.small:hover:not(:disabled), footer button:hover:not(:disabled), .buttons button:hover { background: var(--side-hover); }
  button.primary { color: #fff; background: var(--side-accent); border-color: var(--side-accent); }
  :global([data-theme="dark"]) button.primary { color: #1d1a22; }
  footer button.primary:hover:not(:disabled) { background: var(--side-accent); filter: brightness(1.08); }
  button:disabled { opacity: .5; cursor: default; }
  .remove { padding: 2px 8px; font-size: 16px; line-height: 1; color: var(--side-muted); background: none; border: 0; border-radius: 5px; cursor: pointer; }
  .remove:hover:not(:disabled) { background: var(--side-hover); color: var(--side-fg); }
  .buttons { display: flex; gap: 8px; align-items: center; margin-top: 10px; }
  .mail-address { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .mail-address code { user-select: all; overflow-wrap: anywhere; }
  .mail-rules { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .mail-rules label { display: flex; flex-direction: column; gap: 4px; }
  @media (max-width: 560px) { .mail-rules { grid-template-columns: 1fr; } }
  .link { padding: 0; font: inherit; color: var(--side-accent); background: none; border: 0; text-decoration: underline; cursor: pointer; }
  .action { margin-bottom: 8px; border: 1px solid var(--side-border); border-radius: 8px; background: var(--side-bg); }
  .action.open { border-color: var(--side-accent); }
  .action-head { display: flex; align-items: center; gap: 4px; padding-right: 6px; }
  .action-toggle { flex: 1; min-width: 0; display: flex; gap: 8px; align-items: flex-start; padding: 8px 10px; text-align: left; font: inherit; color: inherit; background: none; border: 0; cursor: pointer; }
  .action-toggle:hover .action-name { color: var(--side-accent); }
  .chevron { width: 10px; color: var(--side-muted); }
  .action-text { min-width: 0; }
  .action-text .hint { font-size: 12px; overflow-wrap: anywhere; }
  .action-name { font-weight: 600; }
  .tag { margin-left: 8px; padding: 0 6px; border-radius: 9px; font-size: 11px; font-weight: 500; color: var(--side-accent); background: var(--side-accent-soft); }
  .tag.new { color: var(--side-muted); background: var(--side-hover); }
  .grip { flex: none; padding: 0 0 0 8px; color: var(--side-muted); cursor: grab; user-select: none; }
  .action-head[draggable="true"] { cursor: grab; }
  .action.drop { border-color: var(--side-accent); box-shadow: 0 -2px 0 var(--side-accent); }
  .kind-icon { display: inline-flex; padding-top: 2px; }
  .kind-icon svg { width: 15px; height: 15px; fill: none; stroke: var(--side-muted); stroke-width: 1.2; stroke-linecap: round; stroke-linejoin: round; }
  .bin { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.3; stroke-linecap: round; stroke-linejoin: round; vertical-align: -2px; }
  .remove:has(.bin):hover:not(:disabled) { color: #c0392b; }
  .confirm-remove { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 0 10px 8px 28px; padding: 7px 10px; border-radius: 6px; color: #8f2318; background: #fbe4e1; }
  :global([data-theme="dark"]) .confirm-remove { color: #ffb4a8; background: #4a2420; }
  .confirm-remove span { flex: 1; min-width: 180px; }
  button.small.danger { color: #fff; background: #c0392b; border-color: #c0392b; }
  .mail-card { margin-top: 10px; }
  select.add-action { padding: 5px 10px; cursor: pointer; }
  fieldset.action-body { margin: 0; padding: 4px 12px 12px 28px; border: 0; min-width: 0; }
  .card.adopt { margin: 0 12px 6px 28px; background: var(--side-input); }
  .card.rerun { margin: 8px 12px 10px 28px; }
  .card.rerun .buttons { margin-top: 6px; }
  .card.rerun .ok { color: #2e7d32; }
  .field { display: flex; flex-direction: column; gap: 3px; margin-top: 6px; font-weight: 600; font-size: 12px; }
  .field input { font-weight: 400; max-width: 260px; }
  .field .hint { font-size: 12px; }
  .choice.row { flex-direction: row; flex-wrap: wrap; gap: 16px; }
  .schedule { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 6px 0 8px; }
  input[type="time"], input[type="number"] {
    box-sizing: border-box; padding: 5px 8px; font: inherit; color: inherit;
    background: var(--side-bg); border: 1px solid var(--side-border); border-radius: 6px; outline: none;
  }
  .field input[type="number"] { width: 110px; }
  details.advanced { margin-top: 14px; }
  details.advanced summary { cursor: pointer; font-weight: 600; font-size: 12px; }
  .tools { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 4px 12px; margin: 4px 0 6px; }
  .tools label { display: flex; gap: 6px; align-items: center; cursor: pointer; }
  .tools label.off { opacity: .55; }
  @media (max-width: 620px) {
    .main { flex-direction: column; }
    nav { width: auto; display: flex; gap: 4px; overflow-x: auto; border-right: 0; border-bottom: 1px solid var(--side-border); }
    nav button { width: auto; flex: none; }
    .nav-about { display: none; }
    .fields { grid-template-columns: 1fr; }
  }
</style>
