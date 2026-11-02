<script lang="ts">
  // Settings → Billing → Storage (Metatrash 0.92.0): what the spaces use against the plan's allowance, and changing
  // the extra storage in 1 GB steps. "Check the price" asks Paddle what the change would cost (in the subscriber's own
  // currency, tax included); the change itself needs a recent sign-in, which run() asks for when the server wants it.
  import { account, AccountError, formatBytes, formatDay, formatMoney, type Billing, type Notice, type StoragePreview } from './siteAccount';

  interface Props {
    billing: Billing;
    /** What the account's spaces take up, when known. */
    used?: number;
    busy: boolean;
    run: (work: () => Promise<Notice>, after?: (n: Notice) => void | Promise<void>) => Promise<void>;
  }
  let { billing, used, busy, run }: Props = $props();

  const current = $derived(billing.storageGb ?? 0);
  const least = $derived(billing.storageMinGb ?? 0);
  const most = $derived(billing.storageMaxGb ?? 100);
  let want = $state(0);
  let preview = $state<StoragePreview | null>(null);
  let checking = $state(false);
  let problem = $state('');

  // Start from what the plan has, and again whenever that changes (after a change, or a reload).
  $effect(() => {
    want = current;
    preview = null;
  });

  const share = $derived(used !== undefined && billing.storage > 0 ? Math.min(1, used / billing.storage) : 0);
  const valid = $derived(Number.isInteger(want) && want >= least && want <= most);

  function step(by: number) {
    want = Math.min(most, Math.max(least, (Number.isInteger(want) ? want : current) + by));
    preview = null;
    problem = '';
  }

  async function check() {
    if (!valid || want === current || checking) return;
    checking = true;
    problem = '';
    try {
      const n = await account.post('/billing/storage', { storageGb: want, preview: true });
      if (n.preview) preview = n.preview;
      else if (n.notice) problem = n.notice;
    } catch (e) {
      problem = e instanceof AccountError || e instanceof Error ? e.message : String(e);
    } finally {
      checking = false;
    }
  }

  function apply() {
    const gb = want;
    void run(() => account.post('/billing/storage', { storageGb: gb }), () => { preview = null; });
  }

  function costLine(p: StoragePreview): string {
    const monthly = formatMoney(p.monthly);
    const from = formatDay(p.nextAt);
    const then = monthly ? `${monthly} a ${p.interval === 'year' ? 'year' : 'month'}${from ? ` from ${from}` : ''}` : '';
    if (p.trial) return `Nothing to pay during your trial.${then ? ` After it, your plan is ${then}.` : ''}`;
    if (p.storageGb < current) {
      return `${then ? `Your plan becomes ${then}. ` : ''}Paddle credits the unused part of this ${p.interval === 'year' ? 'year' : 'month'} to your next bill.`;
    }
    const now = p.now && Number(p.now.amount) > 0 ? formatMoney(p.now) : '';
    if (now) return `${now} now for the rest of this ${p.interval === 'year' ? 'year' : 'month'}${then ? `, then ${then}` : ''}.`;
    return then ? `Nothing to pay now. Your plan becomes ${then}.` : 'Nothing to pay now.';
  }
</script>

<p class="storage">
  {#if used !== undefined}
    Your spaces use <strong>{formatBytes(used)}</strong> of <strong>{formatBytes(billing.storage)}</strong>{#if current}{' '}(1 GB with the plan and {current} GB extra){/if}.
  {:else}
    Your plan includes <strong>{formatBytes(billing.storage)}</strong>{#if current}: 1 GB with the plan and {current} GB extra{/if}.
  {/if}
</p>
{#if used !== undefined}
  <div class="meter" class:full={share >= 0.95} class:high={share >= 0.8 && share < 0.95} role="meter" aria-label="Storage used" aria-valuemin="0" aria-valuemax={billing.storage} aria-valuenow={used}>
    <span style:width={`${(share * 100).toFixed(1)}%`}></span>
  </div>
{/if}

{#if billing.storageChange}
  <div class="change">
    <label for="extra-storage">Extra storage</label>
    <div class="stepper">
      <button type="button" aria-label="1 GB less" disabled={busy || want <= least} onclick={() => step(-1)}>−</button>
      <input id="extra-storage" type="number" inputmode="numeric" min={least} max={most} step="1" bind:value={want} oninput={() => { preview = null; problem = ''; }} />
      <span>GB</span>
      <button type="button" aria-label="1 GB more" disabled={busy || want >= most} onclick={() => step(1)}>+</button>
    </div>
    <button type="button" disabled={busy || checking || !valid || want === current} onclick={() => void check()}>{checking ? 'Asking Paddle…' : 'Check the price'}</button>
  </div>
  {#if !valid && want !== current}
    <p class="hint">Choose a whole number from {least} to {most}.</p>
  {/if}
  {#if least > 0}
    <p class="hint">Your spaces use more than the plan’s 1 GB, so you need at least {least} GB extra. Delete files or spaces to go lower.</p>
  {/if}
  {#if problem}
    <p class="error" role="alert">{problem}</p>
  {/if}
  {#if preview && preview.storageGb === want}
    <div class="quote">
      <p><strong>{want === 0 ? 'Remove extra storage' : `${want} GB extra`}</strong>: {costLine(preview)}</p>
      <p class="hint">Amounts include any tax and are in the currency Paddle bills you in.</p>
      <div class="actions">
        <button type="button" class="primary" disabled={busy} onclick={apply}>{want === 0 ? 'Remove it' : want > current ? `Add ${want - current} GB` : `Change to ${want} GB`}</button>
        <button type="button" disabled={busy} onclick={() => (preview = null)}>Cancel</button>
      </div>
    </div>
  {/if}
{:else if billing.plan === 'comped'}
  <p class="hint">Your plan is free of charge, so its storage is set for you. Ask us if you need more.</p>
{:else if billing.status === 'past_due'}
  <p class="hint">Extra storage can be changed once your card is updated in Manage subscription.</p>
{:else if billing.status === 'read_only'}
  <p class="hint">Extra storage can be changed once your subscription is resumed in Manage subscription.</p>
{:else if billing.plan === 'trial' || billing.plan === 'individual'}
  <p class="hint">Extra storage can’t be changed from here on this server yet.</p>
{/if}

<style>
  .meter { height: 8px; border-radius: 999px; background: var(--side-hover, rgba(127, 127, 127, 0.15)); overflow: hidden; margin: 4px 0 12px; max-width: 420px; }
  .meter span { display: block; height: 100%; background: var(--side-accent); border-radius: inherit; }
  .meter.high span { background: #c98a12; }
  .meter.full span { background: #c0392b; }
  .change { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin: 8px 0; }
  .change label { font-weight: 600; }
  .stepper { display: inline-flex; align-items: center; gap: 4px; }
  .stepper button { width: 32px; padding-left: 0; padding-right: 0; }
  .stepper input { width: 64px; text-align: center; }
  .quote { border: 1px solid var(--side-border); border-radius: 8px; padding: 10px 12px; margin: 8px 0; max-width: 520px; }
  .quote p { margin: 0 0 6px; }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
  p { margin: 0 0 10px; }
  .hint { color: var(--side-muted); font-size: 12px; }
  .error { color: #c0392b; }
  :global([data-theme="dark"]) .error { color: #ff8a7a; }
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
</style>
