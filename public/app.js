/* Bardo — app.js */

const $ = id => document.getElementById(id);

const nav           = $('chrome');
const btnBack       = $('btn-back');
const btnFwd        = $('btn-fwd');
const btnReload     = $('btn-reload');
const btnHome       = $('btn-home');
const chromeForm    = $('chrome-form');
const urlBar        = $('url-bar');
const newTab        = $('new-tab');
const searchForm    = $('search-form');
const searchInput   = $('search-input');
const statusEl      = $('status');
const tabBarTabs    = $('tab-bar-tabs');
const btnNewTab     = $('btn-new-tab');
const bookmarksBar  = $('bookmarks-bar');
const bookmarksList = $('bookmarks-list');
const btnAddBm      = $('btn-add-bookmark');
const btnMenu          = $('btn-menu');
const btnWaffle        = $('btn-waffle');
const wafflePanel      = $('waffle-panel');
const btnOpenTab       = $('btn-open-tab');
const btnDevtools      = $('btn-devtools');
const settingsOverlay  = $('settings-overlay');
const btnSettingsClose = $('btn-settings-close');
const btnStealthLaunch = $('btn-stealth-launch');
const btnForceReload = $('btn-force-reload');

const conn = new BareMux.BareMuxConnection('/baremux/worker.js');
const PUBLIC_WISP_SERVERS = [
  'wss://wisp.mercurywork.shop/wisp/',
  'wss://anura.pro/wisp/',
  'wss://nebulaservices.org/wisp/',
  'wss://wisp.terbiumon.top/wisp/',
];
const SVC_PREFIX    = '/scramjet/service/';
const SVC_PREFIX_V2 = '/scramjet2/service/';

const BARDO_FAVICON = "data:image/svg+xml," + encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'>` +
  `<path d='M8 34 L8 19 Q8 6 20 6 Q32 6 32 19 L32 34' stroke='white' stroke-width='2.5' fill='none' stroke-linecap='round'/>` +
  `<line x1='4' y1='34' x2='36' y2='34' stroke='white' stroke-width='2.5' stroke-linecap='round'/></svg>`
);

// ── Settings ──────────────────────────────────────────────────────
const SEARCH_ENGINES = {
  duckduckgo: q => 'https://duckduckgo.com/?q=' + encodeURIComponent(q),
  google:     q => 'https://www.google.com/search?q=' + encodeURIComponent(q),
  bing:       q => 'https://www.bing.com/search?q=' + encodeURIComponent(q),
  brave:      q => 'https://search.brave.com/search?q=' + encodeURIComponent(q),
  startpage:  q => 'https://www.startpage.com/search?q=' + encodeURIComponent(q),
};

// Use Google's favicon CDN so cloaks show the real site icons
function gFav(domain) {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
}

const TAB_CLOAKS = {
  none:      { title: 'Bardo',                          favicon: null },
  canvas:    { title: 'Dashboard - Canvas',              favicon: gFav('instructure.com') },
  gdrive:    { title: 'My Drive - Google Drive',         favicon: gFav('drive.google.com') },
  canva:     { title: 'Home - Canva',                    favicon: gFav('canva.com') },
  classlink: { title: 'ClassLink Launchpad',             favicon: gFav('launchpad.classlink.com') },
  blooket:   { title: 'Blooket',                         favicon: gFav('blooket.com') },
  classroom: { title: 'Google Classroom',                favicon: gFav('classroom.google.com') },
  docs:      { title: 'Untitled document - Google Docs', favicon: gFav('docs.google.com') },
};

const DEFAULT_SETTINGS = {
  theme: 'dark',
  aboutBlankMode: false,
  tabCloak: 'none',
  bookmarksVisible: false,
  bookmarks: [],
  searchEngine: 'duckduckgo',
  panicKey: '',
  panicUrl: 'https://classroom.google.com',
  erudaEnabled: false,
  engine: 'scramjet',
  tabPosition: 'top',
  customCursor: true,
  ntClock: true,
};

function loadSettings() {
  try {
    const raw = localStorage.getItem('bardo-settings');
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
  } catch (_) { return { ...DEFAULT_SETTINGS }; }
}

function saveSettings() {
  try { localStorage.setItem('bardo-settings', JSON.stringify(settings)); } catch (_) {}
}

let settings = loadSettings();

// ── Tab management ────────────────────────────────────────────────
let tabs = [];
let activeTabId = null;
let nextTabId = 0;
let dragSrcId = null;

function getActiveTab() {
  return tabs.find(t => t.id === activeTabId) ?? null;
}

function createTabIframe() {
  const iframe = document.createElement('iframe');
  iframe.className = 'nav-frame';
  iframe.hidden = true;
  iframe.setAttribute('sandbox',
    'allow-same-origin allow-scripts allow-forms allow-popups allow-modals ' +
    'allow-pointer-lock allow-storage-access-by-user-activation ' +
    'allow-orientation-lock allow-presentation allow-downloads'
  );
  document.body.appendChild(iframe);
  return iframe;
}

function openTab(url = null) {
  const id = nextTabId++;
  const iframe = createTabIframe();
  const tab = { id, title: 'New Tab', url: '', favicon: null, iframe, frame: null, navCount: 0, inPageNavCount: 0, homeBackUrl: null };
  tabs.push(tab);

  // When a proxied page finishes loading, finish the progress bar and pull the
  // real document title + favicon so the tab strip reads like a real browser.
  iframe.addEventListener('load', () => {
    if (!tab.url) return;
    if (tab.id === activeTabId) finishProgress();
    refreshTabMeta(tab);
  });

  activateTab(id);
  if (url) {
    navigate(url);
  } else {
    searchInput.value = '';
    setTimeout(() => searchInput.focus(), 50);
  }
  return tab;
}

