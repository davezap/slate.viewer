<script lang="ts">
  // metatrash.com: Settings, the account's settings in the app (Metatrash 0.79.0), in place of the
  // old /account pages. Its address is #settings/<tab>[/<space>]: Spaces (and each owned space's
  // sharing and settings), Security, Services and Profile. Security and Services still open the
  // account pages for now. On a phone it is full screen: the tabs are a list, each opens on its own.
  import { onMount, tick, untrack } from 'svelte';
  import ConfirmSheet from './ConfirmSheet.svelte';
  import {
    account, AccountError, browserZone, downloadAddress, openAddress, timeZones,
    type Account, type AccountSpace, type Notice, type Sharing,
  } from './siteAccount';

  interface Props {
    /** The address without '#': settings, settings/spaces, settings/spaces/<id or owner/slug>, settings/profile… */
    address: string;
    /** The space open in the app (owner/slug or public). */
    current: string | null;
    onNavigate: (address: string) => void;
    onClose: () => void;
  }
  let { address, current, onNavigate, onClose }: Props = $props();

  const TABS = [
    { id: 'spaces', label: 'Spaces' },
    { id: 'security', label: 'Security' },
    { id: 'services', label: 'Services' },
    { id: 'profile', label: 'Profile' },
  ] as const;

  const parts = $derived(address.split('/'));
  const tab = $derived(TABS.some(t => t.id === parts[1]) ? parts[1] : '');
  const key = $derived(tab === 'spaces' ? parts.slice(2).join('/') : '');

  let acct = $state<Account | null>(null);
  let loadError = $state('');
  let signedOut = $state(false);
  let sharing = $state<Sharing | null>(null);
  let sharingError = $state('');
  let notice = $state('');
  let error = $state('');
  let busy = $state(false);
  let confirm = $state<{ reason: string; retry: () => void } | null>(null);
  let narrow = $state(false);
  let panel = $state<HTMLDivElement>();

  // Form fields.
  let newName = $state('');
  let username = $state('');
  let inviteEmail = $state('');
  let zone = $state('');
  let transferTo = $state('');
  let deleteName = $state('');
  let deleteEmail = $state('');
  let removing = $state('');
  let webWarning = $state(false);
  const zones = timeZones();

  /** The owned space the address names, by id or owner/slug. */
  const selected = $derived<AccountSpace | null>(key && key !== 'new' && acct ? acct.spaces.find(s => s.id === key || s.space === key) ?? null : null);
  const selectedId = $derived(selected?.id ?? '');

  async function load() {
    try {
      acct = await account.get();
      loadError = '';
    } catch (e) {
      if (e instanceof AccountError && e.status === 401) signedOut = true;
      else loadError = e instanceof Error ? e.message : String(e);
    }
  }

  async function loadSharing(id: string) {
    try {
      const s = await account.sharing(id);
      if (selectedId === id) {
        sharing = s;
        sharingError = '';
        if (!s.candidates.some(c => c.id === transferTo)) transferTo = s.candidates[0]?.id ?? '';
      }
    } catch (e) {
      if (selectedId === id) sharingError = e instanceof Error ? e.message : String(e);
    }
  }

  onMount(() => {
    const media = matchMedia('(max-width: 640px)');
    const update = () => (narrow = media.matches);
    update();
    media.addEventListener('change', update);
    void load();
    void tick().then(() => panel?.focus());
    return () => media.removeEventListener('change', update);
  });

  // A space's own page: its sharing, and its fields. Only a different space resets them (each
  // change reloads the account, which makes a new `selected`).
  $effect(() => {
    const id = selectedId;
    untrack(() => resetSpace(id));
  });
  function resetSpace(id: string) {
    sharing = null;
    sharingError = '';
    notice = '';
    error = '';
    removing = '';
    webWarning = false;
    deleteName = '';
    if (!id) return;
    zone = selected?.timezone ?? '';
    void loadSharing(id);
  }
  $effect(() => { void tab; notice = ''; error = ''; });
  $effect(() => {
    if (key === 'new' && acct) void tick().then(() => (panel?.querySelector('#settings-new-space') as HTMLInputElement | null)?.focus());
  });

  /**
   * Runs one change: shows its notice, or its problem. A change that needs a recent sign-in opens
   * Confirm it's you, then runs again.
   */
  async function run(work: () => Promise<Notice>, after?: (n: Notice) => void | Promise<void>) {
    if (busy) return;
    busy = true;
    error = '';
    notice = '';
    try {
      const n = await work();
      notice = n.notice ?? '';
      await after?.(n);
      await load();
      if (selectedId) await loadSharing(selectedId);
    } catch (e) {
      if (e instanceof AccountError && e.code === 'step_up_needed') {
        confirm = { reason: e.message, retry: () => void run(work, after) };
      } else {
        error = e instanceof Error ? e.message : String(e);
      }
    } finally {
      busy = false;
    }
  }

  function go(next: string) {
    onNavigate(next);
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || confirm) return;
    event.preventDefault();
    if (narrow && tab) go('settings');
    else onClose();
  }

  function createSpace(event: SubmitEvent) {
    event.preventDefault();
    void run(() => account.post('/spaces', { name: newName, timezone: browserZone() }), n => {
      newName = '';
      if (n.space) location.href = openAddress(n.space);
    });
  }

  function retrySpace(s: AccountSpace) {
    void run(() => account.post('/spaces', { name: s.name, slug: s.slug }));
  }

  const ago = (expires: string) => expires.replace(' UTC', '');
