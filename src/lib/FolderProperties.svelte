<script lang="ts">
  import { onMount } from 'svelte';
  import { backend, capabilities } from './backend';
  import { joinPath } from './paths';
  import { mtsync, type FolderDescription } from './space';
  import {
    DEFAULT_STEPS, MAX_DO, PROVIDERS, RUNNER_LOG, SUBMIT_TOOL, TOOLS, WEEKDAYS, allTools, sendsForms, setSendsForms, describeSchedule, describeTrigger, isOwner, matchingFiles, newAction,
    parseSchedule, scheduleText, type ActionForm, type ActionWriter, type Schedule, type ScheduleKind,
  } from './folderActions';
  import { account as siteAccount, type Agent } from './siteAccount';
  import {
    SETTINGS_FILE, LOCK_KEYS, LOCK_KEY_LABELS, MAX_FOOTER, check, defaultSettingsText, effectiveLocks, effectiveSettings, folderChain,
    footerFrom, frozenKeys, isLockLevel, lockedBy, parentFolder, parseObject, stableJson, toObject, toSavedVersion, toSettings, toText,
    type FolderSettings, type LockKey, type LockLevel, type Problem, type PushMode, type SpaceContext,
  } from './folderSettings';
  import { fetchReaders, type ReaderReport } from './policies';
  import { formatWhen } from './history';

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
    { id: 'automation', title: 'Automation', about: 'Agents that work here by themselves', help: 'automation.md' },
    { id: 'file', title: 'Settings File', about: SETTINGS_FILE, help: 'settings-file.md' },
  ];

  /** The Folder properties guides in the Metatrash docs: one page per page here. */
  const HELP_ROOT = 'https://metatrash.com/docs/guides/folder-properties/';

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
  let files = $state<string[]>([]);
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
        const listing = await backend.files.list(root, true).catch(() => null);
        files = listing?.files ?? [];
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
        agentsFile = files.find(f => f.toLowerCase() === (folder + 'agents.md').toLowerCase()) ?? null;
        if (agentsFile) {
          const text = await readText(agentsFile);
          agentsExcerpt = (text ?? '').split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#')).slice(0, 3).join(' ');
          if (agentsExcerpt.length > 280) agentsExcerpt = agentsExcerpt.slice(0, 280) + '…';
        }
      } finally {
        loading = false;
      }
    })();
  });

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
    form.acknowledge = on ? { files: [] } : null;
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
    if (!hits.length) return entry.endsWith('/') ? 'No files in a subfolder of that name yet.' : 'No file matches yet.';
    const shown = hits.slice(0, 3).map(h => h.slice(folder.length)).join(', ');
    return `Locks ${hits.length === 1 ? '' : `${hits.length} files: `}${shown}${hits.length > 3 ? ', …' : ''}`;
  }

  // ---- Automation (folder actions) ---------------------------------------------------------------

  const owning = $derived(isOwner(writer));
  /** The action whose details are open, by its place in the list. */
  let openAction = $state<number | null>(null);
  /** Actions whose model is typed rather than picked. */
  let typedModel = $state(new Set<number>());

  const savedActionNames = $derived(new Set(toSettings(original).actions.map(a => a.name)));
  const canEditAction = (a: ActionForm) => !readOnlySpace && !frozen.has('actions') && ownedSpace && (owning ? !a.member : a.member === writer.account);
  const canRemoveAction = (a: ActionForm) => !readOnlySpace && !frozen.has('actions') && (owning || a.member === writer.account);
  const runnerLog = $derived(files.includes(folder + RUNNER_LOG) ? folder + RUNNER_LOG : null);

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
    openAction = form.actions.length - 1;
  }

  function removeAction(i: number) {
    if (!form) return;
    form.actions.splice(i, 1);
    openAction = null;
    typedModel = new Set([...typedModel].filter(x => x !== i).map(x => (x > i ? x - 1 : x)));
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
    if (!hits.length) return 'No files here match yet. Only files that arrive after you save start a job.';
    const shown = hits.slice(0, 3).map(h => h.slice(folder.length)).join(', ');
    return `${hits.length === 1 ? 'One file matches' : `${hits.length} files match`} now (${shown}${hits.length > 3 ? ', …' : ''}). They don't start a job: only files that arrive after you save do.`;
  }

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
                    <b>Use the settings of {folderLabel(parentFolder(folder))}</b>
                    <span class="hint">This folder takes its parent's summary, descriptions and locks, except where it sets its own. Read-only files and connections always belong to one folder and are never passed down. New folders start this way.</span>
                  </span>
                </label>
                {#if lockNote('inherit')}<p class="lock-note">{lockNote('inherit')}</p>{/if}
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
              <h3>Summary</h3>
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
              {#if lockNote('purpose')}<p class="lock-note">{lockNote('purpose')}</p>{/if}
            </section>

            <section>
              <h3>Descriptions of what's inside</h3>
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
              {#if lockNote('children')}<p class="lock-note">{lockNote('children')}</p>{/if}
            </section>

          {:else if page === 'security'}
            <section class="card">
              <p class="hint"><b>People and agents.</b> A change you make here, in Files or through Metatrash Sync counts as a person's, and so does one by a member with write access. Everything else is an agent, of one of two kinds: <b>folder actions</b>, the agents on the Automation page, and <b>connected agents</b>, such as Claude and other AI apps, space keys and the public connection. Anything not locked can be changed by anyone with write access.</p>
            </section>

            <section>
              <h3>Read-only files</h3>
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
              {#if lockNote('readOnly')}<p class="lock-note">{lockNote('readOnly')}</p>{/if}
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
              <h3>GitHub repository</h3>
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
              {#if lockNote('services')}<p class="lock-note">{lockNote('services')}</p>{/if}
            </section>

          {:else if page === 'publishing'}
            <section>
              <h3>Published versions</h3>
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
              {#if lockNote('publishedVersion')}<p class="lock-note">{lockNote('publishedVersion')}</p>{/if}
            </section>

            <section>
              <h3>Ask people to confirm they've read them</h3>
              <p class="hint">Everyone in the space sees a dot on each published file, and a count on Slate Viewer's taskbar button, until they open it and choose I Have Read This. A new version asks again for the files whose text changed. Metatrash keeps who confirmed what, and when.</p>
              <label class="check">
                <input type="checkbox" checked={form.acknowledge !== null} disabled={disabled('services') || (servicesWhy !== null && form.acknowledge === null)} onchange={event => setAcknowledge(event.currentTarget.checked)} />
                <span><b>Ask everyone to confirm they've read the published files</b>
                  {#if servicesWhy && form.acknowledge === null}<span class="hint">{servicesWhy}</span>{/if}
                  {#if form.acknowledge && form.publishedVersion === null}<span class="hint">Nobody is asked until the folder publishes a version.</span>{/if}
                </span>
              </label>
              {#if form.acknowledge}
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
              {#if lockNote('services')}<p class="lock-note">{lockNote('services')}</p>{/if}
            </section>

            <section>
              <h3>Printed copies</h3>
              <p class="hint">An image, such as a logo, printed centred at the top of the first page, above the title, on every document printed from this folder{isRoot ? '' : ' (and from subfolders that use its settings)'}. It is never added to the files. Give the image's web address; it is loaded when you print.</p>
              <input class="address" bind:value={form.printImage} placeholder={inheritedPrintImage ?? 'https://example.com/logo.png'} spellcheck="false" disabled={disabled('print')} />
              {#if inheritedPrintImage}<p class="hint small-print">Empty uses the image from {folderLabel(inherited('print')!.from)}.</p>{/if}
              {#if lockNote('print')}<p class="lock-note">{lockNote('print')}</p>{/if}
            </section>

            <section>
              <h3>Page footer</h3>
              <p class="hint">Up to three lines shown centred below a rule at the bottom of every page of this folder{isRoot ? '' : ' and its subfolders'} on the website, such as a notice or a link. Subfolders get it whether or not they use this folder's settings, unless they set their own. It is never added to the files.</p>
              <textarea class="address" rows="3" bind:value={form.footer} placeholder={footerAbove?.footer || ':metatrash: is a [Zaptronics](https://zaptronics.co.nz/) product'} spellcheck="false" maxlength={MAX_FOOTER} disabled={disabled('footer') || form.footerOff}></textarea>
              <p class="hint small-print">Markdown, up to three lines (Enter starts a new line): <code>[text](https://…)</code> for a link (or a page of the site, such as <code>/docs/about.md</code>), <code>**bold**</code>, <code>*italic*</code> and <code>`code`</code>; no HTML. <code>:metatrash:</code> shows the Metatrash wordmark.</p>
              {#if !form.footerOff && !form.footer.trim() && footerAbove}<p class="hint small-print">{footerAbove.footer ? `Empty uses the footer from ${folderLabel(footerAbove.from)}.` : `${folderLabel(footerAbove.from)} turns the footer off, so these pages have none.`}</p>{/if}
              <label class="check">
                <input type="checkbox" bind:checked={form.footerOff} disabled={disabled('footer')} />
                <span>No footer here{isRoot ? '' : ', even if a folder above sets one'}, nor in subfolders that set none</span>
              </label>
              {#if lockNote('footer')}<p class="lock-note">{lockNote('footer')}</p>{/if}
            </section>

            {#if toSettings(original).acknowledge && savedVersion !== null}
              <section>
                <h3>Who has read them</h3>
                <p class="hint">Everyone in the space, and which published files each still has to read. Needs read-write access to the space.</p>
                {#if readersError}<p class="problem">{readersError}</p>{/if}
                {#if readers}
                  {#if !readerColumns.length}
                    <p class="hint">No published files to read yet.</p>
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
              <h3>Actions</h3>
              <p class="hint">An action is an agent that works in this folder by itself: when files arrive (tidy every draft dropped in <code>inbound/</code>, say), or on a schedule (a news summary every morning). It follows your instructions with Metatrash's file tools, sees only this folder and the folders inside it, and notes each job in <code>{RUNNER_LOG}</code> here. Jobs run on an agent from <button class="link" onclick={openAgentsSettings}>Settings → Services → Agents</button> and use its tokens.</p>
              {#if !ownedSpace}
                <div class="card"><p class="hint">Actions run only in your own spaces, the ones under your name on {space.server.replace(/^https?:\/\//, '')}, not in the public space.</p></div>
              {:else}
                {#if !owning}
                  <p class="note">You're a member of this space. Actions you add are your own: they run on your agent and only for files you bring. The owner's and other members' actions are shown, but only they can change them.</p>
                {/if}

                {#each form.actions as action, i (i)}
                  {@const editable = canEditAction(action)}
                  {@const isOpen = openAction === i}
                  <div class="action" class:open={isOpen}>
                    <div class="action-head">
                      <button class="action-toggle" aria-expanded={isOpen} onclick={() => (openAction = isOpen ? null : i)}>
                        <span class="chevron" aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
                        <span class="action-text">
                          <span class="action-name">{action.name.trim() || 'Unnamed action'}{#if !action.raw}<span class="tag new">New</span>{/if}{#if action.member}<span class="tag">{action.member === writer.account ? 'Yours' : `${action.member}'s`}</span>{/if}</span>
                          <span class="hint">{describeTrigger(action)} · {agentLabel(action)}</span>
                        </span>
                      </button>
                      {#if canRemoveAction(action)}
                        <button class="remove" aria-label="Remove {action.name}" title="Remove this action" onclick={() => removeAction(i)}>×</button>
                      {/if}
                    </div>

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
                    {/if}
                  </div>
                {/each}

                <div class="buttons">
                  <button class="small" disabled={readOnlySpace || frozen.has('actions') || form.actions.length >= 20 || (!owning && !writer.account)} onclick={addAction}>Add an Action</button>
                  {#if runnerLog}<button class="small" onclick={() => { onOpenFile(runnerLog!); onClose(); }}>Open the Run Log</button>{/if}
                </div>
                {#if !form.actions.length}
                  <p class="hint small-print">No actions here yet. Saving writes them to {SETTINGS_FILE}; a subfolder never runs this folder's actions.</p>
                {/if}
              {/if}
              {#if lockNote('actions')}<p class="lock-note">{lockNote('actions')}</p>{/if}
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
  .lock-note { margin-top: 6px; font-size: 12px; color: var(--side-accent); }
  .lock-note::before { content: '🔒 '; }
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
  fieldset.action-body { margin: 0; padding: 4px 12px 12px 28px; border: 0; min-width: 0; }
  .card.adopt { margin: 0 12px 6px 28px; background: var(--side-input); }
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
