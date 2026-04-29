self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
importScripts('/scramjet/scramjet.all.js');

const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();

self.addEventListener('fetch', event => {
  if (scramjet.route(event)) {
    event.respondWith(
      scramjet.loadConfig().then(() => scramjet.fetch(event))
    );
  }
});
