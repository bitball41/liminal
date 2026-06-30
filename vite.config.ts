import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

const EXPRESS = 'http://localhost:8080';
const passthrough = [
  '/scramjet',
  '/scramjet2',
  '/baremux',
  '/epoxy',
  '/libcurl',
  '/klystron',
  '/sw.js',
  '/sw-scramjet2.js',
  '/sw-klystron.js',
  '/shortcuts.json',
  '/ab-launcher.js',
];

export default defineConfig({
  plugins: [
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
