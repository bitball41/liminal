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
const btnHistory       = $('btn-history');
const historyPage      = $('history-page');
const btnHistoryBack   = $('btn-history-back');
const hpSearch         = $('hp-search');
const hpList           = $('hp-list');
const hpClearAll       = $('hp-clear-all');
const btnOpenHistory   = $('btn-open-history');

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
  ntClock: true,
  restoreTabs: true,
  historyEnabled: true,
  widgetQuickLinks: true,
  widgetNotes: false,
  widgetWeather: false,
  widgetDate: false,
  widgetTodo: false,
  widgetPomodoro: false,
  wallpaperType: 'none',
  accent: '',
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

// Local-only persistence keys (kept out of bardo-settings so a large wallpaper
// or growing history never bloats the settings blob).
const SESSION_KEY   = 'bardo-session';
const HISTORY_KEY   = 'bardo-history';
const NOTES_KEY     = 'bardo-notes';
const TODOS_KEY     = 'bardo-todos';
const WALLPAPER_KEY = 'bardo-wallpaper';
const WEATHER_KEY   = 'bardo-weather';
const HISTORY_MAX   = 200;

let restoring = false;      // guards saveSession() while a restore is in flight

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

// When a proxied page finishes loading, finish the progress bar, pull the real
// document title + favicon so the tab strip reads like a real browser, then
// record the visit and persist the session.
function bindTabLoad(tab) {
  tab.iframe.addEventListener('load', () => {
    if (!tab.url) return;
    tab.loading = false;
    if (tab.id === activeTabId) finishProgress();
    refreshTabMeta(tab);
    addHistory(tab.url, tab.title);
    saveSession();
  });
}

function openTab(url = null) {
  const id = nextTabId++;
  const iframe = createTabIframe();
  const tab = { id, title: 'New Tab', url: '', favicon: null, loading: false, iframe, frame: null, navCount: 0, inPageNavCount: 0, homeBackUrl: null, suspended: false };
  tabs.push(tab);
  bindTabLoad(tab);

  activateTab(id);
  if (url) {
    navigate(url);
  } else {
    searchInput.value = '';
    setTimeout(() => searchInput.focus(), 50);
  }
  return tab;
}

// A restored tab from a previous session. It carries its URL + cached title and
// favicon but does not load until activated — so reopening 10 tabs doesn't fire
// 10 simultaneous proxy navigations on boot.
function openSuspendedTab(meta) {
  const id = nextTabId++;
  const iframe = createTabIframe();
  const tab = { id, title: meta.title || 'New Tab', url: meta.url, favicon: meta.favicon || null, loading: false, iframe, frame: null, navCount: 0, inPageNavCount: 0, homeBackUrl: null, suspended: true };
  tabs.push(tab);
  bindTabLoad(tab);
  return tab;
}

// ── Session persistence ───────────────────────────────────────────
function saveSession() {
  if (restoring || !settings.restoreTabs) return;
  try {
    const open = [];
    let active = -1;
    for (const t of tabs) {
      if (!t.url) continue;
      if (t.id === activeTabId) active = open.length;
      open.push({ url: t.url, title: t.title, favicon: t.favicon });
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify({ tabs: open, active }));
  } catch (_) {}
}

function clearSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch (_) {}
}

