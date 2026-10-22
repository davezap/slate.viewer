<script lang="ts">
  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { openUrl } from '@tauri-apps/plugin-opener';
  import { joinPath } from './paths';
  import type { FolderDescription } from './space';
  import {
    SETTINGS_FILE, LOCK_KEYS, LOCK_KEY_LABELS, check, defaultSettingsText, effectiveLocks, effectiveSettings, folderChain,
    frozenKeys, lockedBy, parentFolder, parseObject, stableJson, toObject, toSavedVersion, toSettings, toText,
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
  }

  let { root, folder, space, descriptions, onClose, onSaved, onOpenFile }: Props = $props();

  interface LoadedDocument { path: string; text: string; hasBom: boolean }
  interface FolderListing { files: string[]; emptyFolders: string[]; truncated: boolean }
  type Page = 'general' | 'security' | 'connections' | 'publishing' | 'automation' | 'file';

  const PAGES: { id: Page; title: string; about: string }[] = [
    { id: 'general', title: 'General', about: 'What the folder is for' },
    { id: 'security', title: 'Security', about: 'Read-only files and locks' },
    { id: 'connections', title: 'Connections', about: 'GitHub repository' },
    { id: 'publishing', title: 'Publishing', about: 'Versions and who has read them' },
    { id: 'automation', title: 'Automation', about: 'Triggers and actions' },
    { id: 'file', title: 'Settings File', about: SETTINGS_FILE },
  ];

  const LEVELS: { level: LockLevel; title: string; about: string }[] = [
    { level: '', title: 'Unlocked', about: 'Anyone with write access can change it, agents included.' },
    { level: 'agents', title: 'Locked for agents', about: 'Agents can\'t change it. You and members can, here or through Metatrash Sync.' },
    { level: 'everyone', title: 'Locked for everyone', about: 'Nobody can change it, people included, until a person lifts the lock.' },
  ];

  const PUSH_MODES: { mode: PushMode; title: string; about: string }[] = [
    { mode: 'agent', title: 'When an agent pushes', about: 'Changes go to GitHub only when an agent uses its push tool, with a commit message. The default.' },
    { mode: 'auto', title: 'Automatically', about: 'Accepted now, and works like "When an agent pushes" until automatic pushing exists.' },
    { mode: 'review', title: 'After review', about: 'Accepted now, but pushing is refused until a review screen exists.' },
  ];

  const isRoot = $derived(folder === '');
  const readOnlySpace = $derived(space.access === 'read only');
  const folderLabel = (f: string) => (f ? f : 'the top of the space');
  const title = $derived(isRoot ? space.space : folder.replace(/\/$/, ''));

  let page = $state<Page>('general');
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

  const ownPath = $derived(folder + SETTINGS_FILE);
  const readText = (relative: string) =>
    invoke<LoadedDocument>('read_document', { path: joinPath(root, relative) }).then(doc => doc.text, () => null);

  onMount(() => {
    void (async () => {
      try {
        const chain = folderChain(folder);
        const read = await Promise.all(chain.map(f => readText(f + SETTINGS_FILE)));
        texts = new Map(chain.map((f, i) => [f, read[i]]));
        const listing = await invoke<FolderListing>('list_folder', { root, hidden: true }).catch(() => null);
        files = listing?.files ?? [];
        const parsed = parseObject(read[0] ?? defaultSettingsText(folder));
        if (typeof parsed === 'string') {
          loadError = `${ownPath} can't be read as settings. ${parsed}`;
          return;
        }
        original = parsed;
        form = toSettings(parsed);
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
  const context = $derived<SpaceContext>({ texts, githubFolders, files, publicSpace: space.space === 'public' });
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
      for (const key of LOCK_KEYS) form.locked[key] = (levels[key] === 'agents' || levels[key] === 'everyone' ? levels[key] : '') as LockLevel;
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
      await invoke('write_document', { path: joinPath(root, ownPath), text: outputText, hasBom: false });
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
              <p class="hint"><b>People and agents.</b> A change you make here, in Files or through Metatrash Sync counts as a person's, and so does one by a member with write access. Everything else is an agent: Claude and other AI apps, space keys, and the public connection. Anything not locked can be changed by anyone with write access.</p>
            </section>

            <section>
              <h3>Read-only files</h3>
              <p class="hint">Lock files in this folder so they can't be written, edited, renamed, moved or deleted, and no file of that name can be created. Name one file (<code>plan.md</code>), a pattern (<code>*.pdf</code>, <code>2025-*.md</code>) or a subfolder for everything in it (<code>archive/</code>). Only this folder's files: a subfolder sets its own.</p>
              {#each form.readOnly as entry, i (i)}
                <div class="pair">
                  <input class="name wide" list="folder-entries" bind:value={entry.name} placeholder="plan.md, *.pdf or archive/" spellcheck="false" disabled={disabled('readOnly')} />
                  <select bind:value={entry.level} disabled={disabled('readOnly')}>
                    <option value="agents">Locked for agents</option>
                    <option value="everyone">Locked for everyone</option>
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
              <p class="hint">Stop the settings on these pages from being changed. A lock applies to subfolders that use this folder's settings, and they can't override a locked value.</p>
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
                  <p class="hint"><b>Before the first pull:</b> connect GitHub on <button class="link" onclick={() => void openUrl(`${space.server}/account`)}>your Metatrash account</button> for the repository's owner. The folder should be empty, or hold only files identical to the repository's. Files in <code>.github/workflows/</code> are changed on GitHub directly. Names starting with a dot are allowed only inside GitHub folders.</p>
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
              <h3>Triggers and actions</h3>
              <p class="hint">Coming later: rules for what happens when files in this folder change, such as pushing to GitHub, telling an agent, or tidying up. Metatrash keeps an <code>actions</code> setting reserved for them, and refuses it until they exist, so there is nothing to set here yet.</p>
              <div class="card">
                <p class="hint"><b>What happens automatically today</b></p>
                <ul class="levels">
                  <li>Every folder gets an AGENTS.md and a {SETTINGS_FILE} when it gets its first file, and loses them with its last one.</li>
                  <li>Metatrash Sync keeps this folder and the space in step, both ways.</li>
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
          <span class="grow footer-note" class:error={!!saveError || !!footerProblem}>{saveError || footerProblem || (changed ? 'Save writes the settings; Metatrash Sync sends them to the space.' : '')}</span>
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
  @media (max-width: 620px) {
    .main { flex-direction: column; }
    nav { width: auto; display: flex; gap: 4px; overflow-x: auto; border-right: 0; border-bottom: 1px solid var(--side-border); }
    nav button { width: auto; flex: none; }
    .nav-about { display: none; }
    .fields { grid-template-columns: 1fr; }
  }
</style>
