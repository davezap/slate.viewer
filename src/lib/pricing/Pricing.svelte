<script lang="ts">
  // metatrash.com/pricing (and /checkout, Paddle's default payment link) and /welcome.
  // Prices come from Paddle.PricePreview and are shown exactly as Paddle formats them
  // (formattedTotals): no sums, no rounding, no reformatting here. Subscribe opens Paddle's
  // one-page checkout in an overlay; a completed checkout goes to /welcome (successUrl).
  import { onMount } from 'svelte';
  import { initializePaddle, type Paddle, type PricePreviewResponse, type CheckoutOpenLineItem } from '@paddle/paddle-js';
  import { readPricingConfig, type PricingConfig } from './config';
  import { plan, storageAddOn } from './plans';

  type Line = PricePreviewResponse['data']['details']['lineItems'][number];

  let config = $state<PricingConfig | null>(null);
  let problem = $state('');
  let paddle = $state<Paddle | null>(null);
  let planLine = $state<Line | null>(null);
  let storageLine = $state<Line | null>(null);
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
      const result = await paddle.PricePreview({
        items: [
          { priceId: config.prices.plan, quantity: 1 },
          // Always at least 1, for the price of 1 GB; the chosen count when there is one.
          { priceId: config.prices.storage, quantity: Math.max(1, gb) },
        ],
        // Cloudflare's country when there is one. Otherwise nothing: Paddle finds the
        // visitor's country from their IP address.
        ...(config.country ? { address: { countryCode: config.country } } : {}),
      });
      if (seq !== previewSeq) return;
      const lines = result.data.details.lineItems;
      planLine = lines.find(l => l.price.id === config!.prices.plan) ?? null;
      storageLine = lines.find(l => l.price.id === config!.prices.storage) ?? null;
      currency = result.data.currencyCode;
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
    if (!paddle || !config) return;
    const items: CheckoutOpenLineItem[] = [{ priceId: config.prices.plan, quantity: 1 }];
    if (storageAddOn.atSignup && extraGB > 0) items.push({ priceId: config.prices.storage, quantity: extraGB });
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

      <div class="cards">
        <section class="card plan" aria-labelledby="plan-name">
          <h2 id="plan-name">{plan.name}</h2>
          <p class="muted">{plan.description}</p>
          <p class="price" aria-live="polite">
            {#if planLine}
              <strong>{planLine.formattedTotals.total}</strong> <span class="per">/ month</span>
            {:else if loading}
              <span class="placeholder">Loading price…</span>
            {:else}
              <span class="placeholder">Price unavailable</span>
            {/if}
          </p>
          <p class="trial">{plan.trial}</p>
          <ul>
            {#each plan.features as feature (feature)}<li>{feature}</li>{/each}
          </ul>
          {#if storageAddOn.atSignup && extraGB > 0 && storageLine}
            <p class="with-storage">With {extraGB} GB extra storage: <strong>{storageLine.formattedTotals.total}</strong> / month on top.</p>
          {/if}
          <button class="btn primary block" type="button" disabled={!paddle || !planLine} onclick={subscribe}>Start free trial</button>
          {#if config?.email}<p class="small muted">Signed in as <span class="email">{config.email}</span>; checkout fills it in.</p>{/if}
        </section>

        <section class="card addon" aria-labelledby="addon-name">
          <h2 id="addon-name">{storageAddOn.name}</h2>
          <p class="muted">{storageAddOn.description}</p>
          <p class="price">
            {#if storageLine}
              <strong>{storageLine.formattedUnitTotals.total}</strong> <span class="per">per GB / month</span>
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
</div>
