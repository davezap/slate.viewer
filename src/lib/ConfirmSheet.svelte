<script lang="ts">
  // metatrash.com: Confirm it's you. Some changes (making a space readable on the web, offering
  // or deleting a space, deleting the account) need a sign-in within the last 10 minutes; this
  // sheet confirms with a passkey, the authenticator app or an emailed code, which a script in
  // the page can't do for the person. Then the change is tried again.
  import { onMount, tick } from 'svelte';
  import { account, passkeyAssertion, passkeyProblem, passkeysSupported, type ConfirmWays } from './siteAccount';

  interface Props {
    /** Why: the server's message for the change that needs it. */
    reason: string;
    onConfirmed: () => void;
    onCancel: () => void;
  }
  let { reason, onConfirmed, onCancel }: Props = $props();

  let ways = $state<ConfirmWays | null>(null);
  let failed = $state('');
  let error = $state('');
  let busy = $state(false);
  let sent = $state(false);
  let totpCode = $state('');
  let emailCode = $state('');
  let sheet = $state<HTMLDivElement>();

  onMount(() => {
    void account.confirmWays().then(w => {
      ways = w;
      sent = !!w.sent;
      if (w.fresh) onConfirmed();
      void tick().then(() => (sheet?.querySelector('input, button.primary') as HTMLElement | null)?.focus());
    }, e => (failed = e instanceof Error ? e.message : String(e)));
  });

  async function attempt(work: () => Promise<unknown>) {
    if (busy) return;
    busy = true;
    error = '';
    try {
      await work();
      onConfirmed();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  function withPasskey() {
    if (!ways?.passkey) return;
    const options = ways.passkey;
    void attempt(async () => {
      let fields: Record<string, string>;
      try {
        fields = await passkeyAssertion(options);
      } catch (e) {
        throw new Error(passkeyProblem(e));
      }
      try {
        await account.post('/confirm/passkey', fields);
      } finally {
        // A passkey challenge is used once: fetch a new one for another try.
        void account.confirmWays().then(w => { if (ways) ways.passkey = w.passkey; }, () => {});
      }
    });
  }

  async function sendCode() {
    if (busy) return;
    busy = true;
    error = '';
    try {
      await account.post('/confirm/send');
      sent = true;
      await tick();
      (sheet?.querySelector('#confirm-email-code') as HTMLInputElement | null)?.focus();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!busy) onCancel(); }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" onclick={() => !busy && onCancel()} onkeydown={onKeydown}>
  <div class="sheet" bind:this={sheet} role="dialog" aria-modal="true" aria-labelledby="confirm-title" tabindex="-1" onclick={event => event.stopPropagation()}>
    <h2 id="confirm-title">Confirm it’s you</h2>
    <p class="muted">{reason} It lasts 10 minutes.</p>
    {#if failed}
      <p class="error" role="alert">This can’t be confirmed just now: {failed}</p>
    {:else if !ways}
      <p class="muted">Loading…</p>
    {:else}
      {#if ways.passkey && passkeysSupported()}
        <button class="primary wide" disabled={busy} onclick={withPasskey}>Use a passkey</button>
      {/if}
      {#if ways.totp}
        <form onsubmit={event => { event.preventDefault(); void attempt(() => account.post('/confirm/totp', { code: totpCode })); }}>
          <label for="confirm-totp">Code from your authenticator app</label>
          <div class="row">
            <input id="confirm-totp" bind:value={totpCode} inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern={'[0-9]{6}'} required />
            <button type="submit" disabled={busy}>Confirm</button>
          </div>
        </form>
      {/if}
      {#if ways.email}
        {#if !sent}
          <div class="email">
            <span>{ways.totp || (ways.passkey && passkeysSupported()) ? 'Or a' : 'A'} code by email to <strong>{ways.address}</strong></span>
            <button disabled={busy} onclick={() => void sendCode()}>Email me a code</button>
          </div>
        {:else}
          <form onsubmit={event => { event.preventDefault(); void attempt(() => account.post('/confirm/verify', { code: emailCode })); }}>
            <label for="confirm-email-code">Code we emailed to {ways.address}</label>
            <div class="row">
              <input id="confirm-email-code" bind:value={emailCode} inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern={'[0-9]{6}'} required />
              <button type="submit" disabled={busy}>Confirm</button>
            </div>
            <button type="button" class="link" disabled={busy} onclick={() => void sendCode()}>Send a new code</button>
          </form>
        {/if}
      {/if}
      {#if !ways.email && !ways.totp && !(ways.passkey && passkeysSupported())}
        <p class="muted">This browser can’t use your passkeys here. Sign out and sign in again, then try once more.</p>
      {/if}
      {#if error}<p class="error" role="alert">{error}</p>{/if}
    {/if}
    <div class="foot"><button disabled={busy} onclick={onCancel}>Cancel</button></div>
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; z-index: 3200; display: grid; place-items: center; background: rgb(0 0 0 / .28); }
  .sheet {
    box-sizing: border-box; width: min(420px, calc(100vw - 24px)); padding: 18px 20px 14px; outline: none;
    background: var(--side-input); color: var(--side-fg); border: 1px solid var(--side-border); border-radius: 10px;
    box-shadow: 0 16px 50px rgb(0 0 0 / .3); font: 13px/1.45 Inter, "Segoe UI", system-ui, sans-serif;
  }
  h2 { margin: 0 0 6px; font-size: 16px; }
  p { margin: 0 0 12px; }
  .muted { color: var(--side-muted); }
  .error { color: #c0392b; }
  :global([data-theme="dark"]) .error { color: #ff8a7a; }
  form, .email { margin: 0 0 12px; }
  label { display: block; margin-bottom: 4px; }
  .row { display: flex; gap: 6px; }
  .email { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: space-between; }
  input {
    flex: 1; min-width: 0; padding: 6px 8px; font: inherit; color: inherit; letter-spacing: .1em;
    background: var(--side-bg); border: 1px solid var(--side-border); border-radius: 6px; outline: none;
  }
  input:focus { border-color: var(--side-accent); }
  button {
    padding: 6px 14px; font: inherit; color: inherit; background: var(--side-bg);
    border: 1px solid var(--side-border); border-radius: 6px; cursor: pointer;
  }
  button:hover:not(:disabled) { background: var(--side-hover); }
  button:disabled { opacity: .55; cursor: default; }
  button.primary { color: #fff; background: var(--side-accent); border-color: var(--side-accent); }
  :global([data-theme="dark"]) button.primary { color: #1d1a22; }
  .wide { width: 100%; margin-bottom: 14px; padding: 8px; }
  .link { margin-top: 4px; padding: 0; border: 0; background: none; color: var(--side-accent); }
  .link:hover:not(:disabled) { background: none; text-decoration: underline; }
  .foot { display: flex; justify-content: flex-end; margin-top: 4px; }
</style>
