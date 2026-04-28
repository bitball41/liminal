const express = require('express');
const http = require('http');
const path = require('path');
const { server: wispServer } = require('@mercuryworkshop/wisp-js');

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

// ── epoxy transport (/epoxy/) ─────────────────────────────────────
const epoxyDist = path.join(
  __dirname, 'node_modules', '@mercuryworkshop', 'epoxy-transport', 'dist'
);
app.use('/epoxy/', express.static(epoxyDist));
console.log('  epoxy:       /epoxy/');

// ── SW wrapper (needs Service-Worker-Allowed header) ─────────────
app.get('/scramjet-sw.js', allowSW, (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'scramjet-sw.js'))
);

// ── Static public dir ────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── HTTP server (wisp handles upgrades) ──────────────────────────
const server = http.createServer(app);

server.on('upgrade', (req, socket, head) => {
  if (req.url.startsWith('/wisp/')) {
    wispServer.routeRequest(req, socket, head);
  } else {
    socket.destroy();
  }
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`\n💤  Liminal Axis  →  http://localhost:${PORT}\n`);
  console.log('  wisp:        /wisp/');
});
