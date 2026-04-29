/* Axis — app.js */

const $ = id => document.getElementById(id);

const btnBack       = $('btn-back');
const btnFwd        = $('btn-fwd');
const btnReload     = $('btn-reload');
const btnHome       = $('btn-home');
const btnMenu       = $('btn-menu');
const chromeForm    = $('chrome-form');
const urlBar        = $('url-bar');
const newTab        = $('new-tab');
const searchForm    = $('search-form');
const searchInput   = $('search-input');
const statusEl      = $('status');
const proxyFrame    = $('proxy-frame');
const settingsPanel = $('settings-panel');
const faviconEl     = $('favicon');

const DEFAULT_FAVICON = faviconEl.href;

const conn = new BareMux.BareMuxConnection('/baremux/worker.js');

// Ordered list of WISP servers to try. Local is always first (dynamic).
const WISP_FALLBACKS = [
  'wss://wisp.mercurywork.shop/wisp/',
  'wss://wisp.eduu.eu.org/wisp/',
  'wss://wisp.fn.nadeko.net/wisp/',
];

let activeWispUrl  = null;
let transportReady = false;

let axisFrame = null;
let browsing  = false;

// ── History tracking ──────────────────────────────────────────────
const navStack  = [];
let navPos      = -1;
let histNavFlag = false;

function updateNavBtns() {
  btnBack.disabled = navPos <= 0;
  btnFwd.disabled  = navPos >= navStack.length - 1;
}