function closeTab(id) {
  const idx = tabs.findIndex(t => t.id === id);
  if (idx === -1) return;
  tabs[idx].iframe.remove();
  tabs.splice(idx, 1);

  if (tabs.length === 0) { openTab(); return; }

  if (activeTabId === id) {
    activateTab(tabs[Math.min(idx, tabs.length - 1)].id);
  } else {
    renderTabs();
  }
}

function activateTab(id) {
  for (const t of tabs) t.iframe.hidden = true;
  newTab.hidden = true;

  activeTabId = id;
  const tab = tabs.find(t => t.id === id);
  if (!tab) { renderTabs(); return; }

  if (tab.url) {
    tab.iframe.hidden = false;
    urlBar.value = tab.url;
  } else {
    newTab.hidden = false;
    urlBar.value = '';
    searchInput.value = '';
  }

  updateNavButtons(tab);
  renderTabs();
}

function updateNavButtons(tab) {
  if (!tab) { btnBack.disabled = true; btnFwd.disabled = true; return; }
  btnBack.disabled = tab.navCount < 1 && tab.inPageNavCount < 1;
  btnFwd.disabled = !tab.homeBackUrl;
}

const PAGE_ICON = `<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="1" width="10" height="12" rx="1.5"/><line x1="4.5" y1="4.5" x2="9.5" y2="4.5"/><line x1="4.5" y1="7" x2="9.5" y2="7"/><line x1="4.5" y1="9.5" x2="7.5" y2="9.5"/></svg>`;

function renderTabs() {
  tabBarTabs.innerHTML = '';
  for (const tab of tabs) {
    const el = document.createElement('div');
    el.className = 'tab' + (tab.id === activeTabId ? ' active' : '');
    el.draggable = true;

    const fav = document.createElement('div');
    fav.className = 'tab-favicon';
    if (tab.favicon) {
      const img = document.createElement('img');
      img.src = tab.favicon;
      img.alt = '';
      img.onerror = () => { fav.innerHTML = PAGE_ICON; };
      fav.appendChild(img);
    } else {
      fav.innerHTML = PAGE_ICON;
    }

    const title = document.createElement('span');
    title.className = 'tab-title';
    title.textContent = tab.title;

    const close = document.createElement('button');
    close.className = 'tab-close';
    close.title = 'Close tab';
    close.draggable = false;
    close.innerHTML = `<svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="2" y1="2" x2="8" y2="8"/><line x1="8" y1="2" x2="2" y2="8"/></svg>`;
    close.addEventListener('click', e => { e.stopPropagation(); closeTab(tab.id); });

    el.addEventListener('dragstart', e => {
      dragSrcId = tab.id;
      e.dataTransfer.effectAllowed = 'move';
      requestAnimationFrame(() => el.classList.add('dragging'));
    });
    el.addEventListener('dragend', () => {
      el.classList.remove('dragging');
      tabBarTabs.querySelectorAll('.drag-over').forEach(t => t.classList.remove('drag-over'));
      dragSrcId = null;
    });
    el.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (tab.id !== dragSrcId) {
        tabBarTabs.querySelectorAll('.drag-over').forEach(t => t.classList.remove('drag-over'));
        el.classList.add('drag-over');
      }
    });
    el.addEventListener('dragleave', e => {
      if (!el.contains(e.relatedTarget)) el.classList.remove('drag-over');
    });
    el.addEventListener('drop', e => {
      e.preventDefault();
      el.classList.remove('drag-over');
      if (dragSrcId === null || dragSrcId === tab.id) return;
      const srcIdx = tabs.findIndex(t => t.id === dragSrcId);
      const dstIdx = tabs.findIndex(t => t.id === tab.id);
      if (srcIdx === -1 || dstIdx === -1) return;
      const [moved] = tabs.splice(srcIdx, 1);
      tabs.splice(dstIdx, 0, moved);
      renderTabs();
    });

    el.appendChild(fav);
    el.appendChild(title);
    el.appendChild(close);
    el.addEventListener('click', () => activateTab(tab.id));
    tabBarTabs.appendChild(el);
  }
}

// ── Tab metadata + loading progress ───────────────────────────────
function setTabFavicon(tab, url) {
  try { tab.favicon = gFav(new URL(url).hostname); }
  catch (_) { tab.favicon = null; }
}

// Pull the real <title> from the proxied document (same-origin under Scramjet)
// so tabs show "YouTube" rather than the bare hostname.
function refreshTabMeta(tab) {
  if (!tab) return;
  try {
    const doc = tab.iframe.contentWindow?.document;
    const t = doc?.title?.trim();
    if (t) tab.title = t;
  } catch (_) { /* cross-origin or not ready — keep hostname */ }
  if (tab.id === activeTabId) renderTabs();
}

let progressTimer = null;
function startProgress() {
  const bar = $('progress-bar');
  if (!bar) return;
  clearTimeout(progressTimer);
  bar.classList.remove('done');
  bar.classList.add('active');
  bar.style.width = '0%';
  // Creep toward 75% so navigation always feels responsive, then finish on load.
  requestAnimationFrame(() => { bar.style.width = '75%'; });
}
function finishProgress() {
  const bar = $('progress-bar');
  if (!bar || !bar.classList.contains('active')) return;
  bar.style.width = '100%';
  bar.classList.add('done');
  progressTimer = setTimeout(() => {
    bar.classList.remove('active', 'done');
    bar.style.width = '0%';
  }, 320);
}

