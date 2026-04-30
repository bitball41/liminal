/* Axis — app.js */

const $ = id => document.getElementById(id);

const btnBack     = $('btn-back');
const btnFwd      = $('btn-fwd');
const btnReload   = $('btn-reload');
const btnHome     = $('btn-home');
const chromeForm  = $('chrome-form');
const urlBar      = $('url-bar');
const tabsEl      = $('tabs');
const btnAddTab   = $('btn-add-tab');
const searchForm  = $('search-form');
const searchInput = $('search-input');
const statusEl    = $('status');
const newTabPage  = $('new-tab');

const conn = new BareMux.BareMuxConnection('/baremux/worker.js');
const PUBLIC_WISP = 'wss://wisp.mercurywork.shop/wisp/';

// Must be narrow enough that scramjet's own static files are NOT under this
// path, otherwise the SW intercepts them before they load.
const PROXY_PREFIX = '/scramjet/proxy/';

let tabs     = [];
let activeId = null;
let tabSeq   = 0;

// ── Tab management ────────────────────────────────────────────────
function getTab(id)  { return tabs.find(t => t.id === id); }
function getActive() { return getTab(activeId); }

function openTab(url) {
  const id     = ++tabSeq;
  const iframe = document.createElement('iframe');
  iframe.className = 'proxy-frame';
  iframe.setAttribute('sandbox',
    'allow-same-origin allow-scripts allow-forms allow-popups allow-modals ' +
    'allow-pointer-lock allow-storage-access-by-user-activation ' +
    'allow-orientation-lock allow-presentation');
  document.body.appendChild(iframe);

  const tabEl = document.createElement('div');
  tabEl.className = 'tab';
  tabEl.innerHTML =
    '<span class="tab-title">New Tab</span>' +
    '<button class="tab-close" title="Close tab">×</button>';
  tabEl.addEventListener('click', e => {
    if (!e.target.classList.contains('tab-close')) switchTab(id);
  });
  tabEl.querySelector('.tab-close').addEventListener('click', e => {
    e.stopPropagation();
    closeTab(id);
  });
  tabsEl.appendChild(tabEl);

  const tab = { id, iframe, tabEl, axisFrame: null, url: null, browsing: false };
  tabs.push(tab);
  switchTab(id);
  if (url) navigate(url);
}

function switchTab(id) {
  const prev = getActive();
  if (prev) {
    prev.iframe.style.display = 'none';
    prev.tabEl.classList.remove('active');
  }

  activeId = id;
  const tab = getActive();
  if (!tab) return;

  tab.tabEl.classList.add('active');

  if (tab.browsing) {
    tab.iframe.style.display = '';
    newTabPage.hidden = true;
    urlBar.value = tab.url || '';
  } else {
    tab.iframe.style.display = 'none';
    showNewTab();
  }
}

function closeTab(id) {
  const idx = tabs.findIndex(t => t.id === id);
  if (idx === -1) return;
  const tab = tabs[idx];
  tab.iframe.remove();
  tab.tabEl.remove();
  tabs.splice(idx, 1);

  if (tabs.length === 0) { openTab(); return; }

  if (activeId === id) {
    switchTab(tabs[Math.min(idx, tabs.length - 1)].id);
  }
}

function setTabTitle(tab, text) {
  tab.tabEl.querySelector('.tab-title').textContent = text || 'New Tab';
}

// ── View switching ────────────────────────────────────────────────
function showNewTab() {
  newTabPage.hidden = false;
  urlBar.value = '';
  setTimeout(() => searchInput.focus(), 50);
}

