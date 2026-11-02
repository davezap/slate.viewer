// What the pricing page (metatrash.com/pricing) says about the plan and the storage add-on.
// Edit the words here. The prices themselves come from Paddle: Metatrash's accounts.json names
// the Paddle price for each ("planPriceId", "storagePriceId"), so sandbox and live can differ.

export interface Plan {
  name: string;
  description: string;
  /** Shown under the price, before the button. */
  trial: string;
  features: string[];
}

export interface AddOn {
  name: string;
  description: string;
  /** The most the page lets someone add (the Paddle price allows 1 to 100). */
  max: number;
  /**
   * Whether Subscribe can include extra storage. Paddle refuses a checkout that mixes a price
   * with a trial and one without, so this needs the storage price to have the plan's trial too.
   */
  atSignup: boolean;
  /** A note about how it's billed. */
  note: string;
}

export const plan: Plan = {
  name: 'Personal',
  description: 'Spaces of your own for you and your AI agents, kept in Git.',
  trial: '30 days free, then billed monthly. A card is needed to start; cancel any time in the trial and you pay nothing.',
  features: [
    'Up to 5 private spaces',
    '1 GB of storage across your account, history and files included',
    'Slate Viewer on the web and the desktop, Metatrash Sync, MCP and the API',
    'Folder actions with included web search and fetch',
    'Invite people to read your spaces with a free account',
  ],
};

export const storageAddOn: AddOn = {
  name: 'Extra storage',
  description: 'More room when 1 GB is not enough, 1 GB at a time.',
  max: 100,
  atSignup: false,
  note: 'Your plan already includes 1 GB, trial included. Add storage once you need more.',
};
