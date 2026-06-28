import express, { type RequestHandler } from "express";
import compression from "compression";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import path from "node:path";
import { server as wisp } from "@mercuryworkshop/wisp-js/server";

const app = express();
const rootDir = __dirname;

// Content Security Policy — tightened for a proxy host that loads WASM, workers,
// and frames, but never executes inline scripts from unknown sources.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "connect-src 'self' wss: https:",
  "frame-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "img-src 'self' data: https:",
  "manifest-src 'self'",
].join("; ");

app.use((_request, response, next) => {
  response.setHeader("Content-Security-Policy", csp);
  next();
});

// Compress the UI and proxy runtime at the origin. The main production bundle
// drops from roughly 275 kB on the wire to about 85 kB with gzip.
app.use(compression());

const allowServiceWorker: RequestHandler = (_request, response, next) => {
  response.setHeader("Service-Worker-Allowed", "/");
  next();
};

const revalidate: RequestHandler = (_request, response, next) => {
  response.setHeader("Cache-Control", "no-cache");
  next();
};

// These large files come from package-lock-pinned dependencies. A short fresh
// window avoids a network round trip on repeat launches while still allowing a
// new deployment to roll through quickly.
const cacheProxyRuntime: RequestHandler = (_request, response, next) => {
  response.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
  next();
};

function proxyStatic(packagePath: string) {
  return express.static(path.join(rootDir, packagePath), {
    cacheControl: false,
    etag: true,
  });
}

app.use(
  "/scramjet/",
  allowServiceWorker,
  cacheProxyRuntime,
  proxyStatic("node_modules/@mercuryworkshop/scramjet/dist"),
);
app.use(
  "/scramjet2/",
  allowServiceWorker,
  cacheProxyRuntime,
  proxyStatic("node_modules/scramjet-v2/dist"),
);
app.use(
  "/baremux/",
  cacheProxyRuntime,
  proxyStatic("node_modules/@mercuryworkshop/bare-mux/dist"),
);

app.get("/epoxy/index.mjs", cacheProxyRuntime, (_request, response) => {
  response.type("application/javascript");
  response.sendFile(
    path.join(rootDir, "node_modules/@mercuryworkshop/epoxy-transport/dist/index.mjs"),
    { cacheControl: false },
  );
});

app.get("/libcurl/index.mjs", cacheProxyRuntime, (_request, response) => {
  response.type("application/javascript");
  response.sendFile(
    path.join(rootDir, "node_modules/@mercuryworkshop/libcurl-transport/dist/index.mjs"),
    { cacheControl: false },
  );
});

// Worker scripts themselves always revalidate so an engine update activates
// immediately; their imported package assets use the short runtime cache above.
app.get("/sw.js", allowServiceWorker, revalidate, (_request, response) => {
  response.sendFile(path.join(rootDir, "public/sw.js"), { cacheControl: false });
});
app.get("/sw-scramjet2.js", allowServiceWorker, revalidate, (_request, response) => {
  response.sendFile(path.join(rootDir, "public/sw-scramjet2.js"), { cacheControl: false });
});
app.get("/shortcuts.json", revalidate, (_request, response) => {
  response.sendFile(path.join(rootDir, "public/shortcuts.json"), { cacheControl: false });
});

// Serve the compiled React app when present, preserving the existing legacy
// fallback for source-only checkouts that have not run the build yet.
const distRoot = path.join(rootDir, "dist");
const distIndex = path.join(distRoot, "index.html");
const hasBuild = existsSync(distIndex);
const staticRoot = hasBuild ? distRoot : path.join(rootDir, "public");

app.use(
  express.static(staticRoot, {
    setHeaders(response, filePath) {
      const isHashedAsset = hasBuild && path.relative(distRoot, filePath).startsWith(`assets${path.sep}`);
      response.setHeader(
        "Cache-Control",
        isHashedAsset ? "public, max-age=31536000, immutable" : "no-cache",
      );
    },
  }),
);

const server = createServer(app);
server.on("upgrade", (request, socket, head) => {
  wisp.routeRequest(request, socket, head);
});

const port = Number.parseInt(process.env.PORT ?? "8080", 10);
server.listen(port, () => {
  console.log(`\nBardo  →  http://localhost:${port}\n`);
});
