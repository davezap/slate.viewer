<script lang="ts">
  // metatrash.com/pricing (and /checkout, Paddle's default payment link) and /welcome.
  // Prices come from Paddle.PricePreview and are shown exactly as Paddle formats them
  // (formattedTotals): no sums, no rounding, no reformatting here. Subscribe opens Paddle's
  // one-page checkout in an overlay; a completed checkout goes to /welcome (successUrl).
  import { onMount } from 'svelte';
  import { initializePaddle, type Paddle, type PricePreviewResponse, type CheckoutOpenLineItem } from '@paddle/paddle-js';
  import { readPricingConfig, pricesFor, type Cycle, type PricingConfig } from './config';
  import { plan, storageAddOn } from './plans';

  type Line = PricePreviewResponse['data']['details']['lineItems'][number];

  let config = $state<PricingConfig | null>(null);
  let problem = $state('');
  let paddle = $state<Paddle | null>(null);
  // Monthly or yearly (Metatrash 0.93.0). The page offers Yearly only when the server names
  // yearly prices. Each cycle's lines are kept, so switching shows the other price at once.
  let cycle = $state<Cycle>('month');
  let lines = $state<Record<Cycle, { plan: Line | null; storage: Line | null }>>({
    month: { plan: null, storage: null },
    year: { plan: null, storage: null },
  });
  const hasYearly = $derived(!!config && pricesFor(config, 'year') !== null);
  const planLine = $derived(lines[cycle].plan);
  const storageLine = $derived(lines[cycle].storage);
  const per = $derived(cycle === 'year' ? 'year' : 'month');
  let currency = $state('');
  let loading = $state(true);
  let extraGB = $state(0);
  let previewProblem = $state('');

  // The theme chosen in the site app (theme.js set it before the page painted). Paddle's
  // checkout has light and dark; paper reads as light.
  const checkoutTheme = (): 'light' | 'dark' => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

  const settings = () => ({
    displayMode: 'overlay' as const,
    variant: 'one-page' as const,
    successUrl: config!.welcome,
    theme: checkoutTheme(),
  });

  // Only the newest preview may show: a slow answer for an old GB count must not replace a newer one.
  let previewSeq = 0;
  async function preview(gb: number) {
    if (!paddle || !config) return;
    const seq = ++previewSeq;
    previewProblem = '';
    try {
      // One preview per cycle: the plan and storage of a subscription share its cycle.
      const cycles: Cycle[] = pricesFor(config, 'year') ? ['month', 'year'] : ['month'];
      const results = await Promise.all(cycles.map(c => {
        const ids = pricesFor(config!, c)!;
        return paddle!.PricePreview({
          items: [
            { priceId: ids.plan, quantity: 1 },
            // Always at least 1, for the price of 1 GB; the chosen count when there is one.
            { priceId: ids.storage, quantity: Math.max(1, gb) },
          ],
          // Cloudflare's country when there is one. Otherwise nothing: Paddle finds the
          // visitor's country from their IP address.
          ...(config!.country ? { address: { countryCode: config!.country } } : {}),
        });
      }));
      if (seq !== previewSeq) return;
      const next = { month: { plan: null, storage: null }, year: { plan: null, storage: null } } as typeof lines;
      cycles.forEach((c, i) => {
        const ids = pricesFor(config!, c)!;
        const found = results[i].data.details.lineItems;
        next[c] = { plan: found.find(l => l.price.id === ids.plan) ?? null, storage: found.find(l => l.price.id === ids.storage) ?? null };
      });
      lines = next;
      currency = results[0].data.currencyCode;
    } catch (err) {
      if (seq !== previewSeq) return;
      previewProblem = 'Prices could not be loaded just now. Reload the page to try again.';
      console.error('Paddle price preview failed', err);
    } finally {
      if (seq === previewSeq) loading = false;
    }
  }

  let previewTimer: ReturnType<typeof setTimeout> | undefined;
  function setExtra(gb: number) {
    extraGB = Math.min(storageAddOn.max, Math.max(0, Math.trunc(Number.isFinite(gb) ? gb : 0)));
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => void preview(extraGB), 250);
  }

  function subscribe() {
    if (!paddle || !config || config.subscribed) return;
    const ids = pricesFor(config, cycle) ?? pricesFor(config, 'month')!;
    const items: CheckoutOpenLineItem[] = [{ priceId: ids.plan, quantity: 1 }];
    if (storageAddOn.atSignup && extraGB > 0) items.push({ priceId: ids.storage, quantity: extraGB });
    paddle.Checkout.open({
      items,
      settings: settings(),
      ...(config.email ? { customer: { email: config.email } } : {}),
      // For later (phase 3): a webhook can tell whose subscription this is.
      ...(config.userId ? { customData: { metatrash_user_id: config.userId } } : {}),
    });
  }

  onMount(() => {
    try {
      config = readPricingConfig();
    } catch (err) {
      problem = err instanceof Error ? err.message : String(err);
      loading = false;
      return;
    }
    if (config.page !== 'pricing') return;
    void (async () => {
      try {
        // Loads Paddle.js from Paddle's CDN. A page opened from a Paddle payment link
        // (?_ptxn=txn_...) opens that transaction's checkout by itself, with these settings.
        const instance = await initializePaddle({
          environment: config!.environment,
          token: config!.token,
          checkout: { settings: settings() },
          eventCallback: event => {
            if (event.name === 'checkout.error' || event.name === 'checkout.payment.error') console.warn('Paddle checkout', event);
          },
        });
        if (!instance) throw new Error('Paddle.js did not start.');
        paddle = instance;
        if (config!.start && config!.signedIn) {
          // Back from signing in after Start free trial: carry on to the checkout, once. The
          // address loses ?start=trial so a reload or the back button doesn't open it again.
          const url = new URL(location.href);
          url.searchParams.delete('start');
          history.replaceState(history.state, '', url);
          subscribe();
        }
        await preview(extraGB);
      } catch (err) {
        problem = 'Checkout could not be loaded. Check your connection, or turn off anything blocking paddle.com, and reload.';
        loading = false;
        console.error('Paddle.js failed', err);
      }
    })();
  });