// ── URL helpers ───────────────────────────────────────────────────
function toUrl(s) {
  s = s.trim();
  if (/^https?:\/\//i.test(s)) return s;
  if (!s.includes(' ') && /^[a-z0-9-]+(\.[a-z]{2,})(\/.*)?$/i.test(s)) return 'https://' + s;
  const engine = SEARCH_ENGINES[settings.searchEngine] || SEARCH_ENGINES.duckduckgo;
  return engine(s);
}

// ── Navigation ────────────────────────────────────────────────────
let pendingUrl = null;

function navigate(url) {
  const ctrl = window.__bardoCtrl;
  if (!ctrl) {
    pendingUrl = url;
    setStatus('Loading, will navigate when ready…');
    // Still update UI so user sees something is happening
    const tab = getActiveTab();
    if (tab) { urlBar.value = url; }
    return;
  }

  const tab = getActiveTab();
  if (!tab) return;

  if (!tab.frame) {
    tab.frame = ctrl.createFrame(tab.iframe);
    tab.frame.addEventListener('urlchange', e => {
      tab.inPageNavCount++;
      tab.homeBackUrl = null;
      tab.url = e.url;
      if (tab.id === activeTabId) urlBar.value = e.url;
      try {
        const u = new URL(e.url);
        tab.title = u.hostname || 'Loading…';
      } catch (_) { tab.title = 'Loading…'; }
      setTabFavicon(tab, e.url);
      updateNavButtons(tab);
      renderTabs();
    });
  }

  tab.url = url;
  tab.navCount++;
  tab.inPageNavCount = 0;
  tab.homeBackUrl = null;
  if (tab.id === activeTabId) startProgress();
  tab.frame.go(url);
  urlBar.value = url;

  try { tab.title = new URL(url).hostname || 'Loading…'; }
  catch (_) { tab.title = 'Loading…'; }
  setTabFavicon(tab, url);

  newTab.hidden = true;
  tab.iframe.hidden = false;
  updateNavButtons(tab);
  renderTabs();
}

// ── Chrome controls ───────────────────────────────────────────────
btnBack.addEventListener('click', () => {
  const tab = getActiveTab();
  if (!tab) return;

  if (tab.inPageNavCount > 0) {
    // Navigate back within the current site
    tab.inPageNavCount--;
    tab.frame?.back();
    tab.iframe.contentWindow?.history?.back();
    updateNavButtons(tab);
  } else if (tab.navCount > 0) {
    // Back to home screen — save URL so forward can restore it
    tab.homeBackUrl = tab.url;
    tab.url = '';
    tab.title = 'New Tab';
    tab.navCount = 0;
    tab.inPageNavCount = 0;
    tab.iframe.hidden = true;
    newTab.hidden = false;
    urlBar.value = '';
    searchInput.value = '';
    updateNavButtons(tab);
    renderTabs();
    setTimeout(() => searchInput.focus(), 50);
  }
});

btnFwd.addEventListener('click', () => {
  const tab = getActiveTab();
  if (!tab) return;
  if (tab.homeBackUrl) {
    // Re-navigate to where we were before going home
    navigate(tab.homeBackUrl);
  } else {
    tab.frame?.forward();
    tab.iframe.contentWindow?.history?.forward();
  }
});

btnReload.addEventListener('click', () => {
  const tab = getActiveTab();
  if (tab?.url) tab.frame?.reload();
  else initEngine();
});

btnHome.addEventListener('click', () => {
  const tab = getActiveTab();
  if (!tab) return;
  tab.url = '';
  tab.title = 'New Tab';
  tab.navCount = 0;
  tab.iframe.hidden = true;
  newTab.hidden = false;
  urlBar.value = '';
  searchInput.value = '';
  updateNavButtons(tab);
  renderTabs();
  setTimeout(() => searchInput.focus(), 50);
});

btnNewTab.addEventListener('click', () => openTab());

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
function checkWisp(url, timeoutMs = 8000) {
  return new Promise(resolve => {
    const ws = new WebSocket(url);
    const done = ok => { clearTimeout(t); try { ws.close(); } catch (_) {} resolve(ok); };
    const t = setTimeout(() => done(false), timeoutMs);
    ws.addEventListener('open',  () => done(true));
    ws.addEventListener('error', () => done(false));
  });
}

// ── Engine init ───────────────────────────────────────────────────

function activeSvcPrefix() {
  const engine = settings.engine || 'scramjet';
  if (engine === 'scramjet2') return SVC_PREFIX_V2;
  return SVC_PREFIX;
}

async function registerSW(swPath, scope) {
  for (const reg of await navigator.serviceWorker.getRegistrations()) {
    if (!reg.scope.endsWith(scope)) await reg.unregister();
  }
  const reg = await navigator.serviceWorker.register(swPath, {
    scope,
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
  return reg;
}

// Schedule periodic SW updates exactly once, no matter how many times the
// engine is (re)initialised (e.g. when switching engines in settings). Without
// this guard every re-init stacked another 30-minute interval and another
// visibilitychange listener.
let activeSWReg = null;
let swUpdateScheduled = false;
function scheduleSWUpdate(reg) {
  // Track the *current* registration so switching engines re-points the
  // existing interval/listener at the new SW instead of leaving it stuck on
  // the first engine's registration (or stacking duplicate timers).
  activeSWReg = reg;
  if (swUpdateScheduled) return;
  swUpdateScheduled = true;
  setInterval(() => { if (activeSWReg) activeSWReg.update().catch(() => {}); }, 30 * 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && activeSWReg) activeSWReg.update().catch(() => {});
  });
}

// Resolves to the first URL whose probe returns true, or null if all fail.
function firstReachable(urls) {
  return new Promise(resolve => {
    let remaining = urls.length;
    if (remaining === 0) { resolve(null); return; }
    let settled = false;
    urls.forEach(url => {
      checkWisp(url).then(ok => {
        if (settled) return;
        if (ok) { settled = true; resolve(url); return; }
        if (--remaining === 0) resolve(null);
      });
    });
  });
}

async function setupTransport() {
  setStatus('Setting up transport…');
  const localWisp = `wss://${location.host}/wisp/`;

  // Probe local and all public servers in parallel. Prefer local when it
  // succeeds, otherwise use whichever public server responds first.
  const localPromise  = checkWisp(localWisp);
  const publicPromise = firstReachable(PUBLIC_WISP_SERVERS);

  let wispUrl;
  if (await localPromise) {
    wispUrl = localWisp;
  } else {
    const publicUrl = await publicPromise;
    if (publicUrl) {
      wispUrl = publicUrl;
    } else {
      throw new Error('No Wisp server reachable — check your connection.');
    }
  }

  await conn.setTransport('/epoxy/index.mjs', [{ wisp: wispUrl }]);
  return wispUrl;
}

async function initEngine(attempt = 1) {
  if (!('serviceWorker' in navigator)) {
    setStatus('⚠ Service workers not supported.', true);
    return;
  }
  const engine = settings.engine || 'scramjet';
  try {
    if (engine === 'scramjet2') {
      await initScramjet2(attempt);
    } else {
      await initScramjet(attempt);
    }
  } catch (e) {
    console.error(`[bardo] init failed (attempt ${attempt}):`, e);
    if (attempt < 3) {
      const delay = attempt * 2000;
      setStatus(`⚠ Error, retrying in ${delay / 1000}s…`, true);
      setTimeout(() => initEngine(attempt + 1), delay);
    } else if (!sessionStorage.getItem('bardo-sw-fix-attempted')) {
      sessionStorage.setItem('bardo-sw-fix-attempted', '1');
      setStatus('Refreshing…');
      await forceReload();
    } else {
      sessionStorage.removeItem('bardo-sw-fix-attempted');
      setStatus('⚠ ' + e.message, true);
    }
  }
}

async function initScramjet(attempt = 1) {
  // Order matters: the ScramjetController must provision the $scramjet
  // IndexedDB (object stores + config) BEFORE the service worker opens it.
  // Registering the SW first made both sides open the DB concurrently on a
  // fresh browser, deadlocking the IDB upgrade so ctrl.init() hung forever
  // at "Starting engine…". Build the controller first, then register the SW.
  await setupTransport();
  setStatus('Starting engine…');

  const { ScramjetController } = $scramjetLoadController();
  const ctrl = new ScramjetController({
    prefix: SVC_PREFIX,
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
      await new Promise(resolve => {
        const r = indexedDB.deleteDatabase('$scramjet');
        r.onsuccess = r.onerror = r.onblocked = () => resolve();
      });
      await ctrl.init();
    } else {
      throw e;
    }
  }

  // Now that the DB is fully provisioned, bring up the service worker. Only
  // after it is registered and active do we expose the controller — navigating
  // before the SW controls /scramjet/service/ would hit the network and 404.
  setStatus('Registering service worker…');
  const reg = await registerSW('/sw.js', SVC_PREFIX);
  scheduleSWUpdate(reg);

  window.__bardoCtrl = ctrl;
  sessionStorage.removeItem('bardo-sw-fix-attempted');
  setStatus('');

  if (pendingUrl) {
    const url = pendingUrl;
    pendingUrl = null;
    navigate(url);
  }
}

async function initScramjet2(attempt = 1) {
  await setupTransport();
  setStatus('Registering service worker (Scramjet v2)…');
  const reg = await registerSW('/sw-scramjet2.js', SVC_PREFIX_V2);
  scheduleSWUpdate(reg);

  setStatus('Starting Scramjet v2…');

  // v2 uses ScramjetFrame for per-tab navigation instead of a shared controller.
  // Provide a controller-compatible shim so navigate() works unchanged.
  window.__bardoCtrl = {
    _prefix: SVC_PREFIX_V2,
    createFrame(iframe) {
      return new BardoScramjet2Frame(iframe, SVC_PREFIX_V2);
    },
  };

  sessionStorage.removeItem('bardo-sw-fix-attempted');
  setStatus('');

  if (pendingUrl) {
    const url = pendingUrl;
    pendingUrl = null;
    navigate(url);
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Failed to load ' + src));
    document.head.appendChild(s);
  });
}

