// Klystron — a server-side proxy engine for Bardo.
//
// Unlike Scramjet (which intercepts and rewrites everything client-side via a
// service worker + wasm), Klystron does the work on the server: it fetches the
// target URL with Node's `fetch`, rewrites every URL in the returned
// HTML/CSS/JS so it points back through `/klystron/<encoded>`, and streams the
// result to the iframe. A small companion service worker (sw-klystron.js)
// catches the runtime requests the static rewrite can't see (fetch/XHR, dynamic
// elements) and routes those back through here too.
//
// Ported from https://github.com/IHATECAMOUFLAGE/Klystron and adapted for Bardo:
// the upstream `main` ↔ `fetch` response-shape mismatch is fixed, the response
// header allow-list drops `content-length`/`x-frame-options` (we re-frame and
// re-length the body), CSP is stripped per-response, and basic SSRF guards block
// requests at private/loopback hosts.

import express, { Router, type Request, type Response } from "express";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import type { Duplex } from "node:stream";
import { isIP } from "node:net";
import { CookieJar } from "tough-cookie";
import { JSDOM } from "jsdom";

export const KLYSTRON_PREFIX = "/klystron/";

// ---------------------------------------------------------------------------
// Per-session cookie jars. The browser holds an opaque `klystron_session` id;
// each id maps to a server-side CookieJar so logins persist across requests.
// ---------------------------------------------------------------------------

const jars = new Map<string, CookieJar>();
const SESSION_COOKIE = "klystron_session";
const MAX_JARS = 1000;

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of String(header ?? "").split(";")) {
    const s = part.trim();
    if (!s) continue;
    const i = s.indexOf("=");
    if (i < 0) continue;
    out[s.slice(0, i).trim()] = s.slice(i + 1).trim();
  }
  return out;
}

