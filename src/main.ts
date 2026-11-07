import { mount } from 'svelte';
import { backend } from './lib/backend';
import { applySiteConfig, restoreLastPlace } from './lib/site';
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

// metatrash.com/ opens where the person left off: the page moves on before the app starts.
const leaving = backend.capabilities.kind === 'web' && restoreLastPlace();
if (backend.capabilities.kind === 'web' && !leaving) applySiteConfig();

export default leaving ? null : mount(App, { target: document.getElementById('app')! });
