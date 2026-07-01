// OpulentAPI companion service worker.
//
// Registered at scope /opulent/ so it controls ONLY the proxied iframes, never
// Bardo's own shell. The server rewrites every URL it can see in the page's
// HTML/CSS/JS; this worker catches what's left — runtime fetch()/XHR, dynamically
// inserted elements, absolute-path requests — and reroutes them through
// /opulent/<encoded> so they're proxied too.

const PREFIX = "/opulent/";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const origin = self.location.origin;

  // Already-proxied requests go straight to the server (it does the rewriting).
  if (url.origin === origin && url.pathname.startsWith(PREFIX)) return;

  event.respondWith(handle(event));
});

// Resolve the real remote URL of the page that issued this request. Prefer the
// controlling client's URL (unaffected by Referrer-Policy), fall back to referrer.
async function pageRemoteUrl(event) {
  const candidates = [];
  try {
    if (event.clientId) {
      const client = await self.clients.get(event.clientId);
      if (client && client.url) candidates.push(client.url);
    }
  } catch {
    /* clients.get can reject for cross-origin clients */
  }
  if (event.request.referrer) candidates.push(event.request.referrer);

  for (const ref of candidates) {
    try {
      const u = new URL(ref);
      if (u.origin === self.location.origin && u.pathname.startsWith(PREFIX)) {
        return decodeURIComponent(u.pathname.slice(PREFIX.length));
      }
    } catch {
      /* skip unparseable */
    }
  }
  return null;
}

async function handle(event) {
  const request = event.request;
  const url = new URL(request.url);
  const origin = self.location.origin;

  let target;
  if (url.origin === origin) {
    // Same-origin but outside /opulent/: a relative/absolute-path resource of a
    // proxied page that the static rewrite missed. Resolve it against the page's
    // real remote base.
    const base = await pageRemoteUrl(event);
    if (!base) return fetch(request); // not from a proxied page — serve as-is
    try {
      target = new URL(url.pathname + url.search, base).toString();
    } catch {
      return fetch(request);
    }
  } else {
    // Cross-origin request — proxy it directly.
    target = request.url;
  }

  const proxyUrl = origin + PREFIX + encodeURIComponent(target);

  const method = request.method.toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD";
  let body;
  if (hasBody) {
    try {
      body = await request.clone().arrayBuffer();
    } catch {
      body = undefined;
    }
  }

  return fetch(proxyUrl, {
    method,
    headers: request.headers,
    body,
    mode: "same-origin",
    credentials: "same-origin",
    redirect: "follow",
  });
}