function restoreSession() {
  let data = null;
  if (settings.restoreTabs) {
    try { data = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (_) {}
  }
  const saved = data && Array.isArray(data.tabs) ? data.tabs.filter(t => t && t.url) : [];
  if (!saved.length) { openTab(); return; }

  restoring = true;
  saved.forEach(openSuspendedTab);
  const idx = (typeof data.active === 'number' && data.active >= 0 && data.active < tabs.length) ? data.active : 0;
  restoring = false;
  activateTab(tabs[idx].id);
  saveSession();
}

function closeTab(id) {
  const idx = tabs.findIndex(t => t.id === id);
  if (idx === -1) return;
  tabs[idx].iframe.remove();
  tabs.splice(idx, 1);

  if (tabs.length === 0) { clearSession(); openTab(); return; }

  if (activeTabId === id) {
    activateTab(tabs[Math.min(idx, tabs.length - 1)].id);
  } else {
    renderTabs();
  }
  saveSession();
}

function activateTab(id) {
  for (const t of tabs) t.iframe.hidden = true;
  newTab.hidden = true;

  activeTabId = id;
  const tab = tabs.find(t => t.id === id);
  if (!tab) { renderTabs(); return; }

  // A restored tab loads lazily the first time it's focused.
  if (tab.suspended) {
    tab.suspended = false;
    navigate(tab.url);
    renderTabs();
    saveSession();
    return;
  }

  if (tab.url) {
    tab.iframe.hidden = false;
    urlBar.value = tab.url;
  } else {
    newTab.hidden = false;
    urlBar.value = '';
    searchInput.value = '';
  }

  // Reflect the activated tab's own loading state so the global progress bar
  // never gets stuck after switching away from a still-loading tab.
  if (tab.loading) startProgress(); else finishProgress();

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
      saveSession();
    });

    el.appendChild(fav);
    el.appendChild(title);
    el.appendChild(close);
    el.addEventListener('click', () => activateTab(tab.id));
    tabBarTabs.appendChild(el);
  }
}

// ── Tab metadata + loading progress ───────────────────────────────
// Derive a tab's title + favicon from a URL in a single parse. An unparseable
// URL leaves a "Loading…" title and the generic glyph (favicon null).
function applyUrlMeta(tab, url) {
  let host = '';
  try { host = new URL(url).hostname; } catch (_) {}
  tab.title = host || 'Loading…';
  tab.favicon = host ? gFav(host) : null;
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
    // Surface the new-tab page so the loading status is visible (it lives inside
    // #new-tab) instead of staring at a blank frame while the engine boots.
    const tab = getActiveTab();
    if (tab) { urlBar.value = url; tab.iframe.hidden = true; }
    newTab.hidden = false;
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
      applyUrlMeta(tab, e.url);
      addHistory(e.url, tab.title);
      updateNavButtons(tab);
      renderTabs();
      saveSession();
    });
  }

  tab.url = url;
  tab.navCount++;
  tab.inPageNavCount = 0;
  tab.homeBackUrl = null;
  tab.loading = true;
  if (tab.id === activeTabId) startProgress();
  tab.frame.go(url);
  urlBar.value = url;
  applyUrlMeta(tab, url);
  addHistory(url, tab.title);

  newTab.hidden = true;
  tab.iframe.hidden = false;
  updateNavButtons(tab);
  renderTabs();
  saveSession();
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
    saveSession();
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
  saveSession();
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
  const wsProto = location.protocol === 'https:' ? 'wss' : 'ws';
  const localWisp = `${wsProto}://${location.host}/wisp/`;

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

  // Accent swatches
  document.querySelectorAll('.accent-swatch[data-accent]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.accent === (settings.accent || ''));
  });
  if (settings.accent) $('accent-picker').value = settings.accent;

  // Toggles
  $('toggle-about-blank').checked = settings.aboutBlankMode;
  $('toggle-bookmarks').checked   = settings.bookmarksVisible;

  // Selects
  $('select-search-engine').value = settings.searchEngine;
  $('select-panic-key').value     = settings.panicKey;

  // Inputs
  $('input-panic-url').value = settings.panicUrl;

  // Toggles
  $('toggle-eruda').checked    = settings.erudaEnabled;
  $('toggle-clock').checked    = settings.ntClock;
  $('toggle-restore').checked  = settings.restoreTabs;
  $('toggle-history').checked  = settings.historyEnabled;
  $('toggle-quicklinks').checked      = settings.widgetQuickLinks;
  $('toggle-widget-notes').checked    = settings.widgetNotes;
  $('toggle-widget-weather').checked  = settings.widgetWeather;
  $('toggle-widget-date').checked     = settings.widgetDate;
  $('toggle-widget-todo').checked     = settings.widgetTodo;
  $('toggle-widget-pomodoro').checked = settings.widgetPomodoro;

  // Background buttons
  document.querySelectorAll('.bg-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.bg === (settings.wallpaperType || 'none'));
  });
  let hasImg = false;
  try { hasImg = !!localStorage.getItem(WALLPAPER_KEY); } catch (_) {}
  $('btn-wallpaper-remove').style.display = hasImg ? '' : 'none';

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

