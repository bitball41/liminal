const express = require('express');
const http    = require('http');
const path    = require('path');
const { server: wisp } = require('@mercuryworkshop/wisp-js/server');

const app = express();

function allowSW(req, res, next) {
  res.setHeader('Service-Worker-Allowed', '/');
  next();
}

// Revalidate every request — prevents stale JS after deploys
function noCache(req, res, next) {
  res.setHeader('Cache-Control', 'no-cache');
  next();
}

// Scramjet dist
app.use('/scramjet/', allowSW, noCache, express.static(
  path.join(__dirname, 'node_modules/@mercuryworkshop/scramjet/dist')
));

// bare-mux
app.use('/baremux/', noCache, express.static(
  path.join(__dirname, 'node_modules/@mercuryworkshop/bare-mux/dist')
));

// epoxy transport
app.get('/epoxy/index.mjs', noCache, (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.sendFile(path.join(
    __dirname, 'node_modules/@mercuryworkshop/epoxy-transport/dist/index.mjs'
  ));
});

// libcurl transport
app.get('/libcurl/index.mjs', noCache, (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.sendFile(path.join(
    __dirname, 'node_modules/@mercuryworkshop/libcurl-transport/dist/index.mjs'
  ));
});

// service worker — must never be cached so updates propagate immediately
app.get('/sw.js', allowSW, noCache, (req, res) =>
  res.sendFile(path.join(__dirname, 'public/sw.js'))
);

// static assets
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);

server.on('upgrade', (req, socket, head) => {
  wisp.routeRequest(req, socket, head);
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () =>
  console.log(`\nAxis  →  http://localhost:${PORT}\n`)
);