</script>

<div class="pricing-page">
  <header class="top">
    <a class="brand" href={config?.home ?? '/'}>metatrash<span>.</span></a>
    {#if config?.environment === 'sandbox'}<span class="test-mode" title="Paddle sandbox: no real money moves. Use a test card.">Test mode</span>{/if}
    <nav>
      <a href="{config?.home ?? '/'}docs/">Docs</a>
      {#if config?.signedIn}<a href="{config.home}spaces/#settings/spaces">Your spaces</a>{:else if config}<a href="{config.home}login">Sign in</a>{/if}
    </nav>
  </header>

  <main id="main">
    {#if problem}
      <p class="problem" role="alert">{problem}</p>
    {:else if config?.page === 'welcome'}
      <section class="card welcome">
        <h1>Welcome to Metatrash</h1>
        <p>Your subscription is set up and your 30-day trial has started. Paddle, who handle the payment, have emailed you a receipt.</p>
        <p class="muted">You won't be charged until the trial ends.</p>
        <div class="actions">
          {#if config.signedIn}
            <a class="btn primary" href="{config.home}spaces/#settings/spaces">Go to your spaces</a>
          {:else}
            <a class="btn primary" href="{config.home}login">Sign in or register</a>
          {/if}
          <a class="btn" href="{config.home}docs/">Read the docs</a>
        </div>
      </section>
    {:else}
      <div class="intro">
        <h1>One plan. Try it free for 30 days.</h1>
        <p class="muted">Prices are for your country, with any tax Paddle collects there. Checkout shows the final amount.</p>
      </div>

      {#if hasYearly}
        <div class="cycle" role="radiogroup" aria-label="Billing">
          <button type="button" role="radio" aria-checked={cycle === 'month'} class:on={cycle === 'month'} onclick={() => (cycle = 'month')}>Monthly</button>
          <button type="button" role="radio" aria-checked={cycle === 'year'} class:on={cycle === 'year'} onclick={() => (cycle = 'year')}>
            Yearly <span class="saving">{plan.yearlySaving}</span>
          </button>
        </div>
      {/if}

      <div class="cards">
        <section class="card plan" aria-labelledby="plan-name">
          <h2 id="plan-name">{plan.name}</h2>
          <p class="muted">{plan.description}</p>
          <p class="price" aria-live="polite">
            {#if planLine}
              <strong>{planLine.formattedTotals.total}</strong> <span class="per">/ {per}</span>
            {:else if loading}
              <span class="placeholder">Loading price…</span>
            {:else}
              <span class="placeholder">Price unavailable</span>
            {/if}
          </p>
          <p class="trial">{plan.trial[cycle]}</p>
          <ul>
            {#each plan.features as feature (feature)}<li>{feature}</li>{/each}
          </ul>
          {#if storageAddOn.atSignup && extraGB > 0 && storageLine}
            <p class="with-storage">With {extraGB} GB extra storage: <strong>{storageLine.formattedTotals.total}</strong> / {per} on top.</p>
          {/if}
          {#if config?.subscribed}
            <a class="btn primary block" href="{config.home}spaces/#settings/billing">Manage your plan</a>
            <p class="small muted">You already have a plan{#if config.email}{' '}as <span class="email">{config.email}</span>{/if}. See it, change your card or cancel in Settings → Billing.</p>
          {:else if config?.signedIn}
            <button class="btn primary block" type="button" disabled={!paddle || !planLine} onclick={subscribe}>Start free trial</button>
            {#if config.email}<p class="small muted">Signed in as <span class="email">{config.email}</span>; checkout fills it in.</p>{/if}
          {:else}
            <!-- A subscription belongs to an account: sign in or register first, then the checkout opens (/pricing/start). -->
            <a class="btn primary block" href="{config?.home ?? '/'}pricing/start">Start free trial</a>
            <p class="small muted">You'll sign in first, or make your account with a code sent to your email. Then checkout opens.</p>
          {/if}
        </section>

        <section class="card addon" aria-labelledby="addon-name">
          <h2 id="addon-name">{storageAddOn.name}</h2>
          <p class="muted">{storageAddOn.description}</p>
          <p class="price">
            {#if storageLine}
              <strong>{storageLine.formattedUnitTotals.total}</strong> <span class="per">per GB / {per}</span>
            {:else if loading}
              <span class="placeholder">Loading price…</span>
            {:else}
              <span class="placeholder">Price unavailable</span>
            {/if}
          </p>
          {#if storageAddOn.atSignup}
            <label for="extra-gb">Extra GB at signup</label>
            <div class="stepper">
              <button type="button" aria-label="One GB less" disabled={extraGB <= 0} onclick={() => setExtra(extraGB - 1)}>−</button>
              <input id="extra-gb" type="number" inputmode="numeric" min="0" max={storageAddOn.max} value={extraGB} onchange={e => setExtra(e.currentTarget.valueAsNumber)}>
              <button type="button" aria-label="One GB more" disabled={extraGB >= storageAddOn.max} onclick={() => setExtra(extraGB + 1)}>+</button>
            </div>
          {/if}
          <p class="small muted">{storageAddOn.note}</p>
        </section>
      </div>

      {#if previewProblem}<p class="problem" role="alert">{previewProblem}</p>{/if}
      {#if currency}<p class="small muted center">Prices in {currency}. Paddle is the merchant of record and handles payment, tax and receipts.</p>{/if}
    {/if}
  </main>

  <!-- Paddle's website review asks for the terms, privacy and refund pages to be linked from the pricing page. -->
  <footer class="legal">
    <a href="{config?.home ?? '/'}docs/legal/terms.md">Terms</a>
    <a href="{config?.home ?? '/'}docs/legal/privacy.md">Privacy</a>
    <a href="{config?.home ?? '/'}docs/legal/refunds.md">Refunds</a>
    <a href="{config?.home ?? '/'}docs/about.md">About</a>
  </footer>
</div>
