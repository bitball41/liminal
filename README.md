# Bardo

Bardo is Liminal's fast, browser-based web proxy. Its interface is a Preact +
TypeScript + Tailwind app, while Scramjet, BareMux, Epoxy, and Wisp provide the proxy
transport and service-worker runtime.

## Features

- Multi-tab proxied browsing
- Search, bookmarks, history, tab cloaking, and panic controls
- Configurable themes, layouts, widgets, and about:blank launch mode
- Scramjet v1 and experimental Scramjet v2 engines
- Lazy-loaded settings, history, widgets, and developer tools
- Cached and compressed proxy runtime assets

## Requirements

- Node.js 18 or newer
- npm

## Run locally

```bash
npm install
npm run build
npm start
```

Bardo listens on `PORT` when set and otherwise uses
`http://localhost:8080`.

For interface development, keep the proxy server running with `npm run server`
and run `npm run dev` in a second terminal. Vite serves the UI on port 5173 and
forwards the proxy/runtime paths to port 8080.

## Project structure

```text
.
├── server.ts
├── src/
├── public/
│   ├── ab-launcher.js
│   ├── sw.js
│   ├── sw-scramjet2.js
│   ├── shortcuts.json
├── index.html
├── vite.config.ts
└── tsconfig*.json
```

The service workers and early about:blank launcher remain JavaScript deployment
artifacts because browsers execute them directly. Application and server source
is TypeScript. The production server fails fast when `dist/` has not been built.

## Scripts

- `npm run dev` — start the Vite interface server
- `npm run server` — start the TypeScript proxy server
- `npm run typecheck` — check all TypeScript projects
- `npm run build` — typecheck and create the production UI
- `npm start` — run the production server
