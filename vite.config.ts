import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

// The proxy/service-worker plumbing (Scramjet, bare-mux, transports, the
// service workers, shortcuts.json, and the wisp websocket) is served by the
// Express server in server.ts. In dev we forward those exact paths to it so the
// Preact app on :5173 behaves as if it were served from the same origin.
const EXPRESS = 'http://localhost:8080';
const passthrough = [
  '/scramjet',
  '/scramjet2',
  '/baremux',
  '/epoxy',
  '/libcurl',
  '/sw.js',
  '/sw-scramjet2.js',
  '/shortcuts.json',
];

export default defineConfig({
  plugins: [
    // `devToolsEnabled: false` disables preset-vite's "hook names" transform.
    // That transform's CJS build does `require("zimmerframe")`, but zimmerframe
    // is ESM-only (no `require`/`main` export), which crashes the dev server with
    // `No "exports" main defined`. Production builds never load it, so they're
    // unaffected. Trade-off: the Preact DevTools extension won't label hook
    // variable names in dev — standard browser debugging is unchanged.
    preact({ devToolsEnabled: false }),
    tailwindcss(),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  publicDir: false,
  server: {
    port: 5173,
    proxy: {
      ...Object.fromEntries(
        passthrough.map((p) => [p, { target: EXPRESS, changeOrigin: true }]),
      ),
      '/wisp': { target: EXPRESS.replace('http', 'ws'), ws: true },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