function getSessionJar(req: Request, res: Response): CookieJar {
  const id = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (id && jars.has(id)) return jars.get(id)!;

  const fresh = randomUUID();
  jars.set(fresh, new CookieJar(undefined, { looseMode: true }));
  if (jars.size > MAX_JARS) {
    const oldest = jars.keys().next().value;
    if (oldest) jars.delete(oldest);
  }
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${fresh}; Path=/; HttpOnly; SameSite=Lax`);
  return jars.get(fresh)!;
}

// ---------------------------------------------------------------------------
// SSRF guard — refuse to let the proxy reach the box it runs on / the LAN.
// ---------------------------------------------------------------------------

function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (host === "metadata.google.internal") return true;

  if (isIP(host) === 4) {
    const o = host.split(".").map(Number);
    if (o[0] === 127 || o[0] === 10 || o[0] === 0) return true;
    if (o[0] === 192 && o[1] === 168) return true;
    if (o[0] === 172 && o[1] >= 16 && o[1] <= 31) return true;
    if (o[0] === 169 && o[1] === 254) return true; // link-local / cloud metadata
    if (o[0] === 100 && o[1] >= 64 && o[1] <= 127) return true; // CGNAT
    return false;
  }
  if (isIP(host) === 6) {
    if (host === "::1" || host === "::") return true;
    if (host.startsWith("fc") || host.startsWith("fd")) return true; // unique-local
    if (host.startsWith("fe80")) return true; // link-local
    return false;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Outbound request with manual redirect handling (so cookies follow each hop).
// ---------------------------------------------------------------------------

const STRIP_REQUEST_HEADERS = new Set([
  "host", "connection", "content-length", "cookie",
  "x-forwarded-for", "x-forwarded-host", "x-forwarded-proto", "x-forwarded-port",
  "forwarded", "via",
]);

function decodeProxyRef(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const u = new URL(value, "http://b");
    if (u.pathname.startsWith(KLYSTRON_PREFIX)) {
      return decodeURIComponent(u.pathname.slice(KLYSTRON_PREFIX.length));
    }
  } catch {
    /* fall through */
  }
  return value;
}

function buildOutboundHeaders(req: Request): Headers {
  const h = new Headers();
  for (const [k, raw] of Object.entries(req.headers)) {
    if (raw == null) continue;
    const key = k.toLowerCase();
    if (STRIP_REQUEST_HEADERS.has(key)) continue;
    const value = Array.isArray(raw) ? raw.join(", ") : raw;
    if (key === "referer" || key === "origin") {
      // The browser's referer/origin point at our own /klystron/ URL; translate
      // back to the real remote so the target sees a sane value.
      const real = decodeProxyRef(value);
      if (key === "referer" && real) h.set("referer", real);
      else if (key === "origin" && real) {
        try { h.set("origin", new URL(real).origin); } catch { /* drop */ }
      }
      continue;
    }
    try { h.set(k, value); } catch { /* skip invalid header */ }
  }
  return h;
}

interface Upstream {
  res: globalThis.Response;
  finalUrl: string;
}

async function fetchUpstream(
  target: string,
  req: Request,
  jar: CookieJar,
  bodyBuf: Buffer | undefined,
): Promise<Upstream> {
  let url = target;
  let method = req.method.toUpperCase();
  const noBody = method === "GET" || method === "HEAD";
  let body: BodyInit | undefined = noBody ? undefined : bodyBuf && bodyBuf.length ? (bodyBuf as BodyInit) : undefined;
  const base = buildOutboundHeaders(req);

  for (let i = 0; i <= 10; i++) {
    const hop = new URL(url);
    if (isBlockedHost(hop.hostname)) throw new Error(`Blocked host: ${hop.hostname}`);

    const headers = new Headers(base);
    const cookie = await jar.getCookieString(url);
    if (cookie) headers.set("cookie", cookie);

    const res = await fetch(url, { method, headers, body, redirect: "manual" });

    for (const c of res.headers.getSetCookie?.() ?? []) {
      try { await jar.setCookie(c, url); } catch { /* ignore bad cookie */ }
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (location) {
        const next = new URL(location, url).toString();
        // 303, and 301/302 on POST, collapse to GET per browser behaviour.
        if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === "POST")) {
          method = "GET";
          body = undefined;
        }
        url = next;
        try { await res.arrayBuffer(); } catch { /* drain */ }
        continue;
      }
    }
    return { res, finalUrl: url };
  }
  throw new Error("Too many redirects");
}

// ---------------------------------------------------------------------------
// Response handling: stream binaries through untouched, rewrite text.
// ---------------------------------------------------------------------------

const TEXT_MIMES = new Set([
  "application/xhtml+xml", "text/css", "application/javascript", "application/ecmascript",
  "application/x-javascript", "text/javascript", "text/ecmascript", "application/json",
  "application/ld+json", "image/svg+xml", "text/xml", "application/xml",
  "application/rss+xml", "application/atom+xml", "application/x-mpegurl",
  "application/vnd.apple.mpegurl", "application/dash+xml", "text/vtt",
]);

function isTextual(contentType: string): boolean {
  const mime = contentType.split(";")[0].trim().toLowerCase();
  return mime.startsWith("text/") || TEXT_MIMES.has(mime) || mime.endsWith("+json") || mime.endsWith("+xml");
}

// Headers safe to forward verbatim. Intentionally excludes content-length (the
// body length changes after rewriting), x-frame-options & content-security-policy
// (we serve inside an iframe, same-origin), and set-cookie (handled by the jar).
const COPY_RESPONSE_HEADERS = new Set([
  "cache-control", "expires", "last-modified", "etag", "pragma", "vary",
  "content-language", "content-disposition", "content-range", "accept-ranges",
]);

function copyResponseHeaders(res: Response, headers: Headers): void {
  for (const [name, value] of headers.entries()) {
    if (value == null || !COPY_RESPONSE_HEADERS.has(name.toLowerCase())) continue;
    try { res.setHeader(name, value); } catch { /* skip */ }
  }
}

async function handle(req: Request, res: Response): Promise<void> {
  let target: string;
  try {
    const raw = req.url.replace(/^\/+/, "").split("#")[0];
    if (!raw) { res.status(400).type("text/plain").send("Klystron: missing target URL"); return; }
    target = decodeURIComponent(raw);
  } catch {
    res.status(400).type("text/plain").send("Klystron: malformed target URL");
    return;
  }

  let parsed: URL;
  try { parsed = new URL(target); } catch {
    res.status(400).type("text/plain").send("Klystron: invalid URL");
    return;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    res.status(400).type("text/plain").send("Klystron: only http(s) is supported");
    return;
  }
  if (isBlockedHost(parsed.hostname)) {
    res.status(403).type("text/plain").send("Klystron: blocked host");
    return;
  }

  const jar = getSessionJar(req, res);
  const bodyBuf = Buffer.isBuffer(req.body) ? (req.body as Buffer) : undefined;

  let upstream: Upstream;
  try {
    upstream = await fetchUpstream(target, req, jar, bodyBuf);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    res.status(502).type("text/plain").send(`Klystron upstream error: ${message}`);
    return;
  }

  const { res: ures, finalUrl } = upstream;
  const contentType = ures.headers.get("content-type") || "application/octet-stream";

  // Drop the security headers Bardo's global middleware added — proxied content
  // is same-origin and must be framable and free of our app's CSP.
  res.removeHeader("Content-Security-Policy");
  res.removeHeader("X-Frame-Options");
  copyResponseHeaders(res, ures.headers);
  res.status(ures.status);
  res.setHeader("Content-Type", contentType);

  if (!isTextual(contentType) || contentType.toLowerCase().startsWith("text/event-stream")) {
    if (!ures.body) { res.end(); return; }
    Readable.fromWeb(ures.body as Parameters<typeof Readable.fromWeb>[0]).pipe(res);
    return;
  }

  const text = await ures.text();
  res.send(rewrite(finalUrl, text, contentType));
}

// ---------------------------------------------------------------------------
// HTML / CSS / JS URL rewriting (jsdom). Every reference is pinned to the
// absolute remote URL, then wrapped as /klystron/<encoded>.
// ---------------------------------------------------------------------------

const SKIP_PROTOCOLS = [
  "data:", "javascript:", "mailto:", "tel:", "about:", "blob:",
  "chrome-extension:", "moz-extension:", "filesystem:", "ws:", "wss:",
];
const URL_ATTRS = new Set([
  "href", "src", "action", "formaction", "poster", "data", "cite",
  "background", "ping", "longdesc", "xlink:href",
]);
const CSS_URL = /url\(\s*(['"]?)(.*?)\1\s*\)/gi;
const CSS_IMPORT = /@import\s+(['"])(.*?)\1/gi;
const JS_URL = /(['"`])(https?:\/\/[^'"`]+|\/\/[^'"`]+|\/[^'"`\s]+|\.{1,2}\/[^'"`\s]+)\1/g;
const LOOKS_LIKE_URL = /^(https?:)?\/\/|^\//i;

