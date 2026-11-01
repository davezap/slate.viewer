<script lang="ts">
  // metatrash.com: Settings → Services (Metatrash 0.80.0), in place of /account/services. One page
  // each (0.84.0): #settings/services/apps (connected AI apps), …/agents (the agents folder actions
  // run on), …/actions (actions paid for in other people's spaces) and …/github; …/apps/<id> is one
  // connection's spaces and …/actions/<job> an action that skipped one of your files, from its
  // email. Giving an app more and adding an agent ask the person to confirm it's them.
  import { untrack } from 'svelte';
  import {
    account, AccountError,
    type ActionOffer, type Agent, type AppSpaces, type Notice, type Services,
  } from './siteAccount';

  interface Props {
    /** The address after settings/services: a page (apps, agents, actions, github), apps/<id> or actions/<job>. */
    sub: string;
    onNavigate: (address: string) => void;
    /** Asks the person to confirm it's them, then runs retry. */
    onConfirm: (reason: string, retry: () => void) => void;
    /** Shows a change's result at the top of the dialog; errors stay until closed. */
    onNotice: (text: string, error?: boolean) => void;
  }
  let { sub, onNavigate, onConfirm, onNotice }: Props = $props();

  const parts = $derived(sub.split('/'));
  const appId = $derived(parts[0] === 'apps' && parts[1] ? parts[1] : '');
  const jobId = $derived(parts[0] === 'actions' && parts[1] ? parts[1] : '');
  /** Services' pages, in the order the Settings sidebar lists them. */
  const PAGES = { apps: 'Connected apps', agents: 'Agents', actions: 'Actions you pay for', github: 'GitHub' } as const;
  const page = $derived<keyof typeof PAGES>(parts[0] in PAGES ? (parts[0] as keyof typeof PAGES) : 'apps');

  let services = $state<Services | null>(null);
  let app = $state<AppSpaces | null>(null);
  let offer = $state<ActionOffer | null>(null);
  let loadError = $state('');
  let busy = $state(false);

  // Inline steps.
  let revoking = $state('');
  let removing = $state('');
  let changing = $state('');
  let disconnecting = $state('');
  let optingOut = $state('');
  let copied = $state(false);
  let choices = $state<Record<string, string>>({});
  let optInAgent = $state('');
  let change = $state({ name: '', cap: '', key: '' });
  let add = $state({ name: '', provider: '', model: '', key: '', endpoint: '', cap: '2000000' });

  async function load() {
    loadError = '';
    try {
      if (appId) {
        const a = await account.appSpaces(appId);
        app = a;
        choices = Object.fromEntries(a.spaces.map(s => [s.id, s.choice]));
      } else if (jobId) {
        const o = await account.actionOffer(jobId);
        offer = o;
        optInAgent = o.current || o.agents[0]?.id || '';
      } else {
        const s = await account.services();
        services = s;
        if (!add.provider) add.provider = s.agents?.providers[0]?.value ?? '';
      }
    } catch (e) {
      if (e instanceof AccountError && e.status === 404 && (appId || jobId)) {
        loadError = appId ? 'That connection no longer exists. It may have been revoked or expired.' : 'That isn’t a job for one of your files, or the action is gone.';
      } else {
        loadError = e instanceof Error ? e.message : String(e);
      }
    }
  }

  // Each page loads its own data; moving between them clears the last page's steps.
  $effect(() => {
    void sub;
    untrack(() => {
      app = null;
      offer = null;
      revoking = removing = changing = disconnecting = optingOut = '';
      void load();
    });
  });

  /** Runs one change and shows its notice; one that needs Confirm it's you runs again after. */
  async function run(work: () => Promise<Notice>, after?: (n: Notice) => void) {
    if (busy) return;
    busy = true;
    try {
      const n = await work();
      if (n.redirect) {
        location.href = n.redirect;
        return;
      }
      onNotice(n.notice ?? '', !!n.failed);
      after?.(n);
      await load();
    } catch (e) {
      if (e instanceof AccountError && e.code === 'step_up_needed') onConfirm(e.message, () => void run(work, after));
      else onNotice(e instanceof Error ? e.message : String(e), true);
    } finally {
      busy = false;
    }
  }

  /** After a change on a page of its own, goes back to its list; its notice floats over both. */
  function back() {
    onNavigate(appId ? 'settings/services/apps' : 'settings/services/actions');
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      /* the address stays selectable */
    }
  }

  function startChange(a: Agent) {
    changing = a.id;
    change = { name: a.name, cap: String(a.dailyCap), key: '' };
  }

  function addAgent(event: SubmitEvent) {
    event.preventDefault();
    void run(() => account.service('agents', { ...add }), () => {
      add = { name: '', provider: add.provider, model: '', key: '', endpoint: '', cap: '2000000' };
    });
  }

  const provider = $derived(services?.agents?.providers.find(p => p.value === add.provider));
  const tokens = (n: number) => n.toLocaleString();
  const day = (iso: string) => {
    const d = new Date(iso + 'T00:00:00Z');
    return isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  };
  const when = (stamp: string) => stamp.replace(' UTC', '');
