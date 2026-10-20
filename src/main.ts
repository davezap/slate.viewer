import { mount } from 'svelte';
import { invoke } from '@tauri-apps/api/core';
import App from './App.svelte';
import './app.css';

// Uncaught script errors go to the fault log (Help > Open Log Folder) as well as the console.
const logFault = (kind: string, message: string) => void invoke('log_fault', { kind, message }).catch(() => {});
window.addEventListener('error', event => {
  logFault('script', `${event.message} (${event.filename}:${event.lineno}:${event.colno})${event.error?.stack ? `\n${event.error.stack}` : ''}`);
});
window.addEventListener('unhandledrejection', event => {
  const reason = event.reason;
  logFault('promise', reason instanceof Error ? reason.stack ?? reason.message : String(reason));
});

export default mount(App, { target: document.getElementById('app')! });