function rewrite(baseUrl: string, content: string, contentType: string): string {
  const dom = new JSDOM(content, {
    url: baseUrl,
    contentType: contentType.includes("xml") ? "text/xml" : "text/html",
  });
  const { document } = dom.window;

  const resolve = (value: string): string => {
    try { return new URL(value, baseUrl).href; } catch { return value; }
  };
  const shouldSkip = (value: string): boolean => {
    if (!value) return true;
    const v = value.trim().toLowerCase();
    if (v.startsWith("#") || v.startsWith(KLYSTRON_PREFIX)) return true;
    return SKIP_PROTOCOLS.some((p) => v.startsWith(p));
  };
  const wrap = (value: string): string =>
    shouldSkip(value) ? value : KLYSTRON_PREFIX + encodeURIComponent(resolve(value));

  const fixSrcset = (value: string): string =>
    value
      .split(",")
      .map((part) => {
        const [url, descriptor] = part.trim().split(/\s+/, 2);
        return wrap(url) + (descriptor ? ` ${descriptor}` : "");
      })
      .join(", ");

  const fixCss = (css: string): string =>
    css
      .replace(CSS_URL, (_m, q, url) => `url(${q}${wrap(url)}${q})`)
      .replace(CSS_IMPORT, (_m, q, url) => `@import ${q}${wrap(url)}${q}`);

  const fixJs = (js: string): string => js.replace(JS_URL, (_m, q, url) => `${q}${wrap(url)}${q}`);

  for (const el of document.querySelectorAll("*")) {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      const value = attr.value;
      if (!value) continue;

      if (name === "srcset" || name === "imagesrcset") el.setAttribute(attr.name, fixSrcset(value));
      else if (name === "style") el.setAttribute(attr.name, fixCss(value));
      else if (name.startsWith("on")) el.setAttribute(attr.name, fixJs(value));
      else if (URL_ATTRS.has(name)) el.setAttribute(attr.name, wrap(value));
      else if (name === "integrity" || name === "nonce") el.removeAttribute(attr.name);
    }

    if (el.tagName === "STYLE" && el.textContent) el.textContent = fixCss(el.textContent);
    if (el.tagName === "SCRIPT" && !el.getAttribute("src") && el.textContent) {
      el.textContent = fixJs(el.textContent);
    }
  }

  // Only rewrite meta values that are actually URLs (og:image, canonical, …) so
  // plain-text metas like description aren't mangled.
  for (const meta of document.querySelectorAll("meta[property], meta[name]")) {
    const content = meta.getAttribute("content");
    if (content && LOOKS_LIKE_URL.test(content.trim())) meta.setAttribute("content", wrap(content));
  }

  for (const frame of document.querySelectorAll("iframe[srcdoc]")) {
    const srcdoc = frame.getAttribute("srcdoc");
    if (srcdoc) frame.setAttribute("srcdoc", rewrite(baseUrl, srcdoc, "text/html"));
  }

  return dom.serialize();
}

