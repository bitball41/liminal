self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

importScripts('/uv/uv.bundle.js');
importScripts('/uv/uv.config.js');
importScripts('/uv/uv.sw.js');

const sw = new UVServiceWorker();

self.addEventListener('fetch', event => {
  event.respondWith(
    (async () => {
      if (!sw.route(event)) return fetch(event.request);
      return sw.fetch(event);
    })()
  );
});