// Frame shim for Scramjet v2 — mirrors the ScramjetFrame API
class BardoScramjet2Frame {
  constructor(iframe, prefix) {
    this._iframe = iframe;
    this._prefix = prefix;
    this._listeners = {};
    iframe.addEventListener('load', () => this._onLoad());
  }
  _onLoad() {
    try {
      const href = this._iframe.contentWindow?.location.href;
      if (href && href.startsWith(location.origin + this._prefix)) {
        // URL is still scramjet-encoded; expose the raw encoded path as-is
        this._listeners.urlchange?.forEach(fn => fn({ url: href }));
      }
    } catch (_) {}
  }
  go(url) {
    // Scramjet v2 expects the URL encoded via its own scheme. For the alpha,
    // we use the same encoding that v1's controller would produce by passing
    // through the ScramjetController if available, otherwise fall back to
    // directly encoding via encodeURIComponent as a best-effort approach.
    const encoded = encodeURIComponent(url);
    this._iframe.src = this._prefix + encoded;
  }
  reload() { this._iframe.contentWindow?.location.reload(); }
  back()    { this._iframe.contentWindow?.history.back(); }
  forward() { this._iframe.contentWindow?.history.forward(); }
  addEventListener(type, fn) {
    (this._listeners[type] ??= []).push(fn);
  }
}

