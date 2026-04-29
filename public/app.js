/* Axis — app.js */

const $ = id => document.getElementById(id);

const nav         = $('chrome');
const btnBack     = $('btn-back');
const btnFwd      = $('btn-fwd');
const btnReload   = $('btn-reload');
const btnHome     = $('btn-home');
const chromeForm  = $('chrome-form');
const urlBar      = $('url-bar');
const newTab      = $('new-tab');
const searchForm  = $('search-form');
const searchInput = $('search-input');
const statusEl    = $('status');
const proxyFrame  = $('proxy-frame');

const conn = new BareMux.BareMuxConnection('/baremux/worker.js');
const PUBLIC_WISP = 'wss://wisp.mercurywork.shop/wisp/';

let axisFrame = null;   // ScramjetFrame instance
let browsing  = false;

// ── URL helpers ───────────────────────────────────────────────────
function toUrl(s) {
  s = s.trim();
  if (/^https?:\/\//i.test(s)) return s;
  if (!s.includes(' ') && /^[a-z0-9-]+(\.[a-z]{2,})(\/.*)?$/i.test(s)) return 'https://' + s;
  return 'https://duckduckgo.com/?q=' + encodeURIComponent(s);
}

// ── View switching ────────────────────────────────────────────────
function showBrowsing() {
  newTab.hidden   = true;
  proxyFrame.hidden = false;
  browsing = true;
}

function showNewTab() {
  newTab.hidden   = false;
  proxyFrame.hidden = true;
  browsing = false;
  urlBar.value = '';
  setTimeout(() => searchInput.focus(), 50);
}

// ── Navigation ────────────────────────────────────────────────────
function navigate(url) {
  const ctrl = window.__axisCtrl;
  if (!ctrl) { setStatus('⚠ Proxy not ready.', true); return; }

  if (!axisFrame) {
    axisFrame = ctrl.createFrame(proxyFrame);
    axisFrame.addEventListener('urlchange', e => {
      urlBar.value = e.url;
    });
  }

  axisFrame.go(url);
  urlBar.value = url;
  showBrowsing();
}

// ── Chrome controls ───────────────────────────────────────────────
btnBack.addEventListener('click', () => axisFrame?.back());
btnFwd.addEventListener('click',  () => axisFrame?.forward());
btnReload.addEventListener('click', () => {
  if (browsing) axisFrame?.reload();
  else initProxy();
});
btnHome.addEventListener('click', showNewTab);

chromeForm.addEventListener('submit', e => {
  e.preventDefault();
  const v = urlBar.value.trim();
  if (v) navigate(toUrl(v));
});

urlBar.addEventListener('focus', () => urlBar.select());

// ── New-tab search ────────────────────────────────────────────────
searchForm.addEventListener('submit', e => {
  e.preventDefault();
  const v = searchInput.value.trim();
  if (v) navigate(toUrl(v));
});

// ── WISP check ────────────────────────────────────────────────────
function checkWisp(url) {
  return new Promise(resolve => {
    const ws = new WebSocket(url);
    const done = ok => { clearTimeout(t); try { ws.close(); } catch (_) {} resolve(ok); };
    const t = setTimeout(() => done(false), 2500);
    ws.addEventListener('open',  () => done(true));
    ws.addEventListener('error', () => done(false));
  });
}

// ── Proxy init ────────────────────────────────────────────────────
async function initProxy() {
  if (!('serviceWorker' in navigator)) {
    setStatus('⚠ Service workers not supported.', true);
    return;
  }

  try {
    setStatus('Registering service worker…');
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/scramjet/' });

    await new Promise((resolve, reject) => {
      if (reg.active) { resolve(); return; }
      const sw = reg.installing || reg.waiting;
      if (!sw) { reject(new Error('No service worker found')); return; }
      sw.addEventListener('statechange', function() {
        if (this.state === 'activated') resolve();
        if (this.state === 'redundant')  reject(new Error('Service worker install failed'));
      });
    });

    setStatus('Setting up transport…');
    const localWisp  = `wss://${location.host}/wisp/`;
    const wispUrl    = (await checkWisp(localWisp)) ? localWisp : PUBLIC_WISP;

    // Try libcurl first, fall back to epoxy
    try {
      await conn.setTransport('/libcurl/index.mjs', [{ wisp: wispUrl }]);
      setStatus('Transport: libcurl');
    } catch {
      await conn.setTransport('/epoxy/index.mjs', [{ wisp: wispUrl }]);
      setStatus('Transport: epoxy');
    }

    setStatus('Starting proxy engine…');
    const { ScramjetController } = $scramjetLoadController();
    const ctrl = new ScramjetController({
      prefix: '/scramjet/',
      files: {
        wasm: '/scramjet/scramjet.wasm.wasm',
        all:  '/scramjet/scramjet.all.js',
        sync: '/scramjet/scramjet.sync.js',
      },
    });
    await ctrl.init();
    window.__axisCtrl = ctrl;
    setStatus('');
  } catch (e) {
    console.error('[axis] init failed:', e);
    setStatus('⚠ ' + e.message, true);
  }
}

function setStatus(msg, warn = false) {
  statusEl.textContent = msg;
  statusEl.style.color = warn ? '#f66' : '#555';
}

// ── Boot ──────────────────────────────────────────────────────────
initProxy();
window.addEventListener('load', () => searchInput.focus());
