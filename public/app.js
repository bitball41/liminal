/* Axis — app.js */

const $ = id => document.getElementById(id);

const btnBack       = $('btn-back');
const btnFwd        = $('btn-fwd');
const btnReload     = $('btn-reload');
const btnHome       = $('btn-home');
const btnMenu       = $('btn-menu');
const btnNewTab     = $('btn-new-tab');
const chromeForm    = $('chrome-form');
const urlBar        = $('url-bar');
const newTabPage    = $('new-tab');
const searchForm    = $('search-form');
const searchInput   = $('search-input');
const statusEl      = $('status');
const tabList       = $('tab-list');
const settingsPanel = $('settings-panel');
const faviconEl     = $('favicon');

const DEFAULT_FAVICON = faviconEl.href;
const FRAME_SANDBOX = [
  'allow-same-origin', 'allow-scripts', 'allow-forms', 'allow-popups',
  'allow-modals', 'allow-pointer-lock', 'allow-storage-access-by-user-activation',
  'allow-orientation-lock', 'allow-presentation',
].join(' ');

let conn = new BareMux.BareMuxConnection('/baremux/worker.js');

const WISP_FALLBACKS = [
  'wss://wisp.mercurywork.shop/wisp/',
  'wss://wisp.eduu.eu.org/wisp/',
  'wss://wisp.fn.nadeko.net/wisp/',
];

let activeWispUrl  = null;
let transportReady = false;

// ── Tabs ──────────────────────────────────────────────────────────
let tabIdSeq = 0;
const tabs   = [];
let activeTab = null;

function makeTab() {
  const iframe = document.createElement('iframe');
  iframe.className = 'proxy-frame';
  iframe.hidden = true;
  iframe.setAttribute('sandbox', FRAME_SANDBOX);
  document.body.appendChild(iframe);

  const tab = {
    id: ++tabIdSeq,
    iframe,
    frame: null,          // ScramjetFrame, created lazily
    url: '',
    title: 'New Tab',
    browsing: false,
    navStack: [],
    navPos: -1,
    _histFlag: false,
    el: null,
  };
  tab.el = buildTabEl(tab);
  tabList.appendChild(tab.el);
  tabs.push(tab);
  return tab;
}

function buildTabEl(tab) {
  const el = document.createElement('div');
  el.className = 'tab';
  el.innerHTML =
    '<span class="tab-title">New Tab</span>' +
    '<button class="tab-close" title="Close tab">' +
    '<svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">' +
    '<line x1="2" y1="2" x2="8" y2="8"/><line x1="8" y1="2" x2="2" y2="8"/>' +
    '</svg></button>';

  el.addEventListener('click', e => {
    if (!e.target.closest('.tab-close')) switchTab(tab.id);
  });
  el.querySelector('.tab-close').addEventListener('click', e => {
    e.stopPropagation();
    closeTab(tab.id);
  });
  return el;
}

function refreshTab(tab) {
  tab.el.querySelector('.tab-title').textContent = tab.title;
  tab.el.classList.toggle('active', tab === activeTab);
}

function switchTab(id) {
  const tab = tabs.find(t => t.id === id);
  if (!tab || tab === activeTab) return;

  if (activeTab) {
    activeTab.iframe.hidden = true;
    activeTab.el.classList.remove('active');
  }
  activeTab = tab;
  tab.el.classList.add('active');

  if (tab.browsing) {
    newTabPage.hidden = true;
    tab.iframe.hidden = false;
    urlBar.value = tab.url;
  } else {
    newTabPage.hidden = false;
    urlBar.value = '';
    setTimeout(() => searchInput.focus(), 50);
  }
  updateNavBtns();
  tab.el.scrollIntoView({ inline: 'nearest' });
}

function closeTab(id) {
  const idx = tabs.findIndex(t => t.id === id);
  if (idx === -1) return;
  const tab = tabs[idx];

  tab.iframe.remove();
  tab.el.remove();
  tabs.splice(idx, 1);

  if (tabs.length === 0) {
    switchTab(makeTab().id);
    return;
  }
  if (activeTab === tab) {
    switchTab(tabs[Math.min(idx, tabs.length - 1)].id);
  }
}

btnNewTab.addEventListener('click', () => switchTab(makeTab().id));