async function forceReload() {
  setStatus('Clearing cache…');
  for (const reg of await navigator.serviceWorker.getRegistrations()) {
    await reg.unregister();
  }
  // Clear scramjet v1 and v2 IndexedDB stores
  for (const db of ['$scramjet', '$scramjet2']) {
    await new Promise(resolve => {
      const r = indexedDB.deleteDatabase(db);
      r.onsuccess = r.onerror = r.onblocked = resolve;
    });
  }
  window.location.reload(true);
}

function setStatus(msg, warn = false) {
  statusEl.textContent = msg;
  statusEl.style.color = warn ? '#ff5555' : '';
}

// ── Bookmarks ─────────────────────────────────────────────────────
function renderBookmarks() {
  bookmarksList.innerHTML = '';
  for (const bm of settings.bookmarks) {
    const item = document.createElement('button');
    item.className = 'bookmark-item';
    item.title = bm.url;

    const fav = document.createElement('span');
    fav.className = 'bm-favicon';
    fav.innerHTML = `<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><rect x="1" y="1" width="10" height="10" rx="1.5"/><line x1="3.5" y1="4" x2="8.5" y2="4"/><line x1="3.5" y1="6.5" x2="6.5" y2="6.5"/></svg>`;

    const titleEl = document.createElement('span');
    titleEl.className = 'bm-title';
    titleEl.textContent = bm.title;

    const remove = document.createElement('span');
    remove.className = 'bm-remove';
    remove.textContent = '×';
    remove.title = 'Remove bookmark';
    remove.addEventListener('click', e => {
      e.stopPropagation();
      settings.bookmarks = settings.bookmarks.filter(b => b.id !== bm.id);
      saveSettings();
      renderBookmarks();
    });

    item.appendChild(fav);
    item.appendChild(titleEl);
    item.appendChild(remove);
    item.addEventListener('click', () => navigate(bm.url));
    bookmarksList.appendChild(item);
  }
}

btnAddBm.addEventListener('click', () => {
  const tab = getActiveTab();
  if (!tab?.url) return;
  const url = tab.url;
  if (settings.bookmarks.some(b => b.url === url)) return;
  const title = tab.title || (() => { try { return new URL(url).hostname; } catch (_) { return url; } })();
  settings.bookmarks.push({ id: Date.now(), title, url });
  saveSettings();
  renderBookmarks();
});

// ── Settings modal ────────────────────────────────────────────────
function openSettings() {
  settingsOverlay.classList.add('open');
  syncSettingsPanel();
}

function closeSettings() {
  settingsOverlay.classList.remove('open');
}

function switchSettingsTab(tab) {
  document.querySelectorAll('.sm-tab').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.tab === tab)
  );
  document.querySelectorAll('.sm-pane').forEach(pane =>
    pane.classList.toggle('active', pane.dataset.pane === tab)
  );
}

document.querySelectorAll('.sm-tab').forEach(btn =>
  btn.addEventListener('click', () => switchSettingsTab(btn.dataset.tab))
);

function syncSettingsPanel() {
  // Theme buttons
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === settings.theme);
  });

  // Cloak buttons
  document.querySelectorAll('.cloak-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.cloak === settings.tabCloak);
  });

  // Engine buttons
  document.querySelectorAll('.engine-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.engine === (settings.engine || 'scramjet'));
  });

  // Toggles
  $('toggle-about-blank').checked = settings.aboutBlankMode;
  $('toggle-bookmarks').checked   = settings.bookmarksVisible;

  // Selects
  $('select-search-engine').value = settings.searchEngine;
  $('select-panic-key').value     = settings.panicKey;

  // Inputs
  $('input-panic-url').value = settings.panicUrl;

  // Toggles
  $('toggle-eruda').checked = settings.erudaEnabled;
  $('toggle-cursor').checked = settings.customCursor;
  $('toggle-clock').checked  = settings.ntClock;

  // Tab position buttons
  document.querySelectorAll('.tab-pos-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.pos === (settings.tabPosition || 'top'));
  });
}

// Build a fully-qualified proxied service URL for the current engine. Uses the
// controller's own codec when available so the encoding always matches what the
// service worker expects; falls back to encodeURIComponent (the default codec).
function proxiedUrl(rawUrl) {
  const ctrl = window.__bardoCtrl;
  const encoded = ctrl && typeof ctrl.encodeUrl === 'function'
    ? ctrl.encodeUrl(rawUrl)
    : encodeURIComponent(rawUrl);
  return location.origin + activeSvcPrefix() + encoded;
}

btnOpenTab.addEventListener('click', () => {
  const url = getActiveTab()?.url || urlBar.value.trim();
  if (!url) return;
  window.open(proxiedUrl(url), '_blank');
});