// ── URL helpers ───────────────────────────────────────────────────
function toUrl(s) {
  s = s.trim();
  if (/^https?:\/\//i.test(s)) return s;
  if (!s.includes(' ') && /^[a-z0-9-]+(\.[a-z]{2,})(\/.*)?$/i.test(s)) return 'https://' + s;
  const engine = localStorage.getItem('searchEngine') || 'duckduckgo';
  if (engine === 'brave') return 'https://search.brave.com/search?q=' + encodeURIComponent(s);
  return 'https://duckduckgo.com/?q=' + encodeURIComponent(s);
}

// ── View switching ────────────────────────────────────────────────
function showBrowsing() {
  newTab.hidden     = true;
  proxyFrame.hidden = false;
  browsing = true;
}

function showNewTab() {
  newTab.hidden     = false;
  proxyFrame.hidden = true;
  browsing = false;
  urlBar.value = '';
  setTimeout(() => searchInput.focus(), 50);
}

// ── Navigation ────────────────────────────────────────────────────
async function navigate(url) {
  if (!transportReady) {
    setStatus('Reconnecting…');
    const ok = await reinitTransport();
    if (!ok) { setStatus('⚠ Transport failed. Click reload to retry.', true); return; }
  }
  const ctrl = window.__axisCtrl;
  if (!ctrl) { setStatus('⚠ Proxy not ready.', true); return; }

  if (!axisFrame) {
    axisFrame = ctrl.createFrame(proxyFrame);
    axisFrame.addEventListener('urlchange', e => {
      urlBar.value = e.url;
      if (!histNavFlag) {
        if (e.url !== navStack[navPos]) {
          if (navPos < navStack.length - 1) navStack.splice(navPos + 1);
          navStack.push(e.url);
          navPos = navStack.length - 1;
        }
      }
      histNavFlag = false;
      updateNavBtns();
    });
  }

  axisFrame.go(url);
  urlBar.value = url;
  showBrowsing();
}

// ── Chrome controls ───────────────────────────────────────────────
btnBack.addEventListener('click', () => {
  if (axisFrame && navPos > 0) {
    histNavFlag = true;
    navPos--;
    axisFrame.back();
    updateNavBtns();
  }
});

btnFwd.addEventListener('click', () => {
  if (axisFrame && navPos < navStack.length - 1) {
    histNavFlag = true;
    navPos++;
    axisFrame.forward();
    updateNavBtns();
  }
});

btnReload.addEventListener('click', async () => {
  if (!transportReady) {
    await reinitTransport();
    if (browsing && transportReady) axisFrame?.reload();
  } else if (browsing) {
    axisFrame?.reload();
  } else {
    initProxy();
  }
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

// ── Settings panel ────────────────────────────────────────────────
btnMenu.addEventListener('click', e => {
  e.stopPropagation();
  settingsPanel.hidden = !settingsPanel.hidden;
});

document.addEventListener('click', e => {
  if (!settingsPanel.hidden && !settingsPanel.contains(e.target) && e.target !== btnMenu) {
    settingsPanel.hidden = true;
  }
});

// Search engine
const engineRadios = document.querySelectorAll('input[name="engine"]');
engineRadios.forEach(r => {
  r.addEventListener('change', () => localStorage.setItem('searchEngine', r.value));
});

function loadSearchEngine() {
  const engine = localStorage.getItem('searchEngine') || 'duckduckgo';
  engineRadios.forEach(r => { r.checked = r.value === engine; });
}

// about:blank launcher
function launchInAboutBlank() {
  const w = window.open('', '_blank');
  if (!w) { alert('Popup blocked — please allow popups for this site.'); return; }
  const sandbox = [
    'allow-same-origin', 'allow-scripts', 'allow-forms', 'allow-popups',
    'allow-modals', 'allow-pointer-lock', 'allow-storage-access-by-user-activation',
    'allow-orientation-lock', 'allow-presentation',
  ].join(' ');
  w.document.open();
  w.document.write(
    '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
    '*{margin:0;padding:0;border:0}html,body{width:100%;height:100%;overflow:hidden}' +
    'iframe{position:fixed;top:0;left:0;width:100%;height:100%;border:none}' +
    '</style></head><body><iframe src="' + location.href +
    '" sandbox="' + sandbox + '" allow="*"></iframe></body></html>'
  );
  w.document.close();
}

$('launch-blank').addEventListener('click', () => {
  launchInAboutBlank();
  settingsPanel.hidden = true;
});

const autoBlankToggle = $('auto-blank');
autoBlankToggle.addEventListener('change', () => {
  localStorage.setItem('autoBlank', autoBlankToggle.checked ? 'true' : 'false');
  if (autoBlankToggle.checked) launchInAboutBlank();
});

function loadAutoBlank() {
  autoBlankToggle.checked = localStorage.getItem('autoBlank') === 'true';
}

// Tab cloaker
const cloakTitleInput   = $('cloak-title');
const cloakFaviconInput = $('cloak-favicon');

function setFavicon(href) {
  faviconEl.href = href;
}

function applyCloak() {
  const title   = cloakTitleInput.value.trim();
  const favicon = cloakFaviconInput.value.trim();

  if (title) { localStorage.setItem('cloakTitle', title); document.title = title; }
  else       { localStorage.removeItem('cloakTitle');      document.title = 'Axis'; }

  if (favicon) { localStorage.setItem('cloakFavicon', favicon); setFavicon(favicon); }
  else         { localStorage.removeItem('cloakFavicon');        setFavicon(DEFAULT_FAVICON); }

  settingsPanel.hidden = true;
}

function resetCloak() {
  localStorage.removeItem('cloakTitle');
  localStorage.removeItem('cloakFavicon');
  cloakTitleInput.value   = '';
  cloakFaviconInput.value = '';
  document.title = 'Axis';
  setFavicon(DEFAULT_FAVICON);
}

function loadCloak() {
  const title   = localStorage.getItem('cloakTitle');
  const favicon = localStorage.getItem('cloakFavicon');
  if (title)   { cloakTitleInput.value = title;   document.title = title; }
  if (favicon) { cloakFaviconInput.value = favicon; setFavicon(favicon); }
}

$('apply-cloak').addEventListener('click', applyCloak);
$('reset-cloak').addEventListener('click', resetCloak);

// ── Settings init ─────────────────────────────────────────────────
function initSettings() {
  loadSearchEngine();
  loadAutoBlank();
  loadCloak();
  // Auto-launch in about:blank if enabled and we are the top-level window
  if (localStorage.getItem('autoBlank') === 'true' && window.parent === window) {
    launchInAboutBlank();
  }
}

// ── WISP helpers ─────────────────────────────────────────────────
function checkWisp(url) {
  return new Promise(resolve => {
    const ws = new WebSocket(url);
    const done = ok => { clearTimeout(t); try { ws.close(); } catch (_) {} resolve(ok); };
    const t = setTimeout(() => done(false), 2500);
    ws.addEventListener('open',  () => done(true));
    ws.addEventListener('error', () => done(false));
  });
}

async function pickWisp() {
  const local = `wss://${location.host}/wisp/`;
  if (await checkWisp(local)) return local;
  for (const url of WISP_FALLBACKS) {
    if (await checkWisp(url)) return url;
  }
  return null;
}

async function setTransport(wispUrl) {
  try {
    await conn.setTransport('/libcurl/index.mjs', [{ wisp: wispUrl }]);
    return 'libcurl';
  } catch {
    await conn.setTransport('/epoxy/index.mjs', [{ wisp: wispUrl }]);
    return 'epoxy';
  }
}

// Re-establish WISP + transport without re-registering the service worker.
async function reinitTransport() {
  transportReady = false;
  try {
    setStatus('Finding WISP server…');
    const wispUrl = await pickWisp();
    if (!wispUrl) throw new Error('No reachable WISP server found.');
    activeWispUrl = wispUrl;
    const transport = await setTransport(wispUrl);
    setStatus(`Reconnected (${transport})`);
    transportReady = true;
    setTimeout(() => { if (statusEl.textContent.startsWith('Reconnected')) setStatus(''); }, 2000);
    return true;
  } catch (e) {
    console.error('[axis] transport reinit failed:', e);
    setStatus('⚠ ' + e.message, true);
    return false;
  }
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

    setStatus('Finding WISP server…');
    const wispUrl = await pickWisp();
    if (!wispUrl) throw new Error('No reachable WISP server. Check your connection.');
    activeWispUrl = wispUrl;

    const transport = await setTransport(wispUrl);
    setStatus(`Transport: ${transport}`);

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
    transportReady = true;
    setStatus('');

    // Detect when the mux dies and mark transport as needing reconnect.
    navigator.serviceWorker.addEventListener('message', e => {
      if (e.data?.type === 'wisp-error') {
        transportReady = false;
        setStatus('⚠ Connection lost — click reload to reconnect.', true);
      }
    });
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
initSettings();
initProxy();
window.addEventListener('load', () => searchInput.focus());