// Accent swatches
document.querySelectorAll('.accent-swatch[data-accent]').forEach(btn => {
  btn.addEventListener('click', () => {
    settings.accent = btn.dataset.accent;
    saveSettings();
    applyAccent();
    syncSettingsPanel();
  });
});

// Custom accent colour picker
$('accent-picker').addEventListener('input', e => {
  settings.accent = e.target.value;
  saveSettings();
  applyAccent();
  syncSettingsPanel();
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

$('toggle-clock').addEventListener('change', e => {
  settings.ntClock = e.target.checked;
  saveSettings();
  applyClock();
});

$('toggle-restore').addEventListener('change', e => {
  settings.restoreTabs = e.target.checked;
  saveSettings();
  if (settings.restoreTabs) saveSession(); else clearSession();
});

$('toggle-history').addEventListener('change', e => {
  settings.historyEnabled = e.target.checked;
  saveSettings();
});

btnOpenHistory.addEventListener('click', () => {
  closeSettings();
  openHistoryPage();
});

$('toggle-quicklinks').addEventListener('change', e => {
  settings.widgetQuickLinks = e.target.checked;
  saveSettings();
  renderQuickLinks();
});
[
  ['toggle-widget-notes',    'widgetNotes'],
  ['toggle-widget-weather',  'widgetWeather'],
  ['toggle-widget-date',     'widgetDate'],
  ['toggle-widget-todo',     'widgetTodo'],
  ['toggle-widget-pomodoro', 'widgetPomodoro'],
].forEach(([id, key]) => {
  $(id).addEventListener('change', e => {
    settings[key] = e.target.checked;
    saveSettings();
    applyWidgets();
  });
});

// Background / wallpaper controls
document.querySelectorAll('.bg-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    settings.wallpaperType = btn.dataset.bg;
    saveSettings();
    applyWallpaper();
    syncSettingsPanel();
  });
});
// Photos are far too large to drop into localStorage raw (~5MB cap). Downscale
// to a sane max dimension and step the JPEG quality down until it fits, so any
// image the user picks ends up as a compact, locally-stored data URL.
function compressWallpaper(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxDim = 2560;
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      let quality = 0.85;
      let data = canvas.toDataURL('image/jpeg', quality);
      while (data.length > 2_500_000 && quality > 0.4) {
        quality -= 0.15;
        data = canvas.toDataURL('image/jpeg', quality);
      }
      if (data.length > 2_500_000) reject(new Error('too large'));
      else resolve(data);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode failed')); };
    img.src = url;
  });
}