btnMenu.addEventListener('click', openSettings);
btnSettingsClose.addEventListener('click', closeSettings);
settingsOverlay.addEventListener('click', e => {
  if (e.target === settingsOverlay) closeSettings();
});

// Theme buttons
document.querySelectorAll('.theme-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    settings.theme = btn.dataset.theme;
    saveSettings();
    applyTheme();
    syncSettingsPanel();
  });
});

// Cloak buttons
document.querySelectorAll('.cloak-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    settings.tabCloak = btn.dataset.cloak;
    saveSettings();
    applyTabCloak();
    syncSettingsPanel();
  });
});

// Engine buttons
document.querySelectorAll('.engine-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    settings.engine = btn.dataset.engine;
    saveSettings();
    syncSettingsPanel();
    initEngine();
  });
});

// Tab position buttons
document.querySelectorAll('.tab-pos-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    settings.tabPosition = btn.dataset.pos;
    saveSettings();
    applyTabPosition();
    syncSettingsPanel();
  });
});

$('toggle-about-blank').addEventListener('change', e => {
  settings.aboutBlankMode = e.target.checked;
  saveSettings();
});

$('toggle-bookmarks').addEventListener('change', e => {
  settings.bookmarksVisible = e.target.checked;
  saveSettings();
  applyBookmarksBar();
});

$('select-search-engine').addEventListener('change', e => {
  settings.searchEngine = e.target.value;
  saveSettings();
});

$('select-panic-key').addEventListener('change', e => {
  settings.panicKey = e.target.value;
  saveSettings();
});

$('input-panic-url').addEventListener('input', e => {
  settings.panicUrl = e.target.value;
  saveSettings();
});

btnForceReload.addEventListener('click', forceReload);

$('toggle-eruda').addEventListener('change', e => {
  settings.erudaEnabled = e.target.checked;
  saveSettings();
  applyErudaSettings();
});

$('toggle-cursor').addEventListener('change', e => {
  settings.customCursor = e.target.checked;
  saveSettings();
  applyCustomCursor();
});

$('toggle-clock').addEventListener('change', e => {
  settings.ntClock = e.target.checked;
  saveSettings();
  applyClock();
});

let erudaOpen = false;
btnDevtools.addEventListener('click', () => {
  if (!window.eruda) {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/eruda';
    s.onload = () => { eruda.init(); eruda.show(); erudaOpen = true; };
    document.body.appendChild(s);
  } else if (erudaOpen) {
    eruda.hide();
    erudaOpen = false;
  } else {
    eruda.show();
    erudaOpen = true;
  }
});

// ── Apply settings ────────────────────────────────────────────────
function applyTheme() {
  document.documentElement.setAttribute('data-theme', settings.theme || 'dark');
}

function applyTabCloak() {
  const cloak = TAB_CLOAKS[settings.tabCloak] || TAB_CLOAKS.none;
  document.title = cloak.title;
  const fav = $('favicon');
  if (fav) fav.href = cloak.favicon || BARDO_FAVICON;
}

function applyBookmarksBar() {
  const visible = settings.bookmarksVisible;
  document.documentElement.style.setProperty('--bookmarks-h', visible ? '28px' : '0px');
  bookmarksBar.classList.toggle('visible', visible);
}

function applyErudaSettings() {
  btnDevtools.style.display = settings.erudaEnabled ? '' : 'none';
  if (!settings.erudaEnabled && window.eruda) {
    eruda.hide();
    erudaOpen = false;
  }
}

function applyTabPosition() {
  const pos = settings.tabPosition || 'top';
  if (pos === 'top') {
    document.documentElement.removeAttribute('data-tabs');
  } else {
    document.documentElement.setAttribute('data-tabs', pos);
  }
}

// ── Custom cursor ─────────────────────────────────────────────────
const cursorDot  = $('cursor-dot');
const cursorRing = $('cursor-ring');
let curMouseX = 0, curMouseY = 0, curRingX = 0, curRingY = 0;
let cursorRAF = null, cursorShown = false;

const CURSOR_INTERACTIVE =
  'button, a, input, select, textarea, label, .tab, .bookmark-item, ' +
  '.waffle-item, .ql-item, .theme-btn, .cloak-btn, .engine-btn, .tab-pos-btn, .sm-tab, .toggle-wrap';

function showCursor() {
  if (cursorShown) return;
  cursorShown = true;
  cursorDot.style.opacity = '1';
  cursorRing.style.opacity = '1';
}
function hideCursor() {
  if (!cursorShown) return;
  cursorShown = false;
  cursorDot.style.opacity = '0';
  cursorRing.style.opacity = '0';
}
function cursorLoop() {
  curRingX += (curMouseX - curRingX) * 0.2;
  curRingY += (curMouseY - curRingY) * 0.2;
  cursorRing.style.transform = `translate(${curRingX}px, ${curRingY}px)`;
  cursorRAF = requestAnimationFrame(cursorLoop);
}
document.addEventListener('mousemove', e => {
  if (!settings.customCursor) return;
  curMouseX = e.clientX; curMouseY = e.clientY;
  cursorDot.style.transform = `translate(${curMouseX}px, ${curMouseY}px)`;
  showCursor();
  cursorRing.classList.toggle('hover', !!e.target.closest?.(CURSOR_INTERACTIVE));
}, { passive: true });
document.addEventListener('mousedown', () => cursorRing.classList.add('down'));
document.addEventListener('mouseup',   () => cursorRing.classList.remove('down'));
// The pointer entering a proxied iframe stops firing parent mousemoves, so hide
// the overlay there and let the page's own native cursor take over.
document.addEventListener('mouseover', e => { if (e.target.tagName === 'IFRAME') hideCursor(); });
document.addEventListener('mouseleave', hideCursor);
window.addEventListener('blur', hideCursor);

