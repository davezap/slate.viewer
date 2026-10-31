import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';
import pkg from './package.json' with { type: 'json' };

// Tauri expects a fixed dev port and must see Rust-side errors in the terminal.
// `vite build --mode web` builds the same UI for metatrash.com instead: the site API backend,
// no index.html (Metatrash writes the page) and a manifest naming the hashed files, which are
// copied into Metatrash's internal/service/web/app/ (see README, "The website build").
export default defineConfig(({ mode }) => {
  const web = mode === 'web';
  return {
    plugins: [svelte()],
    clearScreen: false,
    resolve: {
      alias: { $backend: fileURLToPath(new URL(`./src/lib/backend/${web ? 'web' : 'desktop'}.ts`, import.meta.url)) },
    },
    define: { 'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version) },
    server: {
      port: 1420,
      strictPort: true,
      watch: { ignored: ['**/src-tauri/**'] },
    },
    build: web
      ? {
          target: 'es2022',
          outDir: 'dist-web',
          emptyOutDir: true,
          manifest: true,
          copyPublicDir: false,
          rollupOptions: { input: 'src/main.ts' },
        }
      : { target: 'es2022' },
    base: web ? '/app/' : '/',
  };
});
