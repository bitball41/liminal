self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

importScripts('/scramjet/scramjet.all.js');

const { ScramjetServiceWorker } = $scramjetLoadWorker();
const sw = new ScramjetServiceWorker();

self.addEventListener('fetch', event => {
  event.respondWith(
    sw.loadConfig()
      .catch(() => {})
      .then(() => {
        // Guard: if config still null after loadConfig(), pass through.
        // This also prevents route() from throwing on this.config.prefix.
        if (!sw.config || !sw.route(event)) return fetch(event.request);
        return sw.fetch(event);
      })
  );
});
