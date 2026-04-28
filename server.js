const express = require('express');
const http = require('http');
const path = require('path');

// ── Bare server ──────────────────────────────────────────────────
let bareServer = null;
try {
  const { createBareServer } = require('@tomphttp/bare-server-node');
  bareServer = createBareServer('/bare/');
  console.log('  bare server: /bare/');
} catch (e) {
  console.warn('[liminal] bare-server-node unavailable:', e.message);
}

const app = express();

// ── Helper: set SW-Allowed header ────────────────────────────────
function allowSW(req, res, next) {
  res.setHeader('Service-Worker-Allowed', '/');
  next();
}

// ── Scramjet assets (/scramjet/) ─────────────────────────────────
const scramjetDist = path.join(
  __dirname, 'node_modules', '@mercuryworkshop', 'scramjet', 'dist'
);
app.use('/scramjet/', allowSW, express.static(scramjetDist));
console.log('  scramjet:    /scramjet/');

// ── bare-mux assets (/baremux/) ──────────────────────────────────
const bareMuxDist = path.join(
  __dirname, 'node_modules', '@mercuryworkshop', 'bare-mux', 'dist'
);
app.use('/baremux/', express.static(bareMuxDist));
console.log('  bare-mux:    /baremux/');

// ── bare-as-module3 transport module (/bare-transport.mjs) ──────
const bareTransportMjs = path.join(
  __dirname, 'node_modules', '@mercuryworkshop', 'bare-as-module3', 'dist', 'index.mjs'
);
app.get('/bare-transport.mjs', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.sendFile(bareTransportMjs);
});
console.log('  bare-transport: /bare-transport.mjs');

// ── UV is already in public/uv/ (built from source) ─────────────
// Service-Worker-Allowed header for uv.sw.js (scope=/service/)
app.use('/uv/', allowSW, express.static(path.join(__dirname, 'public', 'uv')));

// ── Static public dir ────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── HTTP server (bare takes priority) ────────────────────────────
const server = http.createServer((req, res) => {
  if (bareServer && bareServer.shouldRoute(req)) {
    bareServer.routeRequest(req, res);
  } else {
    app(req, res);
  }
});

server.on('upgrade', (req, socket, head) => {
  if (bareServer && bareServer.shouldRoute(req)) {
    bareServer.routeUpgrade(req, socket, head);
  } else {
    socket.destroy();
  }
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`\n💤  Liminal Axis  →  http://localhost:${PORT}\n`);
});