function applyCustomCursor() {
  if (settings.customCursor) {
    document.documentElement.classList.add('custom-cursor');
    if (!cursorRAF) cursorLoop();
  } else {
    document.documentElement.classList.remove('custom-cursor');
    hideCursor();
    if (cursorRAF) { cancelAnimationFrame(cursorRAF); cursorRAF = null; }
  }
}

// ── New-tab clock ─────────────────────────────────────────────────
let clockTimer = null;
function tickClock() {
  const time = $('nt-time'), greet = $('nt-greeting');
  if (!time || !greet) return;
  const now = new Date();
  time.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const h = now.getHours();
  greet.textContent =
    h < 5  ? 'Good night'   :
    h < 12 ? 'Good morning' :
    h < 18 ? 'Good afternoon' :
             'Good evening';
}
function applyClock() {
  const clock = $('nt-clock');
  if (!clock) return;
  if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
  if (settings.ntClock) {
    tickClock();
    clock.classList.add('visible');
    clockTimer = setInterval(tickClock, 10000);
  } else {
    clock.classList.remove('visible');
  }
}

function applyAllSettings() {
  applyTheme();
  applyTabCloak();
  applyBookmarksBar();
  applyErudaSettings();
  applyTabPosition();
  applyCustomCursor();
  applyClock();
  renderBookmarks();
}

// ── About:blank launcher ──────────────────────────────────────────
// The actual window.open() runs synchronously in <head> to preserve user activation.
// Here we just react to the flags it set.
function handleAboutBlankResult() {
  if (!settings.aboutBlankMode) return;
  if (window !== window.top) return; // Already inside an ab iframe

  if (window.__bardoAbLaunched) {
    // Stealth tab opened successfully — show "close this tab" message
    document.body.innerHTML =
      `<div style="position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;` +
      `justify-content:center;background:#000;color:#fff;font-family:system-ui,sans-serif;gap:10px">` +
      `<p style="font-size:18px;opacity:0.6">Stealth tab opened.</p>` +
      `<p style="font-size:13px;color:#555">You can close this tab.</p>` +
      `</div>`;
  } else if (window.__bardoAbBlocked) {
    // Popup was blocked — show the manual fallback button
    btnStealthLaunch.style.display = 'flex';
  }
}

btnStealthLaunch.addEventListener('click', () => {
  const src = location.href;
  const w = window.open('about:blank', '_blank');
  if (!w) return;
  w.document.write(
    `<!DOCTYPE html><html><head><title></title>` +
    `<style>*{margin:0;padding:0}html,body,iframe{display:block;width:100%;height:100%;border:none;overflow:hidden}</style>` +
    `</head><body><iframe src="${src}"></iframe></body></html>`
  );
  w.document.close();
  btnStealthLaunch.style.display = 'none';
});

// ── Panic key ─────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
  if (!settings.panicKey || e.key !== settings.panicKey) return;
  if (settingsOverlay.classList.contains('open')) { closeSettings(); return; }
  const url = settings.panicUrl || 'https://classroom.google.com';
  window.location.replace(url);
});

// ── Keyboard shortcuts ────────────────────────────────────────────
function focusAddress() {
  const tab = getActiveTab();
  if (tab && tab.url) { urlBar.focus(); urlBar.select(); }
  else { searchInput.focus(); searchInput.select(); }
}

document.addEventListener('keydown', e => {
  const typing = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable;

  // Alt+Arrow → history; Alt+1..9 → jump to tab N (chosen over Ctrl to dodge
  // shortcuts the host browser reserves for its own tabs).
  if (e.altKey && !e.ctrlKey && !e.metaKey) {
    if (e.key === 'ArrowLeft')  { e.preventDefault(); btnBack.click(); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); btnFwd.click();  return; }
    if (/^[1-9]$/.test(e.key)) {
      const t = tabs[+e.key - 1];
      if (t) { e.preventDefault(); activateTab(t.id); }
      return;
    }
  }

  if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
  switch (e.key.toLowerCase()) {
    case 'l': e.preventDefault(); focusAddress(); break;
    case 't': e.preventDefault(); openTab(); break;
    case 'w':
      if (activeTabId !== null) { e.preventDefault(); closeTab(activeTabId); }
      break;
    case 'r':
      if (!typing) {
        e.preventDefault();
        const tab = getActiveTab();
        if (tab?.url) tab.frame?.reload(); else initEngine();
      }
      break;
  }
});

