<script lang="ts">
  // metatrash.com: Settings → Security (Metatrash 0.81.0), in place of /account/security: email
  // codes, the email address, passkeys, Microsoft accounts, the authenticator app, recovery codes
  // and signed-in devices, one page each (#settings/security/<page>, 0.84.0). Changing the email address or a sign-in method needs a sign-in within
  // the last 10 minutes: the change asks the person to confirm it's them, then runs again.
  import { onMount } from 'svelte';
  import {
    account, AccountError, passkeyCreation, passkeyProblem, passkeysSupported,
    type Notice, type Security,
  } from './siteAccount';

  interface Props {
    /** The page: email, passkeys, totp, microsoft, recovery or devices. */
    page: string;
    /** Asks the person to confirm it's them, then runs retry. */
    onConfirm: (reason: string, retry: () => void) => void;
    /** Shows a change's result at the top of the dialog; errors stay until closed. */
    onNotice: (text: string, error?: boolean) => void;
    /** The account's email address changed. */
    onChanged: () => void;
  }
  let { page: asked, onConfirm, onNotice, onChanged }: Props = $props();

  /** Security's pages (0.84.0), in the order the Settings sidebar lists them. */
  const PAGES = {
    email: 'Email', passkeys: 'Passkeys', totp: 'Authenticator app', microsoft: 'Microsoft accounts',
    recovery: 'Recovery codes', devices: 'Signed-in devices',
  } as const;
  const page = $derived<keyof typeof PAGES>(asked in PAGES ? (asked as keyof typeof PAGES) : 'email');

  const STEP_UP = 'Changing your email address or how you sign in needs a sign-in within the last 10 minutes. Confirm it’s you first.';

  let sec = $state<Security | null>(null);
  let loadError = $state('');
  let busy = $state(false);
  /** New recovery codes: kept while the panel is open, as the server shows them only once. */
  let codes = $state<string[]>([]);
  let copied = $state(false);

  // Inline steps and fields.
  let removing = $state('');
  let renaming = $state('');
  let rename = $state('');
  let passkeyName = $state('');
  let newEmail = $state('');
  let emailCode = $state('');
  let totpCode = $state('');

  async function load() {
    try {
      const s = await account.security();
      sec = s;
      loadError = '';
      if (s.newRecoveryCodes?.length) codes = s.newRecoveryCodes;
      if (s.notice) onNotice(s.notice);
    } catch (e) {
      loadError = e instanceof Error ? e.message : String(e);
    }
  }
  onMount(() => void load());

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
      onNotice(n.notice ?? '');
      removing = '';
      after?.(n);
      await load();
    } catch (e) {
      if (e instanceof AccountError && e.code === 'step_up_needed') onConfirm(e.message, () => void run(work, after));
      else onNotice(e instanceof Error ? e.message : String(e), true);
    } finally {
      busy = false;
    }
  }

  const secure = (path: string, body: Record<string, unknown> = {}) => () => account.secure(path, body);

  /** Confirm it's you, with nothing to run after but showing the new state. */
  function confirmNow() {
    onConfirm(STEP_UP, () => void load());
  }

  async function addPasskey(event?: SubmitEvent) {
    event?.preventDefault();
    if (busy || !sec) return;
    if (!passkeysSupported()) {
      onNotice('This browser does not support passkeys.', true);
      return;
    }
    if (!sec.fresh || !sec.createOptions) {
      onConfirm('Adding a passkey needs a sign-in within the last 10 minutes. Confirm it’s you first.', async () => {
        await load();
        if (sec?.fresh && sec.createOptions) void addPasskey();
      });
      return;
    }
    busy = true;
    let fields: Record<string, string>;
    try {
      onNotice('Follow your browser’s prompts…');
      fields = await passkeyCreation(sec.createOptions);
    } catch (e) {
      onNotice(passkeyProblem(e), true);
      return;
    } finally {
      busy = false;
    }
    void run(secure('passkeys/add', { name: passkeyName, ...fields }), () => (passkeyName = ''));
  }

  async function copyCodes() {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      /* the codes stay selectable */
    }
  }

  const appOn = $derived(!!sec?.totp?.enabled);
</script>

