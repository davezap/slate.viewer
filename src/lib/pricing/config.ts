// The pricing page's settings, from <meta name="metatrash-pricing" content="{...}"> that Metatrash
// writes (internal/service/paddle.go): the site's CSP allows no inline script.

export type PaddleEnvironment = 'sandbox' | 'production';

/** How often a subscription is billed. */
export type Cycle = 'month' | 'year';

/** The plan and storage price IDs for a cycle; null when the page has no yearly prices. */
export function pricesFor(config: PricingConfig, cycle: Cycle): { plan: string; storage: string } | null {
  if (cycle === 'month') return { plan: config.prices.plan, storage: config.prices.storage };
  const { planYearly, storageYearly } = config.prices;
  return planYearly && storageYearly ? { plan: planYearly, storage: storageYearly } : null;
}

export interface PricingConfig {
  page: 'pricing' | 'welcome';
  /** Open the checkout once Paddle is ready: Start free trial was clicked while signed out, and signing in came back here. */
  start?: boolean;
  /** The signed-in person already has a plan (Metatrash 0.91.0): offer Settings → Billing, not a second checkout. */
  subscribed?: boolean;
  environment: PaddleEnvironment;
  /** Paddle client-side token (test_... or live_...). Public: made for browser code. */
  token: string;
  /** planYearly and storageYearly (Metatrash 0.93.0) come together, when yearly billing is set up. */
  prices: { plan: string; storage: string; planYearly?: string; storageYearly?: string };
  /** The visitor's country (ISO 3166-1 alpha-2) when Cloudflare named one. Absent: Paddle finds it. */
  country?: string;
  /** The signed-in person's email, filled in at checkout. */
  email?: string;
  signedIn: boolean;
  userId?: string;
  /** Full address of the welcome page, where a completed checkout goes. */
  welcome: string;
  home: string;
}

/**
 * Reads and checks the settings. Throws rather than guess: a page with no environment, or a
 * token for the other one, must never open a checkout against the wrong Paddle account.
 */
export function readPricingConfig(): PricingConfig {
  const content = document.querySelector<HTMLMetaElement>('meta[name="metatrash-pricing"]')?.content;
  if (!content) throw new Error('The page has no pricing settings (meta metatrash-pricing).');
  const config = JSON.parse(content) as PricingConfig;
  const prefix = config.environment === 'sandbox' ? 'test_' : config.environment === 'production' ? 'live_' : '';
  if (!prefix) throw new Error(`Unknown Paddle environment "${String(config.environment)}".`);
  if (typeof config.token !== 'string' || !config.token.startsWith(prefix)) throw new Error(`The Paddle token is not a ${config.environment} token.`);
  if (!config.prices?.plan || !config.prices?.storage) throw new Error('The Paddle prices are missing.');
  if (!config.prices.planYearly !== !config.prices.storageYearly) throw new Error('The yearly Paddle prices are incomplete.');
  return config;
}