// ── Navigation ────────────────────────────────────────────────────
function navigate(url) {
  const ctrl = window.__axisCtrl;
  if (!ctrl) { setStatus('⚠ Proxy not ready.', true); return; }

  const tab = getActive();
  if (!tab) return;

  if (!tab.axisFrame) {
    tab.axisFrame = ctrl.createFrame(tab.iframe);
    tab.axisFrame.addEventListener('urlchange', e => {
      tab.url = e.url;
      if (activeId === tab.id) urlBar.value = e.url;
      try {
        setTabTitle(tab, new URL(e.url).hostname || e.url);
      } catch {
        setTabTitle(tab, e.url);
      }
    });
  }

  tab.axisFrame.go(url);
  tab.url = url;
  tab.browsing = true;
  urlBar.value = url;
  try { setTabTitle(tab, new URL(url).hostname || url); } catch { setTabTitle(tab, url); }

  newTabPage.hidden = true;
  tab.iframe.style.display = '';
}

// ── Chrome controls ───────────────────────────────────────────────
btnBack.addEventListener('click', () => getActive()?.axisFrame?.back());
btnFwd.addEventListener('click',  () => getActive()?.axisFrame?.forward());
btnReload.addEventListener('click', () => {
  const tab = getActive();
  if (tab?.browsing) tab.axisFrame?.reload();
  else initProxy();
});
btnHome.addEventListener('click', () => {
  const tab = getActive();
  if (tab) { tab.browsing = false; showNewTab(); tab.iframe.style.display = 'none'; }
});
btnAddTab.addEventListener('click', () => openTab());

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

// ── URL helpers ───────────────────────────────────────────────────
function toUrl(s) {
  s = s.trim();
  if (/^https?:\/\//i.test(s)) return s;
  if (!s.includes(' ') && /^[a-z0-9-]+(\.[a-z]{2,})(\/.*)?$/i.test(s)) return 'https://' + s;
  return 'https://duckduckgo.com/?q=' + encodeURIComponent(s);
}

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

    // Remove old SW registrations with wrong scope so they don't intercept
    // static assets or hold open stale IDB connections.
    for (const reg of await navigator.serviceWorker.getRegistrations()) {
      if (!reg.scope.endsWith(PROXY_PREFIX)) await reg.unregister();
    }

    const reg = await navigator.serviceWorker.register('/sw.js', {
      scope: PROXY_PREFIX,
      updateViaCache: 'none',
    });

    await new Promise((resolve, reject) => {
      if (reg.active) { resolve(); return; }
      const sw = reg.installing || reg.waiting;
      if (!sw) { reject(new Error('No service worker found')); return; }
      sw.addEventListener('statechange', function() {
        if (this.state === 'activated') resolve();
        if (this.state === 'redundant')  reject(new Error('Service worker install failed'));
      });
    });

    setInterval(() => reg.update(), 30 * 60 * 1000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update();
    });

    setStatus('Setting up transport…');
    const localWisp = `wss://${location.host}/wisp/`;
    const wispUrl   = (await checkWisp(localWisp)) ? localWisp : PUBLIC_WISP;

    await conn.setTransport('/epoxy/index.mjs', [{ wisp: wispUrl }]);
    setStatus('Transport: epoxy');

    setStatus('Starting proxy engine…');
    const { ScramjetController } = $scramjetLoadController();
    const ctrl = new ScramjetController({
      prefix: PROXY_PREFIX,
      files: {
        wasm: '/scramjet/scramjet.wasm.wasm',
        all:  '/scramjet/scramjet.all.js',
        sync: '/scramjet/scramjet.sync.js',
      },
    });

    try {
      await ctrl.init();
    } catch (e) {
      if (e.message?.includes('object store') || e.message?.includes('IDBDatabase')) {
        await new Promise(r => {
          const req = indexedDB.deleteDatabase('$scramjet');
          req.onsuccess = req.onerror = req.onblocked = r;
        });
        await ctrl.init();
      } else {
        throw e;
      }
    }

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
const prevController = navigator.serviceWorker?.controller ?? null;
navigator.serviceWorker?.addEventListener('controllerchange', () => {
  if (prevController) window.location.reload();
});

initProxy();
openTab();
window.addEventListener('load', () => searchInput.focus());