$('wallpaper-file').addEventListener('change', async e => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  const removeBtn = $('btn-wallpaper-remove');
  const prevLabel = removeBtn.textContent;
  try {
    const data = await compressWallpaper(file);
    localStorage.setItem(WALLPAPER_KEY, data);
    settings.wallpaperType = 'image';
    saveSettings();
    applyWallpaper();
    syncSettingsPanel();
  } catch (_) {
    // Surface the failure right where the user clicked (the new-tab status line
    // sits behind the settings overlay).
    removeBtn.style.display = '';
    removeBtn.textContent = '⚠ Could not use that image';
    setTimeout(() => { removeBtn.textContent = prevLabel; syncSettingsPanel(); }, 2200);
  }
});
$('btn-wallpaper-remove').addEventListener('click', () => {
  try { localStorage.removeItem(WALLPAPER_KEY); } catch (_) {}
  if (settings.wallpaperType === 'image') { settings.wallpaperType = 'none'; saveSettings(); }
  applyWallpaper();
  syncSettingsPanel();
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

// Override the theme's --accent with a user-chosen colour (empty = theme default).
function applyAccent() {
  if (settings.accent) {
    document.documentElement.style.setProperty('--accent', settings.accent);
  } else {
    document.documentElement.style.removeProperty('--accent');
  }
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

// ── Browsing history (local-only) ─────────────────────────────────
let history = loadHistory();

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch (_) { return []; }
}
function saveHistory() {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch (_) {}
}
function addHistory(url, title) {
  if (!settings.historyEnabled) return;
  if (!url || !/^https?:/i.test(url)) return;
  // Collapse consecutive hits on the same URL into one entry (refresh the time
  // and pick up a better title once the page reports it).
  if (history[0] && history[0].url === url) {
    history[0].ts = Date.now();
    if (title) history[0].title = title;
    saveHistory();
    if (historyPage.classList.contains('open')) renderHistoryPage();
    return;
  }
  history.unshift({ url, title: title || '', ts: Date.now() });
  if (history.length > HISTORY_MAX) history.length = HISTORY_MAX;
  saveHistory();
  if (historyPage.classList.contains('open')) renderHistoryPage();
}
function clearHistory() {
  history = [];
  saveHistory();
  renderHistoryPage();
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch (_) { return url; }
}

// Groups history rows the way Chrome's history page does: Today, Yesterday,
// then a full weekday/date for anything older.
function dateGroupLabel(ts) {
  const startOfToday = new Date(new Date().setHours(0, 0, 0, 0)).getTime();
  if (ts >= startOfToday) return 'Today';
  if (ts >= startOfToday - 86400000) return 'Yesterday';
  return new Date(ts).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}

function openHistoryPage() {
  historyPage.classList.add('open');
  renderHistoryPage();
  setTimeout(() => hpSearch.focus(), 50);
}
function closeHistoryPage() {
  historyPage.classList.remove('open');
}

function renderHistoryPage() {
  const q = (hpSearch?.value || '').trim().toLowerCase();
  hpList.innerHTML = '';

  const items = history.filter(h =>
    !q || (h.title || '').toLowerCase().includes(q) || h.url.toLowerCase().includes(q));

  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'hp-empty';
    empty.textContent = q ? 'No matching history' : 'No browsing history yet';
    hpList.appendChild(empty);
    return;
  }

  let lastGroup = null;
  for (const h of items) {
    const group = dateGroupLabel(h.ts);
    if (group !== lastGroup) {
      lastGroup = group;
      const head = document.createElement('div');
      head.className = 'hp-group-label';
      head.textContent = group;
      hpList.appendChild(head);
    }

    const row = document.createElement('button');
    row.className = 'hp-item';
    row.title = h.url;

    const time = document.createElement('span');
    time.className = 'hp-time';
    time.textContent = new Date(h.ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

    const fav = document.createElement('img');
    fav.className = 'hp-fav';
    fav.alt = '';
    try { fav.src = gFav(new URL(h.url).hostname); } catch (_) {}
    fav.onerror = () => { fav.style.visibility = 'hidden'; };

    const main = document.createElement('span');
    main.className = 'hp-main';
    const t = document.createElement('span');
    t.className = 'hp-title';
    t.textContent = h.title || hostOf(h.url);
    const u = document.createElement('span');
    u.className = 'hp-url';
    u.textContent = hostOf(h.url);
    main.appendChild(t);
    main.appendChild(u);

    const del = document.createElement('span');
    del.className = 'hp-del';
    del.title = 'Remove from history';
    del.textContent = '×';
    del.addEventListener('click', e => {
      e.stopPropagation();
      history = history.filter(x => x !== h);
      saveHistory();
      renderHistoryPage();
    });

    row.appendChild(time);
    row.appendChild(fav);
    row.appendChild(main);
    row.appendChild(del);
    row.addEventListener('click', () => { closeHistoryPage(); openTab(h.url); });
    hpList.appendChild(row);
  }
}

btnHistory.addEventListener('click', openHistoryPage);
btnHistoryBack.addEventListener('click', closeHistoryPage);
hpSearch.addEventListener('input', renderHistoryPage);
hpClearAll.addEventListener('click', clearHistory);

// ── New-tab widgets ───────────────────────────────────────────────
const WMO = code => {
  if (code === 0) return { icon: '☀️', text: 'Clear' };
  if (code <= 2)  return { icon: '🌤️', text: 'Partly cloudy' };
  if (code === 3) return { icon: '☁️', text: 'Overcast' };
  if (code <= 48) return { icon: '🌫️', text: 'Fog' };
  if (code <= 57) return { icon: '🌦️', text: 'Drizzle' };
  if (code <= 67) return { icon: '🌧️', text: 'Rain' };
  if (code <= 77) return { icon: '🌨️', text: 'Snow' };
  if (code <= 82) return { icon: '🌧️', text: 'Showers' };
  if (code <= 86) return { icon: '🌨️', text: 'Snow showers' };
  if (code <= 99) return { icon: '⛈️', text: 'Thunderstorm' };
  return { icon: '🌡️', text: '' };
};

function buildDateWidget() {
  const card = document.createElement('div');
  card.className = 'widget-card widget-date';
  const head = document.createElement('div');
  head.className = 'widget-head';
  head.textContent = 'Today';
  const day = document.createElement('div');
  day.className = 'date-day';
  const full = document.createElement('div');
  full.className = 'date-full';
  const now = new Date();
  day.textContent  = now.toLocaleDateString([], { weekday: 'long' });
  full.textContent = now.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
  card.appendChild(head);
  card.appendChild(day);
  card.appendChild(full);
  return card;
}

function loadTodos() {
  try { return JSON.parse(localStorage.getItem(TODOS_KEY) || '[]'); } catch (_) { return []; }
}
function saveTodos(t) {
  try { localStorage.setItem(TODOS_KEY, JSON.stringify(t)); } catch (_) {}
}
function buildTodoWidget() {
  const card = document.createElement('div');
  card.className = 'widget-card widget-todo';
  const head = document.createElement('div');
  head.className = 'widget-head';
  head.textContent = 'To-do';
  const list = document.createElement('div');
  list.className = 'todo-list';
  const form = document.createElement('form');
  form.className = 'todo-form';
  const input = document.createElement('input');
  input.className = 'todo-input';
  input.placeholder = 'Add a task…';
  input.spellcheck = false;
  form.appendChild(input);

  let todos = loadTodos();
  function render() {
    list.innerHTML = '';
    todos.forEach((item, i) => {
      const row = document.createElement('label');
      row.className = 'todo-item' + (item.done ? ' done' : '');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = item.done;
      cb.addEventListener('change', () => { todos[i].done = cb.checked; saveTodos(todos); render(); });
      const text = document.createElement('span');
      text.className = 'todo-text';
      text.textContent = item.text;
      const del = document.createElement('span');
      del.className = 'todo-del';
      del.textContent = '×';
      del.title = 'Remove';
      del.addEventListener('click', e => { e.preventDefault(); todos.splice(i, 1); saveTodos(todos); render(); });
      row.appendChild(cb);
      row.appendChild(text);
      row.appendChild(del);
      list.appendChild(row);
    });
  }
  form.addEventListener('submit', e => {
    e.preventDefault();
    const v = input.value.trim();
    if (!v) return;
    todos.push({ text: v, done: false });
    saveTodos(todos);
    input.value = '';
    render();
  });
  render();
  card.appendChild(head);
  card.appendChild(list);
  card.appendChild(form);
  return card;
}

// Focus timer (Pomodoro-style). State lives at module scope so it keeps running
// while you browse other tabs; applyWidgets() clears the interval before a
// rebuild so a re-render never leaves an orphaned ticker behind.
const POMO_DEFAULT = 25 * 60;
let pomoInterval = null, pomoRemaining = POMO_DEFAULT, pomoRunning = false;
function fmtClock(s) {
  const m = Math.floor(s / 60);
  return m + ':' + String(s % 60).padStart(2, '0');
}
function stopPomodoro() {
  if (pomoInterval) { clearInterval(pomoInterval); pomoInterval = null; }
  pomoRunning = false;
}
function buildPomodoroWidget() {
  const card = document.createElement('div');
  card.className = 'widget-card widget-pomo';
  card.innerHTML = '<div class="widget-head">Focus timer</div>';
  const time = document.createElement('div');
  time.className = 'pomo-time';
  time.textContent = fmtClock(pomoRemaining);
  const ctrls = document.createElement('div');
  ctrls.className = 'pomo-ctrls';
  const startBtn = document.createElement('button');
  startBtn.className = 'pomo-btn';
  startBtn.textContent = pomoRunning ? 'Pause' : 'Start';
  const resetBtn = document.createElement('button');
  resetBtn.className = 'pomo-btn';
  resetBtn.textContent = 'Reset';

  function tick() {
    pomoRemaining = Math.max(0, pomoRemaining - 1);
    time.textContent = fmtClock(pomoRemaining);
    if (pomoRemaining <= 0) { stopPomodoro(); startBtn.textContent = 'Start'; }
  }
  startBtn.addEventListener('click', () => {
    if (pomoRunning) { stopPomodoro(); startBtn.textContent = 'Start'; }
    else {
      if (pomoRemaining <= 0) pomoRemaining = POMO_DEFAULT;
      pomoRunning = true;
      startBtn.textContent = 'Pause';
      pomoInterval = setInterval(tick, 1000);
    }
  });
  resetBtn.addEventListener('click', () => {
    stopPomodoro();
    pomoRemaining = POMO_DEFAULT;
    time.textContent = fmtClock(pomoRemaining);
    startBtn.textContent = 'Start';
  });
  ctrls.appendChild(startBtn);
  ctrls.appendChild(resetBtn);
  card.appendChild(time);
  card.appendChild(ctrls);
  return card;
}

function buildNotesWidget() {
  const card = document.createElement('div');
  card.className = 'widget-card';
  const head = document.createElement('div');
  head.className = 'widget-head';
  head.textContent = 'Notes';
  const ta = document.createElement('textarea');
  ta.className = 'widget-notes';
  ta.placeholder = 'Jot something down…';
  ta.spellcheck = false;
  try { ta.value = localStorage.getItem(NOTES_KEY) || ''; } catch (_) {}
  ta.addEventListener('input', () => {
    try { localStorage.setItem(NOTES_KEY, ta.value); } catch (_) {}
  });
  card.appendChild(head);
  card.appendChild(ta);
  return card;
}

function buildWeatherWidget() {
  const card = document.createElement('div');
  card.className = 'widget-card';
  card.id = 'widget-weather';
  card.innerHTML =
    `<div class="widget-head">Weather</div>` +
    `<div class="weather-body"><span class="weather-loading">Loading…</span></div>`;
  return card;
}

function renderWeather(body, d) {
  const w = WMO(d.code);
  body.innerHTML =
    `<span class="weather-icon">${w.icon}</span>` +
    `<span class="weather-temp">${d.temp}°</span>` +
    `<span class="weather-meta">${w.text}${d.place ? ' · ' + d.place : ''}</span>`;
}

// Best-effort weather with no API key: IP geolocation (ipapi.co) → Open-Meteo,
// cached for an hour. Both endpoints are CORS-enabled and need no permission
// prompt, keeping the new-tab page quiet and stealthy.
async function loadWeather() {
  const body = document.querySelector('#widget-weather .weather-body');
  if (!body) return;
  try {
    const cached = JSON.parse(localStorage.getItem(WEATHER_KEY) || 'null');
    if (cached && Date.now() - cached.ts < 3600e3) { renderWeather(body, cached.data); return; }

    let lat, lon, place = '';
    try {
      const r = await fetch('https://ipapi.co/json/');
      if (r.ok) { const j = await r.json(); lat = j.latitude; lon = j.longitude; place = j.city || ''; }
    } catch (_) {}
    if (lat == null || lon == null) { body.innerHTML = '<span class="weather-loading">Location unavailable</span>'; return; }

    const wr = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&temperature_unit=fahrenheit`);
    const wj = await wr.json();
    const c = wj.current || {};
    const data = { temp: Math.round(c.temperature_2m), code: c.weather_code, place };
    try { localStorage.setItem(WEATHER_KEY, JSON.stringify({ ts: Date.now(), data })); } catch (_) {}
    renderWeather(body, data);
  } catch (_) {
    body.innerHTML = '<span class="weather-loading">Weather unavailable</span>';
  }
}

function applyWidgets() {
  const left  = $('nt-widgets-left');
  const right = $('nt-widgets-right');
  if (!left || !right) return;
  stopPomodoro();           // tear down any running ticker before rebuilding
  left.innerHTML = '';
  right.innerHTML = '';
  // Split across the two bottom corners so a full set spreads out instead of
  // stacking into one tall column. Left = compact glanceable cards, right =
  // the taller interactive ones.
  if (settings.widgetDate)     left.appendChild(buildDateWidget());
  if (settings.widgetWeather)  { left.appendChild(buildWeatherWidget()); loadWeather(); }
  if (settings.widgetPomodoro) left.appendChild(buildPomodoroWidget());
  if (settings.widgetTodo)     right.appendChild(buildTodoWidget());
  if (settings.widgetNotes)    right.appendChild(buildNotesWidget());
}

// ── New-tab wallpaper ─────────────────────────────────────────────
function applyWallpaper() {
  const nt = $('new-tab');
  if (!nt) return;
  const type = settings.wallpaperType || 'none';
  if (type === 'gradient') {
    nt.style.background =
      'radial-gradient(circle at 25% 12%, color-mix(in srgb, var(--accent) 40%, transparent), transparent 55%),' +
      'radial-gradient(circle at 82% 88%, color-mix(in srgb, var(--accent) 26%, transparent), transparent 55%),' +
      'var(--bg)';
  } else if (type === 'image') {
    let img = null;
    try { img = localStorage.getItem(WALLPAPER_KEY); } catch (_) {}
    // Scrim over the photo keeps the wordmark and search box readable.
    nt.style.background = img
      ? 'linear-gradient(color-mix(in srgb, var(--bg) 45%, transparent), color-mix(in srgb, var(--bg) 62%, transparent)),' +
        `url("${img}") center/cover no-repeat`
      : '';
  } else {
    nt.style.background = '';
  }
}

function applyAllSettings() {
  applyTheme();
  applyAccent();
  applyTabCloak();
  applyBookmarksBar();
  applyErudaSettings();
  applyTabPosition();
  applyClock();
  applyWallpaper();
  applyWidgets();
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
  // Leave no trail behind: drop the restored session, browsing history and notes
  // before bailing out to the cover page.
  try {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(HISTORY_KEY);
    localStorage.removeItem(NOTES_KEY);
    localStorage.removeItem(TODOS_KEY);
  } catch (_) {}
  history = [];
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

  if (e.key === 'Escape' && historyPage.classList.contains('open')) {
    e.preventDefault();
    closeHistoryPage();
    return;
  }

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
    case 'h': e.preventDefault(); openHistoryPage(); break;
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
  // No usable icon (e.g. an unparseable URL) — return the generic glyph rather
  // than an <img src=""> that would refetch the current page.
  if (!iconSrc) {
    const span = document.createElement('span');
    span.innerHTML = PAGE_ICON;
    return span.firstElementChild || span;
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
  if (!settings.widgetQuickLinks) return;
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
restoreSession();
initEngine();
loadShortcuts();
