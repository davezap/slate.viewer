import { mount } from 'svelte';
import { backend } from './lib/backend';
import { applySiteConfig } from './lib/site';
import App from './App.svelte';
import './app.css';

// Uncaught script errors go to the fault log (Help > Open Log Folder) as well as the console.
const logFault = (kind: string, message: string) => void backend.app.logFault(kind, message).catch(() => {});
window.addEventListener('error', event => {
  logFault('script', `${event.message} (${event.filename}:${event.lineno}:${event.colno})${event.error?.stack ? `\n${event.error.stack}` : ''}`);
});
window.addEventListener('unhandledrejection', event => {
  const reason = event.reason;
  logFault('promise', reason instanceof Error ? reason.stack ?? reason.message : String(reason));
});

if (backend.capabilities.kind === 'web') applySiteConfig();

export default mount(App, { target: document.getElementById('app')! });