<h2>{PAGES[page]}{#if sec}{#if page === 'passkeys'} <span class="muted">{sec.passkeys.length} of 20</span>{:else if page === 'microsoft' && sec.microsoft} <span class="muted">{sec.microsoft.accounts.length} of 10</span>{:else if page === 'recovery' && sec.recovery} <span class="muted">{sec.recovery} of 10 left</span>{:else if page === 'devices'} <span class="muted">{sec.sessions.length}</span>{/if}{/if}</h2>
{#if page === 'passkeys'}
  <p class="muted">A passkey lets you sign in with your fingerprint, face, device PIN or password manager instead of an emailed code. It is faster, and it only works on this site, so it can’t be phished.</p>
{:else if page === 'totp'}
  <p class="muted">An app on your phone that shows a new six-digit code every 30 seconds. You sign in with your email address and the code.</p>
{/if}

{#if loadError}
  <p class="error" role="alert">Sign-in methods can’t be loaded just now: {loadError}</p>
  <button onclick={() => void load()}>Try again</button>
{:else if !sec}
  <p class="muted">Loading…</p>
{:else}
  {@const s = sec}
  {#if page !== 'devices'}
  {#if s.fresh}
    <p class="status ok">You can change your email address and sign-in methods for the next {s.minutes} {s.minutes === 1 ? 'minute' : 'minutes'}.</p>
  {:else}
    <div class="status">
      <p>Changing your email address or sign-in methods needs a sign-in within the last 10 minutes. You’ll be asked to confirm it’s you.</p>
      <button onclick={confirmNow}>Confirm it’s you now</button>
    </div>
  {/if}
  {/if}

  {#if page === 'email'}
  <h3 id="email-address">Email address</h3>
  <p class="big mono">{s.email}</p>
  {#if s.emailChangeTo}
    <p>We’ve sent a code to <strong class="mono">{s.emailChangeTo}</strong>. Enter it within ten minutes to make that your email address.</p>
    <form class="row" onsubmit={event => { event.preventDefault(); void run(secure('email/verify', { code: emailCode }), () => { emailCode = ''; onChanged(); }); }}>
      <label class="vh" for="security-email-code">Code from the email</label>
      <input id="security-email-code" bind:value={emailCode} inputmode="numeric" pattern={'[0-9]{6}'} minlength="6" maxlength="6" autocomplete="one-time-code" placeholder="6-digit code" required />
      <button type="submit" class="primary" disabled={busy}>Change address</button>
      <button type="button" disabled={busy} onclick={() => void run(secure('email/cancel'))}>Cancel</button>
    </form>
  {:else}
    <p class="muted">You sign in, confirm changes and get notices and invitations at this address.</p>
    <form class="row" onsubmit={event => { event.preventDefault(); void run(secure('email/change', { email: newEmail }), () => (newEmail = '')); }}>
      <label class="vh" for="security-new-email">New email address</label>
      <input id="security-new-email" type="email" bind:value={newEmail} maxlength="254" autocomplete="email" placeholder="New email address" required />
      <button type="submit" disabled={busy}>Send a code</button>
    </form>
    <p class="hint">We email a code to the new address to check it’s yours. Once you enter it, you sign in and get notices there, and we tell this address about the change.</p>
  {/if}

  <h3 id="email-login">Email codes <span class="pill" class:ok={s.emailLogin}>{s.emailLogin ? 'on' : 'off'}</span></h3>
  {#if s.emailLogin}
    <p>You can sign in with a code emailed to <strong class="mono">{s.email}</strong>.{s.strong ? ' Turning this off means someone who gets into your email can’t sign in as you.' : ''}</p>
    {#if s.canTurnOffEmail}
      <button disabled={busy} onclick={() => void run(secure('email-login', { email_login: 'off' }))}>Turn off email sign-in</button>
      <p class="hint">Keep your recovery codes safe: if you lose them as well as your passkeys and authenticator app, you can’t sign in.</p>
    {:else}
      <p class="hint">To turn it off, first {s.strong ? 'create recovery codes' : 'add a passkey or an authenticator app, and create recovery codes'}.</p>
    {/if}
  {:else}
    <p>Emailed codes don’t sign in to your account or confirm changes. Sign in with {s.passkeys.length ? `a passkey${appOn ? ', your authenticator app' : ''}` : 'your authenticator app'} or a recovery code.</p>
    <button disabled={busy} onclick={() => void run(secure('email-login', { email_login: 'on' }))}>Turn email sign-in back on</button>
  {/if}

  {:else if page === 'passkeys'}
  <ul class="rows">
    {#each s.passkeys as p (p.id)}
      <li>
        <span class="main">
          <strong>{p.name}{#if p.synced} <span class="pill">synced</span>{/if}</strong>
          <span class="sub">Added {p.created} · last used {p.lastUsed}</span>
        </span>
        {#if removing === p.id}
          <button class="danger" disabled={busy} onclick={() => void run(secure('passkeys/remove', { passkey: p.id }))}>Remove this passkey</button>
          <button disabled={busy} onclick={() => (removing = '')}>Keep</button>
          <p class="hint full">You will no longer be able to sign in with this passkey. Also delete it from the device or password manager that holds it.</p>
        {:else if renaming === p.id}
          <form class="row full" onsubmit={event => { event.preventDefault(); void run(secure('passkeys/rename', { passkey: p.id, name: rename }), () => (renaming = '')); }}>
            <label class="vh" for="rename-{p.id}">New name</label>
            <input id="rename-{p.id}" bind:value={rename} maxlength="64" required />
            <button type="submit" disabled={busy}>Save name</button>
            <button type="button" disabled={busy} onclick={() => (renaming = '')}>Cancel</button>
          </form>
        {:else}
          <button disabled={busy} onclick={() => { renaming = p.id; rename = p.name; }}>Rename…</button>
          <button disabled={busy} onclick={() => (removing = p.id)}>Remove…</button>
        {/if}
      </li>
    {:else}
      <li class="empty">No passkeys yet.</li>
    {/each}
  </ul>
  {#if s.maxPasskeys}
    <p class="hint">You have the maximum of 20 passkeys.</p>
  {:else}
    <form class="row" onsubmit={addPasskey}>
      <label class="vh" for="security-passkey-name">Name for the new passkey</label>
      <input id="security-passkey-name" bind:value={passkeyName} maxlength="64" placeholder="Name, such as Pixel phone or iCloud Keychain" />
      <button type="submit" disabled={busy}>Add a passkey</button>
    </form>
    <p class="hint">The name helps you tell your passkeys apart. Your browser then asks where to save it: this device, your phone or a password manager.</p>
  {/if}

  {:else if page === 'microsoft'}
    {#if s.microsoft}
    {@const m = s.microsoft}
    {#if m.waiting}
      <div class="warning">
        <p><strong>Link {m.waiting}?</strong> This browser signed in with the Microsoft account <strong class="mono">{m.waiting}</strong>. Link it to this Metatrash account only if it is yours: whoever has it can then sign in as you.</p>
        <div class="actions">
          <button class="primary" disabled={busy} onclick={() => void run(secure('microsoft/confirm'))}>Link this Microsoft account</button>
          <button disabled={busy} onclick={() => void run(secure('microsoft/forget'))}>Don’t link it</button>
        </div>
      </div>
    {/if}
    <ul class="rows">
      {#each m.accounts as id (id.id)}
        <li>
          <span class="main"><strong>{id.label}</strong><span class="sub">Linked {id.created} · last used {id.lastUsed}</span></span>
          {#if removing === id.id}
            <button class="danger" disabled={busy} onclick={() => void run(secure('microsoft/remove', { identity: id.id }))}>Remove this Microsoft account</button>
            <button disabled={busy} onclick={() => (removing = '')}>Keep</button>
          {:else}
            <button disabled={busy} onclick={() => (removing = id.id)}>Remove…</button>
          {/if}
        </li>
      {:else}
        <li class="empty">No Microsoft accounts linked.</li>
      {/each}
    </ul>
    {#if m.max}
      <p class="hint">You have the maximum of 10 Microsoft accounts.</p>
    {:else}
      <button disabled={busy} onclick={() => void run(secure('microsoft/link'))}>Link a Microsoft account</button>
      <p class="hint">Sign in with a work, school or personal Microsoft account to use it as another way to sign in here.</p>
    {/if}
      {:else}
      <p class="muted">Signing in with Microsoft isn’t available on this server.</p>
    {/if}
  {:else if page === 'totp'}
    {#if s.totp}
    {@const t = s.totp}
    {#if t.enabled}
      <ul class="rows">
        <li>
          <span class="main"><strong>Authenticator app</strong><span class="sub">Added {t.added} · last used {t.lastUsed}</span></span>
          {#if removing === 'totp'}
            <button class="danger" disabled={busy} onclick={() => void run(secure('totp/remove'))}>Remove the authenticator app</button>
            <button disabled={busy} onclick={() => (removing = '')}>Keep</button>
            <p class="hint full">Its codes will no longer sign you in. Also delete Metatrash from the app.</p>
          {:else}
            <button disabled={busy} onclick={() => (removing = 'totp')}>Remove…</button>
          {/if}
        </li>
      </ul>
    {:else if t.pending}
      <div class="totp">
        {#if t.qr}<img class="qr" src={t.qr} alt="QR code for your authenticator app" width="180" height="180" />{/if}
        <div>
          <ol>
            <li>Open your authenticator app (such as Google Authenticator, Microsoft Authenticator, 1Password or Authy) and scan this QR code.</li>
            <li>Can’t scan it? Add an account by hand with this setup key: <code class="secret">{t.secret}</code></li>
            <li>Enter the six-digit code the app now shows for Metatrash.</li>
          </ol>
          <form class="row" onsubmit={event => { event.preventDefault(); void run(secure('totp/enable', { code: totpCode }), () => (totpCode = '')); }}>
            <label class="vh" for="security-totp-code">Code from the app</label>
            <input id="security-totp-code" bind:value={totpCode} inputmode="numeric" pattern={'[0-9]{6}'} minlength="6" maxlength="6" autocomplete="one-time-code" placeholder="6-digit code" required />
            <button type="submit" class="primary" disabled={busy}>Turn on</button>
            <button type="button" disabled={busy} onclick={() => void run(secure('totp/remove'))}>Cancel setup</button>
          </form>
          <p class="hint">Keep the setup key private: anyone who has it can make your codes.</p>
        </div>
      </div>
    {:else}
      <button disabled={busy} onclick={() => void run(secure('totp/start'))}>Set up an authenticator app</button>
    {/if}
      {:else}
      <p class="muted">Authenticator apps aren’t available on this server.</p>
    {/if}
  {:else if page === 'recovery'}
  {#if codes.length}
    <div class="warning">
      <p><strong>Save these codes now. They are shown only this once.</strong> Each one signs you in once, with your email address, if you lose your passkeys and authenticator app.</p>
      <ol class="codes">{#each codes as c (c)}<li><code>{c}</code></li>{/each}</ol>
      <button onclick={() => void copyCodes()}>{copied ? 'Copied' : 'Copy the codes'}</button>
      <p class="hint">Print them or keep them in a password manager, somewhere other than this device. Creating new codes makes these stop working.</p>
    </div>
  {:else if s.recovery}
    <p class="muted">Created {s.recoveryCreated}. Each code signs you in once, with your email address, if you lose your passkeys and authenticator app. They are not shown again.</p>
    {#if !s.emailLogin && s.recovery <= 3}<p class="warning">Only {s.recovery} {s.recovery === 1 ? 'code is' : 'codes are'} left, and email sign-in is off. Create new codes.</p>{/if}
  {:else}
    <p class="muted">Recovery codes let you sign in if you lose your passkeys and authenticator app. You need them before you can turn off email sign-in.</p>
  {/if}
  <button disabled={busy} onclick={() => void run(secure('recovery/create'))}>{s.recovery || codes.length ? 'Create new codes' : 'Create recovery codes'}</button>
  {#if s.recovery}<p class="hint">Your current codes stop working when you create new ones.</p>{/if}

  {:else}
  <ul class="rows">
    {#each s.sessions as d (d.id)}
      <li>
        <span class="main">
          <strong>{d.device}{#if d.current} <span class="pill ok">this device</span>{/if}</strong>
          <span class="sub">Signed in {d.signedIn} · last used {d.lastUsed} · from {d.ip || 'unknown'}</span>
        </span>
        {#if !d.current}<button disabled={busy} aria-label="Sign out {d.device}, signed in {d.signedIn}" onclick={() => void run(secure('sessions/remove', { session: d.id }))}>Sign out</button>{/if}
      </li>
    {/each}
  </ul>
  {#if s.otherSessions}
    <button disabled={busy} onclick={() => void run(secure('sessions/end'))}>Sign out everywhere else</button>
  {:else}
    <p class="muted">Only this device is signed in.</p>
  {/if}
  <p class="hint">Sessions last 24 hours. Removing a passkey or the authenticator app, turning off email sign-in, changing your email address or signing in with a recovery code also signs out every other device.</p>
  {/if}
{/if}

<style>
  h2 { margin: 0 0 6px; font-size: 18px; }
  h2 .muted { margin-left: 4px; font-size: 13px; font-weight: 400; }
  h3 .pill { margin-left: 6px; font-weight: 400; }
  h3 { margin: 22px 0 8px; font-size: 13px; font-weight: 700; }
  p { margin: 0 0 10px; }
  .muted, .hint { color: var(--side-muted); }
  .hint { font-size: 12px; }
  .mono, code { font-family: Consolas, "Cascadia Mono", ui-monospace, monospace; }
  .big { font-size: 15px; }
  .error { color: #c0392b; }
  :global([data-theme="dark"]) .error { color: #ff8a7a; }
  .status { margin: 10px 0 14px; padding: 10px 12px; border: 1px solid var(--side-border); border-radius: 8px; }
  .status p { margin: 0 0 8px; }
  p.status.ok { border-color: #2e7d4f; }
  .warning { margin: 0 0 10px; padding: 10px 12px; border: 1px solid #d9a33b; border-radius: 8px; background: rgb(217 163 59 / .1); }
  .actions { display: flex; flex-wrap: wrap; gap: 6px; }
  .row { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 8px; }
  .row input { flex: 1; min-width: 180px; }
  .full { flex-basis: 100%; }
  input {
    box-sizing: border-box; min-width: 0; padding: 6px 8px; font: inherit; color: inherit;
    background: var(--side-bg); border: 1px solid var(--side-border); border-radius: 6px; outline: none;
  }
  input:focus { border-color: var(--side-accent); }
  button {
    display: inline-block; padding: 6px 12px; font: inherit; color: inherit; white-space: nowrap;
    background: var(--side-bg); border: 1px solid var(--side-border); border-radius: 6px; cursor: pointer;
  }
  button:hover:not(:disabled) { background: var(--side-hover); }
  button:disabled { opacity: .5; cursor: default; }
  .primary { color: #fff; background: var(--side-accent); border-color: var(--side-accent); }
  .primary:hover:not(:disabled) { background: var(--side-accent); filter: brightness(1.08); }
  :global([data-theme="dark"]) .primary { color: #1d1a22; }
  .danger { color: #fff; background: #c0392b; border-color: #c0392b; }
  .danger:hover:not(:disabled) { background: #a93226; }
  .rows { margin: 0 0 8px; padding: 0; list-style: none; border: 1px solid var(--side-border); border-radius: 8px; }
  .rows li { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; padding: 8px 10px; border-top: 1px solid var(--side-border); }
  .rows li:first-child { border-top: 0; }
  .rows li.empty { color: var(--side-muted); }
  .main { flex: 1; min-width: 160px; display: flex; flex-direction: column; }
  .main strong, .sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sub { color: var(--side-muted); font-size: 12px; }
  .pill { padding: 1px 8px; color: var(--side-muted); font-size: 11px; font-weight: 400; border: 1px solid var(--side-border); border-radius: 9px; white-space: nowrap; }
  .pill.ok { color: #2e7d4f; border-color: #2e7d4f; }
  strong .pill { margin-left: 4px; }
  .totp { display: flex; flex-wrap: wrap; gap: 14px; align-items: flex-start; margin: 0 0 10px; }
  .totp > div { flex: 1; min-width: 220px; }
  .totp ol { margin: 0 0 10px; padding-left: 20px; }
  .totp li { margin: 0 0 6px; }
  /* The QR code stays black on white in both themes, so every app can scan it. */
  .qr { flex: none; padding: 8px; background: #fff; border-radius: 6px; }
  .secret { overflow-wrap: anywhere; user-select: all; }
  .codes { columns: 2; margin: 0 0 10px; padding-left: 24px; }
  .codes code { user-select: all; }
  .vh { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
</style>
