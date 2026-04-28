self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
importScripts('/scramjet/scramjet.all.js');

const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();

// SW scope is /scramjet/ so only proxied requests reach this handler
self.addEventListener('fetch', event => {
  event.respondWith(scramjet.fetch(event));
});