// ---------------------------------------------------------------------------
// WebSocket upgrade passthrough for /klystron/<encoded-ws-url>.
// ---------------------------------------------------------------------------

function parseUpgradeTarget(reqUrl: string | undefined): string | null {
  if (!reqUrl || !reqUrl.startsWith(KLYSTRON_PREFIX)) return null;
  try { return decodeURIComponent(reqUrl.slice(KLYSTRON_PREFIX.length)); } catch { return null; }
}

export function klystronUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
  const target = parseUpgradeTarget(req.url);
  if (!target) { socket.destroy(); return; }

  let remote: URL;
  try { remote = new URL(target); } catch { socket.destroy(); return; }
  if (isBlockedHost(remote.hostname)) { socket.destroy(); return; }

  const secure = remote.protocol === "wss:" || remote.protocol === "https:";
  const headers = { ...req.headers, host: remote.host };
  delete headers["content-length"];

  const proxyReq = (secure ? httpsRequest : httpRequest)({
    protocol: secure ? "https:" : "http:",
    hostname: remote.hostname,
    port: remote.port || (secure ? 443 : 80),
    path: remote.pathname + remote.search,
    method: req.method,
    headers,
  });

  proxyReq.on("upgrade", (proxyRes, proxySocket, proxyHead) => {
    socket.write(`HTTP/1.1 101 ${proxyRes.statusMessage || "Switching Protocols"}\r\n`);
    for (const [name, value] of Object.entries(proxyRes.headers)) {
      if (value == null) continue;
      for (const item of Array.isArray(value) ? value : [value]) socket.write(`${name}: ${item}\r\n`);
    }
    socket.write("\r\n");
    if (proxyHead?.length) proxySocket.write(proxyHead);
    if (head?.length) proxySocket.write(head);
    proxySocket.pipe(socket);
    socket.pipe(proxySocket);
    proxySocket.on("error", () => socket.destroy());
    socket.on("error", () => proxySocket.destroy());
  });
  proxyReq.on("error", () => socket.destroy());
  proxyReq.end();
}

// ---------------------------------------------------------------------------
// Express router, mounted at /klystron.
// ---------------------------------------------------------------------------

export function klystronRouter(): Router {
  const router = Router();
  // Buffer the request body so POSTs (and redirect replays) keep their payload.
  router.use(express.raw({ type: () => true, limit: "25mb" }));
  router.all(/.*/, (req, res) => {
    handle(req, res).catch((err) => {
      if (res.headersSent) { res.destroy(); return; }
      const message = err instanceof Error ? err.message : "unknown error";
      res.status(500).type("text/plain").send(`Klystron error: ${message}`);
    });
  });
  return router;
}
