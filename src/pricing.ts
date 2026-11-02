import { mount } from 'svelte';
import Pricing from './lib/pricing/Pricing.svelte';
import './lib/pricing/pricing.css';

// The website build's second entry (vite.config.ts): metatrash.com/pricing, /checkout and
// /welcome. Not part of the desktop app.
export default mount(Pricing, { target: document.getElementById('pricing')! });