// ── Waffle menu ───────────────────────────────────────────────────
const WAFFLE_PRESET_ICONS = {
  home:     `<path d="M2 7.5L8 2l6 5.5"/><path d="M4 6.5V14h3v-3h2v3h3V6.5"/>`,
  star:     `<polygon points="8,2 9.8,6.2 14.5,6.6 11,9.7 12.1,14.3 8,11.9 3.9,14.3 5,9.7 1.5,6.6 6.2,6.2"/>`,
  mail:     `<rect x="1.5" y="4" width="13" height="9" rx="1.5"/><polyline points="1.5,4 8,9.5 14.5,4"/>`,
  video:    `<polygon points="5,3.5 13.5,8 5,12.5"/>`,
  music:    `<path d="M6 12V5l7-1.5v7.5"/><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="11" r="1.5"/>`,
  search:   `<circle cx="6.5" cy="6.5" r="4"/><line x1="9.7" y1="9.7" x2="13.5" y2="13.5"/>`,
  link:     `<path d="M6.5 9.5a3.5 3.5 0 0 0 5 0l2-2a3.5 3.5 0 0 0-5-5L7 4"/><path d="M9.5 6.5a3.5 3.5 0 0 0-5 0l-2 2a3.5 3.5 0 0 0 5 5L9 12"/>`,
  chat:     `<path d="M13 2H3a1 1 0 0 0-1 1v6.5a1 1 0 0 0 1 1h2l3 3.5 3-3.5h2a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1z"/>`,
  news:     `<rect x="2" y="2" width="12" height="12" rx="1.5"/><line x1="5" y1="5.5" x2="11" y2="5.5"/><line x1="5" y1="8" x2="11" y2="8"/><line x1="5" y1="10.5" x2="8" y2="10.5"/>`,
  bookmark: `<path d="M4 2h8v12l-4-2.5L4 14V2z"/>`,
};

let waffleShortcuts = [];

async function loadShortcuts() {
  try {
    const resp = await fetch('/shortcuts.json');
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    waffleShortcuts = Array.isArray(data) ? data.filter(s => s.url) : [];
    renderWafflePanel();
    renderQuickLinks();
  } catch (e) {
    console.error('[bardo] failed to load shortcuts:', e);
  }
}

// Resolve a shortcut's icon to a DOM node (preset glyph or favicon image).
function shortcutIconNode(sc) {
  let iconSrc = sc.icon || '';
  if (iconSrc.startsWith('preset:')) {
    const paths = WAFFLE_PRESET_ICONS[iconSrc.slice(7)];
    if (paths) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 16 16');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '1.4');
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
      svg.innerHTML = paths;
      return svg;
    }
  }
  if (!iconSrc) {
    try { iconSrc = gFav(new URL(sc.url).hostname); } catch (_) {}
  }
  const img = document.createElement('img');
  img.src = iconSrc; img.alt = '';
  img.onerror = () => { img.style.display = 'none'; };
  return img;
}

// Compact quick-access chips on the new-tab page (first handful of shortcuts).
function renderQuickLinks() {
  const host = $('nt-quicklinks');
  if (!host) return;
  host.innerHTML = '';
  for (const sc of waffleShortcuts.slice(0, 6)) {
    const chip = document.createElement('button');
    chip.className = 'ql-item';
    chip.title = sc.url;
    chip.appendChild(shortcutIconNode(sc));
    const lbl = document.createElement('span');
    lbl.textContent = sc.label;
    chip.appendChild(lbl);
    chip.addEventListener('click', () => navigate(sc.url));
    host.appendChild(chip);
  }
}

function renderWafflePanel() {
  wafflePanel.innerHTML = '';
  if (!waffleShortcuts.length) {
    const empty = document.createElement('p');
    empty.style.cssText = 'font-size:12px;color:var(--muted);padding:12px;grid-column:1/-1;text-align:center';
    empty.textContent = 'No shortcuts yet';
    wafflePanel.appendChild(empty);
    return;
  }
  waffleShortcuts.forEach(sc => {
    let iconSrc = sc.icon || '';
    if (!iconSrc) {
      try { iconSrc = `https://www.google.com/s2/favicons?domain=${new URL(sc.url).hostname}&sz=32`; } catch (_) {}
    }
    const btn = document.createElement('button');
    btn.className = 'waffle-item';
    btn.title = sc.label;
    if (iconSrc.startsWith('preset:')) {
      const name = iconSrc.slice(7);
      const paths = WAFFLE_PRESET_ICONS[name];
      if (paths) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 16 16');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '1.4');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        svg.className = 'waffle-icon-svg';
        svg.innerHTML = paths;
        btn.appendChild(svg);
      }
    } else {
      const img = document.createElement('img');
      img.className = 'waffle-icon';
      img.src = iconSrc;
      img.alt = '';
      img.onerror = () => { img.style.display = 'none'; };
      btn.appendChild(img);
    }
    const lbl = document.createElement('span');
    lbl.className = 'waffle-label';
    lbl.textContent = sc.label;
    btn.appendChild(lbl);
    btn.addEventListener('click', () => {
      closeWaffle();
      navigate(sc.url);
    });
    wafflePanel.appendChild(btn);
  });
}

function openWaffle() {
  const rect = btnWaffle.getBoundingClientRect();
  wafflePanel.style.right = (window.innerWidth - rect.right) + 'px';
  wafflePanel.style.top   = (rect.bottom + 4) + 'px';
  wafflePanel.classList.add('open');
}

function closeWaffle() {
  wafflePanel.classList.remove('open');
}

btnWaffle.addEventListener('click', e => {
  e.stopPropagation();
  wafflePanel.classList.contains('open') ? closeWaffle() : openWaffle();
});

document.addEventListener('click', e => {
  if (!wafflePanel.contains(e.target) && e.target !== btnWaffle) {
    closeWaffle();
  }
});

// ── Boot ──────────────────────────────────────────────────────────
const prevController = navigator.serviceWorker?.controller ?? null;
navigator.serviceWorker?.addEventListener('controllerchange', () => {
  if (prevController) window.location.reload();
});

applyAllSettings();
handleAboutBlankResult();
openTab();
initEngine();
loadShortcuts();
