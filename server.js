const express = require('express');
const http = require('http');
const path = require('path');
const { createBareServer } = require('@tomphttp/bare-server-node');

const app = express();
const bareServer = createBareServer('/bare/');

function allowSW(req, res, next) {
  res.setHeader('Service-Worker-Allowed', '/');
  next();
}

// Long-lived cache for vendored proxy assets — they don't change between visits
const vendorCache = { maxAge: '7d', immutable: true };

// Scramjet dist files
app.use('/scramjet/', allowSW, express.static(
  path.join(__dirname, 'node_modules', '@mercuryworkshop', 'scramjet', 'dist'),
  vendorCache
));

// bare-mux client
app.use('/baremux/', express.static(
  path.join(__dirname, 'node_modules', '@mercuryworkshop', 'bare-mux', 'dist'),
  vendorCache
));

// bare-as-module3 transport
app.get('/bare-transport.mjs', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
  res.sendFile(path.join(
    __dirname, 'node_modules', '@mercuryworkshop', 'bare-as-module3', 'dist', 'index.mjs'
  ));
});

// SW wrapper
app.get('/scramjet-sw.js', allowSW, (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'scramjet-sw.js'))
);

app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer((req, res) => {
  if (bareServer.shouldRoute(req)) {
    bareServer.routeRequest(req, res);
  } else {
    app(req, res);
  }
});

server.on('upgrade', (req, socket, head) => {
  if (bareServer.shouldRoute(req)) {
    bareServer.routeUpgrade(req, socket, head);
  } else {
    socket.destroy();
  }
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () =>
  console.log(`\n💤  Liminal Axis  →  http://localhost:${PORT}\n`)
);