</script>


{#if appId}
  <!-- One connection's spaces. -->
  <button class="crumb" onclick={() => onNavigate('settings/services/apps')}>‹ Connected apps</button>
  {#if loadError}
    <p class="error" role="alert">{loadError}</p>
  {:else if !app}
    <p class="muted">Loading…</p>
  {:else}
    {@const a = app}
    <h2>Spaces for {a.name}</h2>
    <p class="muted">{a.host} · {a.kind} · connected {when(a.created)}</p>
    <p class="hint">The app can always use the public space. Changes apply to its next operation; it doesn’t need to reconnect.{a.canWrite ? '' : ' This connection is read-only. To let the app write, connect it again from the app.'} Giving it more asks you to confirm it’s you.</p>
    <form onsubmit={event => { event.preventDefault(); void run(() => account.service(`apps/${a.id}/spaces`, { spaces: { ...choices } }), back); }}>
      <ul class="rows">
        {#each a.spaces as s (s.id)}
          <li>
            <label class="main" for="app-{s.id}"><strong>{s.name}</strong><span class="sub mono">{s.space}{s.owned ? ' · your space' : ''}</span></label>
            <select id="app-{s.id}" bind:value={choices[s.id]}>
              <option value="none">Not connected</option>
              <option value="read_only">Read only</option>
              {#if s.writeAllowed}<option value="read_write">Read and write</option>{/if}
            </select>
            {#if !s.writeAllowed}<span class="sub">{a.canWrite ? 'Read only: set by the space owner' : 'Read only: this connection is read-only'}</span>{/if}
          </li>
        {:else}
          <li class="empty">You have no private spaces yet.</li>
        {/each}
      </ul>
      {#if a.kept}<p class="hint">{a.kept} other connected {a.kept === 1 ? 'space is' : 'spaces are'} suspended by {a.kept === 1 ? 'its owner' : 'their owners'} and will stay connected for when access is restored.</p>{/if}
      <div class="actions">
        <button type="submit" class="primary" disabled={busy || !a.spaces.length}>Save spaces</button>
        <button type="button" disabled={busy} onclick={() => onNavigate('settings/services/apps')}>Cancel</button>
      </div>
    </form>
  {/if}

{:else if jobId}
  <!-- An action that skipped one of the person's files. -->
  <button class="crumb" onclick={() => onNavigate('settings/services/actions')}>‹ Actions you pay for</button>
  {#if loadError}
    <p class="error" role="alert">{loadError}</p>
  {:else if !offer}
    <p class="muted">Loading…</p>
  {:else}
    {@const o = offer}
    <h2>{o.action}</h2>
    <p class="muted">A folder action in <span class="mono">{o.space}</span>, folder <code>{o.folder}</code>. Your file <code>{o.file}</code> {o.status === 'skipped' ? `did not run it: ${o.reason ?? ''}` : `ran it (${o.status}).`}</p>
    <ul class="rows">
      <li><span class="main"><strong>Model</strong></span><span>{o.model ? o.modelName : 'The default agent of whoever pays'}</span></li>
      <li><span class="main"><strong>Most tool calls per job</strong></span><span>{o.steps}</span></li>
      <li><span class="main"><strong>Instructions</strong></span><span class="long">{#if o.doFile}In <code>{o.doFile}</code> in that folder{:else}{o.do}{/if}</span></li>
    </ul>
    {#if o.pays === 'contributor'}
      <p>The space owner set this action so that whoever brings a file pays for it, with their own {o.modelName} agent. Only the owner can change what it does or which model it uses. Its jobs count toward the daily cap of the agent you choose.</p>
      {#if o.agents.length}
        <form class="row" onsubmit={event => { event.preventDefault(); void run(() => account.service(`actions/${o.job}/optin`, { agent: optInAgent }), back); }}>
          <label class="vh" for="optin-agent">Pay with</label>
          <select id="optin-agent" bind:value={optInAgent}>
            {#each o.agents as a (a.id)}<option value={a.id}>{a.name} · key ending {a.keyHint}</option>{/each}
          </select>
          <button type="submit" class="primary" disabled={busy}>{o.current ? 'Change agent' : o.status === 'skipped' ? 'Opt in and run it' : 'Opt in'}</button>
        </form>
      {:else}
        <p class="hint">You have no {o.modelName} agent yet. <button class="link" onclick={() => onNavigate('settings/services/agents')}>Add one in Agents</button>{o.keysURL ? ` with a key from ${o.keysURL}` : ''}, then come back to this page.</p>
      {/if}
    {:else if o.pays === 'member'}
      <p>This is your own action: it runs only for your files, on your {o.model ? o.modelName : 'default'} agent.</p>
    {:else}
      <p>The space owner pays for this action, so there is nothing for you to do.</p>
    {/if}
  {/if}

{:else}
  <h2>{PAGES[page]}</h2>
  {#if loadError}
    <p class="error" role="alert">Services can’t be loaded just now: {loadError}</p>
    <button onclick={() => void load()}>Try again</button>
  {:else if !services}
    <p class="muted">Loading…</p>
  {:else}
    {@const s = services}
    {#if page === 'apps'}
      {#if s.apps}
      <p class="hint">To let Claude, ChatGPT or another MCP app use your spaces, add this address to it as a custom connector. The app sends you here to sign in and choose which spaces it may use; there are no keys to copy. The public space is always included.</p>
      <div class="row">
        <code class="endpoint">{s.apps.connectURL}</code>
        <button onclick={() => void copy(s.apps?.connectURL ?? '')}>{copied ? 'Copied' : 'Copy'}</button>
      </div>
      {#if s.unavailable?.includes('apps')}
        <p class="error" role="alert">Connected apps can’t be listed just now. Reload shortly.</p>
      {:else}
        <ul class="rows">
          {#each s.apps.list as a (a.id)}
            <li>
              <span class="main">
                <strong>{a.name}</strong>
                <span class="sub">{a.host} · {a.kind} · connected {when(a.created)}{a.lastUsed ? ` · last used ${when(a.lastUsed)}` : ''}</span>
                <span class="sub wrap">{a.spaces.length ? a.spaces.map(x => `${x.name}: ${x.access}`).join(', ') : 'Public space only'}</span>
              </span>
              {#if revoking === a.id}
                <button class="danger" disabled={busy} onclick={() => void run(() => account.service(`apps/${a.id}/revoke`))}>Revoke access</button>
                <button disabled={busy} onclick={() => (revoking = '')}>Keep</button>
              {:else}
                <button onclick={() => onNavigate(`settings/services/apps/${a.id}`)}>Change spaces</button>
                <button title="Signs the app out at once and forgets its choices" onclick={() => (revoking = a.id)}>Revoke…</button>
              {/if}
            </li>
          {:else}
            <li class="empty">No apps are connected.</li>
          {/each}
        </ul>
        <p class="hint">Revoking signs the app out at once and forgets its choices; connecting again asks for spaces again. Unused connections expire after a while.</p>
      {/if}
      {:else}
        <p class="muted">Connected apps aren’t available on this server.</p>
      {/if}
    {:else if page === 'github'}
      {#if s.github}
      <p class="hint">Mirror a folder in a space to a GitHub repository. You install the Metatrash app on GitHub and choose which repositories it may use.</p>
      {#if s.unavailable?.includes('github')}
        <p class="error" role="alert">GitHub connections can’t be listed just now. Reload shortly.</p>
      {:else}
        <ul class="rows">
          {#each s.github.list as g (g.id)}
            <li>
              <span class="main"><strong>{g.accountLogin}</strong><span class="sub">{g.accountType}{g.status === 'suspended' ? ' · suspended on GitHub' : ''} · connected {when(g.connected)} by {g.githubLogin}</span></span>
              {#if disconnecting === g.id}
                <button class="danger" disabled={busy} onclick={() => void run(() => account.service(`github/${g.id}/disconnect`))}>Disconnect</button>
                <button disabled={busy} onclick={() => (disconnecting = '')}>Keep</button>
              {:else}
                <a class="button" href={g.settingsURL} target="_blank" rel="noopener noreferrer" title="Choose repositories or uninstall on GitHub">On GitHub ↗</a>
                <button title="Metatrash stops using this installation; it stays installed on GitHub" onclick={() => (disconnecting = g.id)}>Disconnect…</button>
              {/if}
            </li>
          {:else}
            <li class="empty">GitHub is not connected.</li>
          {/each}
        </ul>
        <div class="actions">
          <button class="primary" disabled={busy} onclick={() => void run(() => account.service('github/connect'))}>{s.github.list.length ? 'Connect another GitHub account' : 'Connect GitHub'} →</button>
          <button disabled={busy} onclick={() => void run(() => account.service('github/link'))}>Link an existing installation</button>
        </div>
        <p class="hint">Already installed the app from its GitHub page? Use Link an existing installation: GitHub only asks you to sign in, and every installation your GitHub account can see is connected.</p>
      {/if}
      {:else}
        <p class="muted">GitHub isn’t available on this server.</p>
      {/if}
    {:else if !s.agents}
      <p class="muted">Folder actions aren’t available on this server.</p>
    {:else if s.unavailable?.includes('agents')}
      <p class="error" role="alert">Agents can’t be listed just now. Reload shortly.</p>
    {:else}
      {@const ag = s.agents}
      {#if page === 'agents'}
        <p class="hint">Folder actions in your spaces run on your own agent: a model provider and your API key, so you pay the provider directly. Actions use your default agent unless they name a model, such as <code>"model": "minimax/MiniMax-M3"</code>. Members’ files in your spaces run on your agent too, unless an action says <code>"pays": "contributor"</code>: then whoever brings a file pays, once they opt in.</p>
        <ul class="rows">
          {#each ag.list as a (a.id)}
            <li>
              <span class="main">
                <strong>{a.name}{#if a.default} <span class="pill ok">default</span>{/if}</strong>
                <span class="sub">{a.providerName} · {a.model} · key ending {a.keyHint}{a.endpoint ? ` · ${a.endpoint}` : ''}</span>
                <span class="sub">{a.dailyCap ? `${tokens(a.usedToday)} of ${tokens(a.dailyCap)} tokens today` : `No cap · ${tokens(a.usedToday)} tokens today`} · added {day(a.created)}</span>
              </span>
              {#if removing === a.id}
                <button class="danger" disabled={busy} onclick={() => void run(() => account.service(`agents/${a.id}/remove`), () => { removing = ''; })}>Remove this agent</button>
                <button disabled={busy} onclick={() => (removing = '')}>Keep</button>
              {:else}
                <button disabled={busy} title="Makes one tiny call to check the key" onclick={() => void run(() => account.service(`agents/${a.id}/test`))}>Test</button>
                {#if !a.default}<button disabled={busy} onclick={() => void run(() => account.service(`agents/${a.id}/default`))}>Make default</button>{/if}
                <button disabled={busy} onclick={() => (changing === a.id ? (changing = '') : startChange(a))}>Change…</button>
                <button disabled={busy} onclick={() => (removing = a.id)}>Remove…</button>
              {/if}
              {#if removing === a.id}
                <p class="hint full">Metatrash deletes its key. Folder actions that need it are skipped until you add another agent{a.default ? '; your oldest other agent becomes the default' : ''}.</p>
              {/if}
              {#if changing === a.id}
                <form class="grid full" onsubmit={event => { event.preventDefault(); void run(() => account.service(`agents/${a.id}/change`, { ...change }), () => { changing = ''; }); }}>
                  <label for="change-name-{a.id}">Name</label>
                  <input id="change-name-{a.id}" bind:value={change.name} maxlength="64" required />
                  <label for="change-cap-{a.id}">Daily token cap</label>
                  <input id="change-cap-{a.id}" bind:value={change.cap} inputmode="numeric" maxlength="16" required />
                  <label for="change-key-{a.id}">New API key <span class="muted">(optional)</span></label>
                  <input id="change-key-{a.id}" type="password" bind:value={change.key} maxlength="512" autocomplete="off" placeholder="Leave empty to keep the key ending {a.keyHint}" />
                  <p class="hint span">0 means no limit; today’s use so far counts toward the new cap. A new key is for the same provider and model ({a.providerName} · {a.model}).</p>
                  <div class="actions span"><button type="submit" class="primary" disabled={busy}>Save</button><button type="button" onclick={() => (changing = '')}>Cancel</button></div>
                </form>
              {/if}
            </li>
          {:else}
            <li class="empty">No agents yet. Add one to run folder actions in your spaces.</li>
          {/each}
        </ul>

        {#if ag.list.length >= ag.max}
          <p class="hint">You have the most agents allowed. Remove one to add another.</p>
        {:else}
          <h3>Add an agent</h3>
          <form class="grid" onsubmit={addAgent}>
            <label for="agent-name">Name</label>
            <input id="agent-name" bind:value={add.name} maxlength="64" placeholder="MiniMax main" required />
            <label for="agent-provider">Provider</label>
            <select id="agent-provider" bind:value={add.provider}>
              {#each ag.providers as p (p.value)}<option value={p.value}>{p.name}</option>{/each}
            </select>
            <label for="agent-model">Model</label>
            <input id="agent-model" bind:value={add.model} maxlength="100" placeholder={provider ? provider.model : 'The provider’s usual model'} autocapitalize="none" spellcheck="false" />
            <label for="agent-key">API key</label>
            <input id="agent-key" type="password" bind:value={add.key} maxlength="512" autocomplete="off" required />
            <p class="hint span">{provider ? `From ${provider.keysURL}. ` : ''}Stored encrypted and never shown again.</p>
            <label for="agent-cap">Daily token cap</label>
            <input id="agent-cap" bind:value={add.cap} inputmode="numeric" maxlength="16" />
            <label for="agent-endpoint">Endpoint <span class="muted">(optional)</span></label>
            <input id="agent-endpoint" type="url" bind:value={add.endpoint} maxlength="255" placeholder="Leave empty for the provider’s own" />
            <p class="hint span">The cap counts tokens in and out per day across your jobs (0 means no limit); jobs over it are skipped. An endpoint is an https address on the public internet that speaks the Anthropic Messages API. Adding an agent asks you to confirm it’s you, because its endpoint receives the files your folder actions read.</p>
            <div class="actions span"><button type="submit" class="primary" disabled={busy}>Add agent</button></div>
          </form>
        {/if}
      {:else}
        <p class="hint">Folder actions in other people’s spaces that run on your agent when you bring a file, because the owner set <code>"pays": "contributor"</code>. You are asked by email before your first file runs one.</p>
        <ul class="rows">
          {#each ag.optIns as o (o.id)}
            <li>
              <span class="main"><strong>{o.action}</strong><span class="sub">{o.spaceName} · <span class="mono">{o.space}</span> · {o.folder} · paid by {o.agentName} since {day(o.created)}</span></span>
              {#if optingOut === o.id}
                <button class="danger" disabled={busy} onclick={() => void run(() => account.service(`optins/${o.id}/optout`))}>Opt out</button>
                <button disabled={busy} onclick={() => (optingOut = '')}>Keep</button>
              {:else}
                <button title="Your files in that folder no longer run this action" onclick={() => (optingOut = o.id)}>Opt out…</button>
              {/if}
            </li>
          {:else}
            <li class="empty">None. When a folder action in someone else’s space runs on the key of whoever brings the file, you are asked by email before your first file runs it.</li>
          {/each}
        </ul>

      {/if}
    {/if}
  {/if}
{/if}

<style>
  .crumb { margin: 0 0 10px; padding: 4px 0; font: inherit; color: var(--side-accent); background: none; border: 0; cursor: pointer; }
  h2 { margin: 0 0 6px; font-size: 18px; }
  h3 { margin: 22px 0 8px; font-size: 13px; font-weight: 700; }
  p { margin: 0 0 10px; }
  .muted, .hint { color: var(--side-muted); }
  .hint { font-size: 12px; }
  .mono, code { font-family: Consolas, "Cascadia Mono", ui-monospace, monospace; }
  .error { color: #c0392b; }
  :global([data-theme="dark"]) .error { color: #ff8a7a; }
  .endpoint { flex: 1; min-width: 0; padding: 6px 8px; overflow-wrap: anywhere; background: var(--side-bg); border: 1px solid var(--side-border); border-radius: 6px; user-select: all; }
  .actions { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 8px; }
  .row { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 8px; }
  .row select { flex: 1; min-width: 180px; }
  .grid { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 6px 10px; align-items: center; margin: 0 0 8px; }
  .grid .span { grid-column: 1 / -1; margin: 0; }
  .full { flex-basis: 100%; }
  input, select {
    box-sizing: border-box; min-width: 0; padding: 6px 8px; font: inherit; color: inherit;
    background: var(--side-bg); border: 1px solid var(--side-border); border-radius: 6px; outline: none;
  }
  input:focus, select:focus { border-color: var(--side-accent); }
  button, .button {
    display: inline-block; padding: 6px 12px; font: inherit; color: inherit; text-decoration: none; white-space: nowrap;
    background: var(--side-bg); border: 1px solid var(--side-border); border-radius: 6px; cursor: pointer;
  }
  button:hover:not(:disabled), .button:hover { background: var(--side-hover); }
  button:disabled { opacity: .5; cursor: default; }
  .primary { color: #fff; background: var(--side-accent); border-color: var(--side-accent); }
  .primary:hover:not(:disabled) { background: var(--side-accent); filter: brightness(1.08); }
  :global([data-theme="dark"]) .primary { color: #1d1a22; }
  .danger { color: #fff; background: #c0392b; border-color: #c0392b; }
  .danger:hover:not(:disabled) { background: #a93226; }
  .link { padding: 0; border: 0; background: none; color: var(--side-accent); }
  .link:hover:not(:disabled) { background: none; text-decoration: underline; }
  a { color: var(--side-accent); }
  .rows { margin: 0 0 8px; padding: 0; list-style: none; border: 1px solid var(--side-border); border-radius: 8px; }
  .rows li { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; padding: 8px 10px; border-top: 1px solid var(--side-border); }
  .rows li:first-child { border-top: 0; }
  .rows li.empty { color: var(--side-muted); }
  .main { flex: 1; min-width: 160px; display: flex; flex-direction: column; color: inherit; }
  .main strong, .sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sub { color: var(--side-muted); font-size: 12px; }
  .sub.wrap, .long { white-space: normal; overflow-wrap: anywhere; }
  .long { flex: 2; min-width: 0; }
  .pill { padding: 1px 8px; color: var(--side-muted); font-size: 11px; font-weight: 400; border: 1px solid var(--side-border); border-radius: 9px; white-space: nowrap; }
  .pill.ok { color: #2e7d4f; border-color: #2e7d4f; }
  strong .pill { margin-left: 4px; }
  .vh { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  @media (max-width: 640px) {
    .grid { grid-template-columns: minmax(0, 1fr); }
  }
</style>
