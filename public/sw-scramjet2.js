self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

importScripts('/scramjet2/scramjet_bundled.js');

const SVC_PREFIX = '/scramjet2/service/';

let _handler = null;
let _wasmLoaded = false;

async function ensureHandler() {
  if (_handler) return _handler;

  if (!_wasmLoaded && typeof $scramjet?.setWasm === 'function') {
    try {
      const response = await fetch('/scramjet2/scramjet.wasm');
      if (!response.ok) throw new Error(`WASM request failed: ${response.status}`);
      const wasmBytes = await response.arrayBuffer();
      await $scramjet.setWasm(wasmBytes);
      _wasmLoaded = true;
    } catch (e) {
      console.warn('[bardo sw-v2] WASM load failed, continuing without it:', e);
    }
  }

  const context = {
    prefix: new URL(SVC_PREFIX, self.location.origin),
    cookieJar: new $scramjet.CookieJar(),
    ...$scramjet.defaultConfig,
  };

  _handler = new $scramjet.ScramjetFetchHandler({ context });
  return _handler;
}

self.addEventListener('fetch', event => {
  if (!event.request.url.startsWith(self.location.origin + SVC_PREFIX)) return;

  event.respondWith(
    (async () => {
      try {
        const handler = await ensureHandler();
        const url = new URL(event.request.url);
        const req = {
          rawUrl: url,
          rawClientUrl: event.request.referrer ? new URL(event.request.referrer) : null,
          initialHeaders: new Headers(event.request.headers),
          method: event.request.method,
          body: event.request.body,
          cache: event.request.cache,
          redirect: event.request.redirect,
          credentials: event.request.credentials,
          mode: event.request.mode,
          destination: event.request.destination,
        };
        return await handler.handleFetch(req);
      } catch (e) {
        console.error('[bardo sw-v2] error:', e);
        return new Response('Scramjet v2 request failed', { status: 500 });
      }
    })()
  );
});