</script>

<svelte:window onkeydown={onKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" onclick={() => !busy && onClose()}>
  <div class="panel" class:narrow bind:this={panel} role="dialog" aria-modal="true" aria-label="Settings" tabindex="-1" onclick={event => event.stopPropagation()}>
    <button class="x" title="Close (Esc)" aria-label="Close settings" onclick={onClose}>
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
    </button>

    {#if !narrow || !tab}
      <nav aria-label="Settings">
        <div class="heading">Settings</div>
        {#each TABS as t (t.id)}
          <button class:selected={!narrow && (tab || 'spaces') === t.id} onclick={() => go(`settings/${t.id}`)}>
            <span>{t.label}</span>
            {#if t.id === 'spaces' && acct && acct.invitations.length + acct.offers.length}
              <span class="count" aria-label="{acct.invitations.length + acct.offers.length} waiting for you">{acct.invitations.length + acct.offers.length}</span>
            {:else if narrow}<span class="chev" aria-hidden="true">›</span>{/if}
          </button>
        {/each}
        {#if acct}<div class="who" title={acct.email}>{acct.username ?? acct.email}</div>{/if}
      </nav>
    {/if}

    {#if !narrow || tab}
      <section class="content">
        {#if narrow}<button class="back" onclick={() => go(selected || key === 'new' ? 'settings/spaces' : 'settings')}>‹ {selected || key === 'new' ? 'Spaces' : 'Settings'}</button>{/if}
        {#if notice}<p class="notice" role="status">{notice}</p>{/if}
        {#if error}<p class="error" role="alert">{error}</p>{/if}

        {#if signedOut}
          <h2>Sign in to see your settings</h2>
          <p>Your spaces, sharing and profile are in your account.</p>
          <a class="button primary" href="/login">Sign in</a>
        {:else if loadError}
          <p class="error" role="alert">Your settings can’t be loaded just now: {loadError}</p>
          <button onclick={() => void load()}>Try again</button>
        {:else if !acct}
          <p class="muted">Loading…</p>

        {:else if (tab || 'spaces') === 'spaces' && selected}
          <!-- One owned space: its address, sharing and settings. -->
          {#if !narrow}<button class="crumb" onclick={() => go('settings/spaces')}>‹ Spaces</button>{/if}
          <div class="head">
            <h2>{selected.name}</h2>
            {#if selected.space}
              <div class="actions">
                <a class="button" href={openAddress(selected.space)}>Open</a>
                <a class="button" href={downloadAddress(selected.space)} download>Download a copy</a>
              </div>
            {/if}
          </div>
          <p class="mono muted">{acct.username}/{selected.slug}</p>

          <h3>Readable on the web</h3>
          {#if selected.web}
            <p><span class="pill web">public</span> Anyone with the link can read every file in it on the website, without signing in. AI apps still reach it only through connections you or your members approve.</p>
            <button disabled={busy} onclick={() => void run(() => account.space(selected.id, 'visibility', { visibility: 'private' }))}>Make it private again</button>
          {:else if !webWarning}
            <p class="muted">Private: only you and its members can read it.</p>
            <button disabled={busy} onclick={() => (webWarning = true)}>Make readable on the web…</button>
          {:else}
            <div class="warning" role="note">
              <p><strong>Warning:</strong> anyone with the link to {selected.name}, signed in or not, will be able to read every file in it on the website, now and as it changes. Check it holds nothing private: secrets, keys, personal details, private notes. Search engines may list the files in its top folder; files in subfolders are marked not to be indexed.</p>
              <p class="muted">Read-only, website only: nobody can change files this way. You can make it private again at any time. You’ll be asked to confirm it’s you.</p>
              <div class="actions">
                <button class="primary" disabled={busy} onclick={() => void run(() => account.space(selected.id, 'visibility', { visibility: 'web' }), () => { webWarning = false; })}>Yes, make it readable on the web</button>
                <button disabled={busy} onclick={() => (webWarning = false)}>Cancel</button>
              </div>
            </div>
          {/if}

          <h3>Time zone</h3>
          <form class="row" onsubmit={event => { event.preventDefault(); void run(() => account.space(selected.id, 'timezone', { timezone: zone })); }}>
            <label class="vh" for="settings-zone">Time zone</label>
            <input id="settings-zone" bind:value={zone} list="settings-zones" maxlength="64" placeholder={acct.defaultTimezone} autocomplete="off" />
            <button type="submit" disabled={busy}>Save</button>
          </form>
          <datalist id="settings-zones">{#each zones as z (z)}<option value={z}></option>{/each}</datalist>
          <p class="hint">When folder actions with <code>every</code> run, and the times in runner.md. Leave it empty for the server’s ({acct.defaultTimezone}).</p>

          {#if sharingError}
            <p class="error" role="alert">Sharing can’t be loaded just now: {sharingError}</p>
          {:else if !sharing}
            <p class="muted">Loading sharing…</p>
          {:else}
            {@const s = sharing}
            <h3>Invite someone</h3>
            <form class="row" onsubmit={event => { event.preventDefault(); void run(() => account.space(s.id, 'invite', { email: inviteEmail }), () => { inviteEmail = ''; }); }}>
              <label class="vh" for="settings-invite">Email address</label>
              <input id="settings-invite" type="email" bind:value={inviteEmail} maxlength="254" placeholder="Email address" required />
              <button type="submit" disabled={busy}>Send invitation</button>
            </form>
            <p class="hint">We email them an invitation. They sign in with this address (which makes an account if they have none) and accept it in Settings. Invitations expire after seven days; inviting again resends the email, at most once an hour.</p>

            {#if s.invitations.length}
              <h3>Invitations</h3>
              <ul class="rows">
                {#each s.invitations as i (i.id)}
                  <li>
                    <span class="main"><strong>{i.email}</strong><span class="sub">{i.status === 'expired' ? 'expired' : 'expires'} {ago(i.expires)}</span></span>
                    <button class="icon" title="Cancel invitation" aria-label="Cancel invitation for {i.email}" disabled={busy} onclick={() => void run(() => account.space(s.id, 'cancel', { invitation: i.id }))}>×</button>
                  </li>
                {/each}
              </ul>
            {/if}

            <h3>Members</h3>
            <ul class="rows">
              <li><span class="main"><strong>{acct.email}</strong><span class="sub">{acct.username} · owner</span></span><span class="pill ok">active</span></li>
              {#each s.members as m (m.id)}
                <li class="member">
                  <span class="main"><strong>{m.email}</strong>{#if m.username}<span class="sub">{m.username}</span>{/if}</span>
                  <span class="pill" class:ok={m.status === 'active'}>{m.status}</span>
                  {#if s.apps}
                    <label class="vh" for="perm-{m.id}">Their connected apps may</label>
                    <select id="perm-{m.id}" title="What their connected AI apps may do here" value={m.agentPermission} disabled={busy}
                      onchange={event => void run(() => account.space(s.id, 'agent', { member: m.id, permission: (event.currentTarget as HTMLSelectElement).value }))}>
                      <option value="read_write">Apps: read and write</option>
                      <option value="read_only">Apps: read only</option>
                    </select>
                  {/if}
                  {#if m.status === 'active'}
                    <button disabled={busy} onclick={() => void run(() => account.space(s.id, 'suspend', { member: m.id }))}>Suspend</button>
                  {:else if m.status === 'suspended'}
                    <button disabled={busy} onclick={() => void run(() => account.space(s.id, 'restore', { member: m.id }))}>Restore</button>
                  {/if}
                  {#if removing === m.id}
                    <button class="danger" disabled={busy} onclick={() => void run(() => account.space(s.id, 'remove', { member: m.id }), () => { removing = ''; })}>Remove from this space</button>
                    <button disabled={busy} onclick={() => (removing = '')}>Keep</button>
                  {:else}
                    <button disabled={busy} title="Ends their access; returning needs a new invitation" onclick={() => (removing = m.id)}>Remove…</button>
                  {/if}
                </li>
              {:else}
                <li class="empty">No invited members yet.</li>
              {/each}
            </ul>
            <p class="hint">Suspending, restoring and removing apply only to this space.{s.apps ? ' What their connected apps may do here applies from their next operation; you always have full access to your own space.' : ''}</p>

            <h3>Transfer ownership</h3>
            {#if s.transfer && !s.transfer.expired}
              <p>Offered to <strong>{s.transfer.toEmail}</strong>{s.transfer.toUsername ? ` (${s.transfer.toUsername})` : ''} until {ago(s.transfer.expires)}. They accept or decline in Settings. Until they accept, nothing changes.</p>
              <button disabled={busy} onclick={() => void run(() => account.space(s.id, 'transfer-cancel'))}>Cancel offer</button>
            {:else}
              {#if s.transfer}<p class="hint">Your offer to {s.transfer.toEmail} expired on {ago(s.transfer.expires)}.</p>{/if}
              <p class="muted">Hand this space to one of its members. They accept within seven days. Then its address becomes <code>their-username/{s.slug}</code> (old links and agents still reach it), you stay as a member, and it counts toward their space allowance instead of yours.</p>
              {#if !s.candidates.length}
                <p class="hint">Ownership can go only to an active member with a public username.</p>
              {:else}
                <form class="row" onsubmit={event => { event.preventDefault(); void run(() => account.space(s.id, 'transfer-offer', { member: transferTo })); }}>
                  <label class="vh" for="settings-transfer">New owner</label>
                  <select id="settings-transfer" bind:value={transferTo}>
                    {#each s.candidates as c (c.id)}<option value={c.id}>{c.username} · {c.email}</option>{/each}
                  </select>
                  <button type="submit" disabled={busy}>Offer ownership</button>
                </form>
              {/if}
            {/if}

            <h3>Delete this space</h3>
            <p class="muted">No one can open it any more: not you, its members or their connected apps. It is kept for 30 days so the site’s operator can restore it if you ask in time, then removed with its history. <a href={downloadAddress(s.space)} download>Download a copy</a> first.</p>
            <form class="row" onsubmit={event => {
              event.preventDefault();
              void run(() => account.space(s.id, 'delete', { name: deleteName }), () => {
                if (current === s.space) location.href = '/app/';
                else go('settings/spaces');
              });
            }}>
              <label class="vh" for="settings-delete-space">Type the space’s name to confirm</label>
              <input id="settings-delete-space" bind:value={deleteName} maxlength="120" autocomplete="off" placeholder="Type {s.name} to confirm" required />
              <button type="submit" class="danger" disabled={busy || deleteName.trim().toLowerCase() !== s.name.trim().toLowerCase()}>Delete space</button>
            </form>
          {/if}

        {:else if (tab || 'spaces') === 'spaces'}
          {#if key && key !== 'new'}<p class="error" role="alert">That space isn’t one of yours, or it was deleted.</p>{/if}
          <h2>Spaces</h2>
          {#if acct.unavailable?.length}<p class="error" role="alert">Some of your spaces can’t be listed just now. Reload shortly.</p>{/if}

          {#if acct.offers.length}
            <h3>Ownership offered to you</h3>
            <ul class="rows">
              {#each acct.offers as o (o.spaceId)}
                <li>
                  <span class="main"><strong>{o.name}</strong><span class="sub">from {o.from} · becomes {acct.username ?? 'your-username'}/{o.slug} · until {ago(o.expires)}</span></span>
                  {#if acct.username}
                    <button class="primary" disabled={busy} title="It counts toward your space allowance; {o.from} stays as a member" onclick={() => void run(() => account.post('/offers/accept', { space: o.spaceId }))}>Take ownership</button>
                  {:else}
                    <button onclick={() => go('settings/profile')}>Choose a username first</button>
                  {/if}
                  <button disabled={busy} onclick={() => void run(() => account.post('/offers/decline', { space: o.spaceId }))}>Decline</button>
                </li>
              {/each}
            </ul>
          {/if}

          {#if acct.invitations.length}
            <h3>Invitations</h3>
            <ul class="rows">
              {#each acct.invitations as i (i.id)}
                <li>
                  <span class="main"><strong>{i.name}</strong><span class="sub">from {i.owner} · until {ago(i.expires)}</span></span>
                  <button class="primary" disabled={busy} onclick={() => void run(() => account.post('/invitations/accept', { space: i.spaceId, invitation: i.id }))}>Accept</button>
                </li>
              {/each}
            </ul>
          {/if}

          <h3>Your spaces <span class="muted">{acct.spaces.length} of {acct.maxSpaces}</span></h3>
          <ul class="rows">
            {#each acct.spaces as s (s.id)}
              <li>
                {#if s.space}
                  <a class="main" href={openAddress(s.space)}><strong>{s.name}</strong><span class="sub mono">{s.space}</span></a>
                  {#if s.web}<span class="pill web" title="Anyone can read it on the website">public</span>{/if}
                  <button onclick={() => go(`settings/spaces/${s.id}`)}>Sharing and settings</button>
                {:else}
                  <span class="main"><strong>{s.name}</strong><span class="sub">Not finished being set up</span></span>
                  <button disabled={busy} onclick={() => retrySpace(s)}>Retry</button>
                {/if}
              </li>
            {:else}
              <li class="empty">You have no spaces of your own yet.</li>
            {/each}
          </ul>

          {#if acct.canCreate}
            <form class="row" onsubmit={createSpace}>
              <label class="vh" for="settings-new-space">New space name</label>
              <input id="settings-new-space" bind:value={newName} maxlength="120" placeholder="New space name" required />
              <button type="submit" class="primary" disabled={busy}>Create space</button>
            </form>
            <p class="hint">The address is made from the name and is permanent: “Bartco Notes” becomes {acct.username}/bartco-notes.</p>
          {:else if !acct.username}
            <p class="hint">To make a space of your own, first <button class="link" onclick={() => go('settings/profile')}>choose a public username</button>.</p>
          {:else}
            <p class="hint">Your space allowance is used.</p>
          {/if}

          <h3>Shared with you</h3>
          <ul class="rows">
            {#each acct.joined as j (j.space)}
              <li>
                {#if j.open}
                  <a class="main" href={openAddress(j.space)}><strong>{j.name}</strong><span class="sub mono">{j.space}</span></a>
                {:else}
                  <span class="main"><strong>{j.name}</strong><span class="sub mono">{j.space}</span></span>
                {/if}
                <span class="pill" class:warn={j.status !== 'active'}>{j.status === 'active' ? 'member' : j.status}</span>
              </li>
            {:else}
              <li class="empty">Nobody has shared a space with you yet.</li>
            {/each}
          </ul>

        {:else if tab === 'profile'}
          <h2>Profile</h2>
          <h3>Public username</h3>
          {#if acct.username}
            <p class="big mono">{acct.username}</p>
            <p class="muted">The name in your space addresses. It is fixed and can’t be changed.</p>
          {:else}
            <p class="muted">The name in your space addresses. You need one to make a space of your own.</p>
            <form class="row" onsubmit={event => { event.preventDefault(); void run(() => account.post('/username', { username })); }}>
              <label class="vh" for="settings-username">Public username</label>
              <input id="settings-username" bind:value={username} minlength="3" maxlength="32" pattern={'[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*'} autocapitalize="none" spellcheck="false" placeholder="your-name" required />
              <button type="submit" disabled={busy}>Save permanent username</button>
            </form>
            <p class="hint">3–32 letters or numbers, with single hyphens between them, saved in lowercase. Choose carefully: once saved, it can’t be changed.</p>
          {/if}

          <h3>Email</h3>
          <p class="big mono">{acct.email}</p>
          <p class="muted">Kept private, for signing in. It is never shown in spaces. <a href="/account/security#email-address">Change it in Security</a>.</p>

          <h3>Delete account</h3>
          {#if acct.unavailable?.includes('spaces')}
            <p class="error">Your spaces can’t be checked just now. Reload shortly.</p>
          {:else if acct.spaces.length}
            <p class="muted">You still own {acct.spaces.length === 1 ? 'a space' : `${acct.spaces.length} spaces`}. Before you can delete your account, delete each one or offer it to a member, in <button class="link" onclick={() => go('settings/spaces')}>Spaces</button>.</p>
          {:else}
            <p class="muted">You are signed out everywhere, and your connected apps and folder actions stop. For 30 days, signing in again cancels it; after that your sign-in methods, memberships, agents and email address are removed. What you wrote in other people’s spaces stays there. You’ll be asked to confirm it’s you.</p>
            <form class="row" onsubmit={event => { event.preventDefault(); void run(() => account.post('/delete', { email: deleteEmail }), n => { if (n.signedOut) location.href = '/login'; }); }}>
              <label class="vh" for="settings-delete-account">Type your email address to confirm</label>
              <input id="settings-delete-account" type="email" bind:value={deleteEmail} maxlength="254" autocomplete="off" placeholder="Type your email address to confirm" required />
              <button type="submit" class="danger" disabled={busy || deleteEmail.trim().toLowerCase() !== acct.email.toLowerCase()}>Delete account</button>
            </form>
          {/if}

        {:else if tab === 'security'}
          <h2>Security</h2>
          <p>Passkeys, the authenticator app, recovery codes, email sign-in, your email address and your signed-in devices are still on the account page for now.</p>
          <a class="button primary" href="/account/security">Open Security</a>

        {:else if tab === 'services'}
          <h2>Services</h2>
          <p>Connected AI apps, agents and GitHub are still on the account page for now.</p>
          <a class="button primary" href="/account/services">Open Services</a>
        {/if}
      </section>
    {/if}
  </div>
</div>

{#if confirm}
  <ConfirmSheet
    reason={confirm.reason}
    onConfirmed={() => { const retry = confirm?.retry; confirm = null; retry?.(); }}
    onCancel={() => (confirm = null)}
  />
{/if}

<style>
  .backdrop { position: fixed; inset: 0; z-index: 3000; display: grid; place-items: center; background: rgb(0 0 0 / .22); }
  .panel {
    position: relative; display: flex; box-sizing: border-box; outline: none;
    width: min(880px, calc(100vw - 48px)); height: min(640px, calc(100vh - 64px));
    background: var(--side-input); color: var(--side-fg); overflow: hidden;
    border: 1px solid var(--side-border); border-radius: 10px; box-shadow: 0 16px 50px rgb(0 0 0 / .28);
    font: 13px/1.45 Inter, "Segoe UI", system-ui, sans-serif;
  }
  .panel.narrow { width: 100vw; height: 100dvh; border: 0; border-radius: 0; flex-direction: column; }
  .x {
    position: absolute; top: 10px; right: 10px; z-index: 1; display: grid; place-items: center; width: 28px; height: 28px; padding: 0;
    color: var(--side-muted); background: none; border: 0; border-radius: 5px; cursor: pointer;
  }
  .x:hover { color: var(--side-fg); background: var(--side-hover); }
  nav { flex: none; display: flex; flex-direction: column; width: 180px; padding: 12px 8px; background: var(--side-bg); border-right: 1px solid var(--side-border); }
  .narrow nav { width: auto; flex: 1; border: 0; padding: 14px 12px; }
  .heading { margin: 2px 8px 10px; font-size: 15px; font-weight: 700; }
  nav button {
    display: flex; justify-content: space-between; align-items: center; width: 100%; padding: 7px 10px; text-align: left;
    font: inherit; color: inherit; background: none; border: 0; border-radius: 6px; cursor: pointer;
  }
  .narrow nav button { padding: 12px; font-size: 15px; border-bottom: 1px solid var(--side-border); border-radius: 0; }
  nav button:hover { background: var(--side-hover); }
  nav button.selected { background: var(--side-accent-soft); font-weight: 600; }
  .chev { color: var(--side-muted); font-size: 18px; }
  .count { min-width: 16px; padding: 0 5px; color: #fff; background: var(--side-accent); border-radius: 8px; font-size: 11px; text-align: center; }
  :global([data-theme="dark"]) .count { color: #1d1a22; }
  .who { margin-top: auto; padding: 8px 10px 0; color: var(--side-muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .content { flex: 1; min-width: 0; overflow: auto; padding: 18px 48px 24px 24px; }
  .narrow .content { padding: 12px 16px 28px; }
  .back, .crumb { margin: 0 0 10px; padding: 4px 0; font: inherit; color: var(--side-accent); background: none; border: 0; cursor: pointer; }
  .narrow .back { font-size: 15px; }
  h2 { margin: 0 0 6px; font-size: 18px; }
  h3 { margin: 22px 0 8px; font-size: 13px; font-weight: 700; }
  h3 .muted { font-weight: 400; }
  p { margin: 0 0 10px; }
  .muted, .hint { color: var(--side-muted); }
  .hint { font-size: 12px; }
  .mono, code { font-family: Consolas, "Cascadia Mono", ui-monospace, monospace; }
  .big { font-size: 15px; }
  .notice { padding: 8px 12px; border-radius: 6px; background: var(--side-accent-soft); }
  .error { color: #c0392b; }
  :global([data-theme="dark"]) .error { color: #ff8a7a; }
  .warning { padding: 10px 12px; border: 1px solid #d9a33b; border-radius: 8px; background: rgb(217 163 59 / .1); }
  .head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; }
  .actions { display: flex; flex-wrap: wrap; gap: 6px; }
  .row { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 6px; }
  .row input, .row select { flex: 1; min-width: 180px; }
  input, select {
    box-sizing: border-box; padding: 6px 8px; font: inherit; color: inherit;
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
  .main { flex: 1; min-width: 160px; display: flex; flex-direction: column; color: inherit; text-decoration: none; }
  a.main:hover strong { text-decoration: underline; }
  .main strong, .sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sub { color: var(--side-muted); font-size: 12px; }
  .member select { flex: none; min-width: 0; padding: 4px 6px; }
  .icon { width: 28px; height: 28px; padding: 0; font-size: 16px; line-height: 1; }
  .pill { padding: 1px 8px; color: var(--side-muted); font-size: 11px; border: 1px solid var(--side-border); border-radius: 9px; white-space: nowrap; }
  .pill.ok { color: #2e7d4f; border-color: #2e7d4f; }
  .pill.web { color: var(--side-accent); border-color: var(--side-accent); }
  .pill.warn { color: #b06d00; border-color: #b06d00; }
  .vh { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
</style>