// ── URL helpers ───────────────────────────────────────────────────
function toUrl(s) {
  s = s.trim();
  if (/^https?:\/\//i.test(s)) return s;
  if (!s.includes(' ') && /^[a-z0-9-]+(\.[a-z]{2,})(\/.*)?$/i.test(s)) return 'https://' + s;
  const engine = localStorage.getItem('searchEngine') || 'duckduckgo';
  if (engine === 'brave') return 'https://search.brave.com/search?q=' + encodeURIComponent(s);
  return 'https://duckduckgo.com/?q=' + encodeURIComponent(s);
}

function domainOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

// ── Navigation ────────────────────────────────────────────────────
function updateNavBtns() {
  const t = activeTab;
  btnBack.disabled = !t || t.navPos <= 0;
  btnFwd.disabled  = !t || t.navPos >= t.navStack.length - 1;
}

async function navigate(url) {
  if (!transportReady) {
    setStatus('Reconnecting…');
    const ok = await reinitTransport();
    if (!ok) { setStatus('⚠ Transport failed. Click reload to retry.', true); return; }
  }
  const ctrl = window.__axisCtrl;
  if (!ctrl) { setStatus('⚠ Proxy not ready.', true); return; }

  const tab = activeTab;

  if (!tab.frame) {
    tab.frame = ctrl.createFrame(tab.iframe);
    tab.frame.addEventListener('urlchange', e => {
      tab.url = e.url;
      tab.title = domainOf(e.url);
      refreshTab(tab);
      if (tab === activeTab) urlBar.value = e.url;

      if (!tab._histFlag) {
        if (e.url !== tab.navStack[tab.navPos]) {
          if (tab.navPos < tab.navStack.length - 1) tab.navStack.splice(tab.navPos + 1);
          tab.navStack.push(e.url);
          tab.navPos = tab.navStack.length - 1;
        }
      }
      tab._histFlag = false;
      if (tab === activeTab) updateNavBtns();
    });
  }

  tab.frame.go(url);
  tab.url = url;
  tab.title = domainOf(url);
  tab.browsing = true;
  refreshTab(tab);
  newTabPage.hidden = true;
  tab.iframe.hidden = false;
  urlBar.value = url;
  updateNavBtns();
}

// ── Chrome controls ───────────────────────────────────────────────
btnBack.addEventListener('click', () => {
  const t = activeTab;
  if (t?.frame && t.navPos > 0) {
    t._histFlag = true;
    t.navPos--;
    t.frame.back();
    updateNavBtns();
  }
});

btnFwd.addEventListener('click', () => {
  const t = activeTab;
  if (t?.frame && t.navPos < t.navStack.length - 1) {
    t._histFlag = true;
    t.navPos++;
    t.frame.forward();
    updateNavBtns();
  }
});

btnReload.addEventListener('click', async () => {
  if (!transportReady) {
    await reinitTransport();
    if (activeTab?.browsing && transportReady) activeTab.frame?.reload();
  } else if (activeTab?.browsing) {
    activeTab.frame?.reload();
  } else {
    initProxy();
  }
});

btnHome.addEventListener('click', () => {
  if (!activeTab) return;
  activeTab.browsing = false;
  activeTab.title = 'New Tab';
  refreshTab(activeTab);
  activeTab.iframe.hidden = true;
  newTabPage.hidden = false;
  urlBar.value = '';
  updateNavBtns();
  setTimeout(() => searchInput.focus(), 50);
});

chromeForm.addEventListener('submit', e => {
  e.preventDefault();
  const v = urlBar.value.trim();
  if (v) navigate(toUrl(v));
});

urlBar.addEventListener('focus', () => urlBar.select());

searchForm.addEventListener('submit', e => {
  e.preventDefault();
  const v = searchInput.value.trim();
  if (v) navigate(toUrl(v));
});

// Ctrl+T / Ctrl+W keyboard shortcuts
document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.key === 't') { e.preventDefault(); switchTab(makeTab().id); }
  if (e.ctrlKey && e.key === 'w') { e.preventDefault(); if (activeTab) closeTab(activeTab.id); }
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

function setFavicon(href) { faviconEl.href = href; }

function applyCloak() {
  const title   = cloakTitleInput.value.trim();
  const favicon = cloakFaviconInput.value.trim();
  if (title)   { localStorage.setItem('cloakTitle',   title);   document.title = title; }
  else         { localStorage.removeItem('cloakTitle');           document.title = 'Axis'; }
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
  if (localStorage.getItem('autoBlank') === 'true' && window.parent === window) {
    launchInAboutBlank();
  }
}

// ── WISP helpers ──────────────────────────────────────────────────
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

function resetBareMuxDB() {
  return new Promise(resolve => {
    const req = indexedDB.deleteDatabase('bare-mux');
    req.onsuccess = req.onerror = resolve;
  });
}

async function setTransport(wispUrl) {
  const attempt = async () => {
    try {
      await conn.setTransport('/libcurl/index.mjs', [{ wisp: wispUrl }]);
      return 'libcurl';
    } catch {
      await conn.setTransport('/epoxy/index.mjs', [{ wisp: wispUrl }]);
      return 'epoxy';
    }
  };

  try {
    return await attempt();
  } catch (e) {
    // Stale IndexedDB schema (e.g. "config is not a known object store") —
    // wipe the database and retry with a fresh connection.
    if (String(e).includes('object store')) {
      console.warn('[axis] bare-mux IDB schema stale, resetting…', e);
      await resetBareMuxDB();
      conn = new BareMux.BareMuxConnection('/baremux/worker.js');
      return await attempt();
    }
    throw e;
  }
}

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
switchTab(makeTab().id);
window.addEventListener('load', () => searchInput.focus());
