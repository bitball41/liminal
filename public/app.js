/* Axis — app.js */

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
const btnMenu       = $('btn-menu');
const settingsPanel = $('settings-panel');
const settingsOverlay = $('settings-overlay');
const btnSettingsClose = $('btn-settings-close');
const btnStealthLaunch = $('btn-stealth-launch');
const btnForceReload = $('btn-force-reload-proxy');

const conn = new BareMux.BareMuxConnection('/baremux/worker.js');
const PUBLIC_WISP = 'wss://wisp.mercurywork.shop/wisp/';
const PROXY_PREFIX = '/scramjet/proxy/';

const AXIS_FAVICON = "data:image/svg+xml," + encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'>` +
  `<line x1='20' y1='34' x2='20' y2='6' stroke='white' stroke-width='2.5'/>` +
  `<polygon points='20,3 17,9 23,9' fill='white'/>` +
  `<line x1='6' y1='20' x2='34' y2='20' stroke='white' stroke-width='2.5'/>` +
  `<polygon points='37,20 31,17 31,23' fill='white'/>` +
  `<circle cx='20' cy='20' r='2.5' fill='white'/></svg>`
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
  none:      { title: 'Axis',                           favicon: null },
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
};

function loadSettings() {
  try {
    const raw = localStorage.getItem('axis-settings');
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
  } catch (_) { return { ...DEFAULT_SETTINGS }; }
}

function saveSettings() {
  try { localStorage.setItem('axis-settings', JSON.stringify(settings)); } catch (_) {}
}

let settings = loadSettings();

// ── Tab management ────────────────────────────────────────────────
let tabs = [];
let activeTabId = null;
let nextTabId = 0;

function getActiveTab() {
  return tabs.find(t => t.id === activeTabId) ?? null;
}

function createTabIframe() {
  const iframe = document.createElement('iframe');
  iframe.className = 'proxy-frame';
  iframe.hidden = true;
  iframe.setAttribute('sandbox',
    'allow-same-origin allow-scripts allow-forms allow-popups allow-modals ' +
    'allow-pointer-lock allow-storage-access-by-user-activation ' +
    'allow-orientation-lock allow-presentation'
  );
  document.body.appendChild(iframe);
  return iframe;
}

function openTab(url = null) {
  const id = nextTabId++;
  const iframe = createTabIframe();
  const tab = { id, title: 'New Tab', url: '', iframe, frame: null, navCount: 0, inPageNavCount: 0, homeBackUrl: null };
  tabs.push(tab);
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

    const fav = document.createElement('div');
    fav.className = 'tab-favicon';
    fav.innerHTML = PAGE_ICON;

    const title = document.createElement('span');
    title.className = 'tab-title';
    title.textContent = tab.title;

    const close = document.createElement('button');
    close.className = 'tab-close';
    close.title = 'Close tab';
    close.innerHTML = `<svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="2" y1="2" x2="8" y2="8"/><line x1="8" y1="2" x2="2" y2="8"/></svg>`;
    close.addEventListener('click', e => { e.stopPropagation(); closeTab(tab.id); });

    el.appendChild(fav);
    el.appendChild(title);
    el.appendChild(close);
    el.addEventListener('click', () => activateTab(tab.id));
    tabBarTabs.appendChild(el);
  }
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
  const ctrl = window.__axisCtrl;
  if (!ctrl) {
    pendingUrl = url;
    setStatus('Proxy loading, will navigate when ready…');
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
      updateNavButtons(tab);
      renderTabs();
    });
  }

  tab.url = url;
  tab.navCount++;
  tab.inPageNavCount = 0;
  tab.homeBackUrl = null;
  tab.frame.go(url);
  urlBar.value = url;

  try { tab.title = new URL(url).hostname || 'Loading…'; }
  catch (_) { tab.title = 'Loading…'; }

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
  else initProxy();
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
function checkWisp(url) {
  return new Promise(resolve => {
    const ws = new WebSocket(url);
    const done = ok => { clearTimeout(t); try { ws.close(); } catch (_) {} resolve(ok); };
    const t = setTimeout(() => done(false), 5000);
    ws.addEventListener('open',  () => done(true));
    ws.addEventListener('error', () => done(false));
  });
}

// ── Proxy init ────────────────────────────────────────────────────
async function initProxy(attempt = 1) {
  if (!('serviceWorker' in navigator)) {
    setStatus('⚠ Service workers not supported.', true);
    return;
  }

  try {
    setStatus('Registering service worker…');

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

    if (attempt === 1) {
      setInterval(() => reg.update(), 30 * 60 * 1000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update();
      });
    }

    setStatus('Setting up transport…');
    const localWisp = `wss://${location.host}/wisp/`;
    const wispUrl   = (await checkWisp(localWisp)) ? localWisp : PUBLIC_WISP;

    await conn.setTransport('/epoxy/index.mjs', [{ wisp: wispUrl }]);

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
        await new Promise(resolve => {
          const r = indexedDB.deleteDatabase('$scramjet');
          r.onsuccess = r.onerror = r.onblocked = () => resolve();
        });
        await ctrl.init();
      } else {
        throw e;
      }
    }

    window.__axisCtrl = ctrl;
    sessionStorage.removeItem('axis-sw-fix-attempted');
    setStatus('');

    // Drain any URL that was queued before the proxy was ready
    if (pendingUrl) {
      const url = pendingUrl;
      pendingUrl = null;
      navigate(url);
    }
  } catch (e) {
    console.error(`[axis] init failed (attempt ${attempt}):`, e);
    if (attempt < 3) {
      const delay = attempt * 2000;
      setStatus(`⚠ Proxy error, retrying in ${delay / 1000}s…`, true);
      setTimeout(() => initProxy(attempt + 1), delay);
    } else if (!sessionStorage.getItem('axis-sw-fix-attempted')) {
      // Auto-fix: stale service worker is the most common cause of proxy failures.
      // Unregister it and reload so the browser installs a fresh one.
      sessionStorage.setItem('axis-sw-fix-attempted', '1');
      setStatus('Refreshing proxy…');
      await forceReloadProxy();
    } else {
      sessionStorage.removeItem('axis-sw-fix-attempted');
      setStatus('⚠ ' + e.message, true);
    }
  }
}

async function forceReloadProxy() {
  setStatus('Clearing proxy cache…');
  for (const reg of await navigator.serviceWorker.getRegistrations()) {
    if (reg.scope.includes(PROXY_PREFIX)) await reg.unregister();
  }
  await new Promise(resolve => {
    const r = indexedDB.deleteDatabase('$scramjet');
    r.onsuccess = r.onerror = r.onblocked = resolve;
  });
  window.location.reload(true);
}

function setStatus(msg, warn = false) {
  statusEl.textContent = msg;
  statusEl.style.color = warn ? '#f66' : '#555';
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

// ── Settings panel ────────────────────────────────────────────────
function openSettings() {
  settingsPanel.classList.add('open');
  settingsOverlay.classList.add('open');
  syncSettingsPanel();
}

function closeSettings() {
  settingsPanel.classList.remove('open');
  settingsOverlay.classList.remove('open');
}

function syncSettingsPanel() {
  // Theme buttons
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === settings.theme);
  });

  // Cloak buttons
  document.querySelectorAll('.cloak-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.cloak === settings.tabCloak);
  });

  // Toggles
  $('toggle-about-blank').checked = settings.aboutBlankMode;
  $('toggle-bookmarks').checked   = settings.bookmarksVisible;

  // Selects
  $('select-search-engine').value = settings.searchEngine;
  $('select-panic-key').value     = settings.panicKey;

  // Inputs
  $('input-panic-url').value = settings.panicUrl;
}

btnMenu.addEventListener('click', openSettings);
btnSettingsClose.addEventListener('click', closeSettings);
settingsOverlay.addEventListener('click', closeSettings);

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

btnForceReload.addEventListener('click', forceReloadProxy);

// ── Apply settings ────────────────────────────────────────────────
function applyTheme() {
  document.documentElement.setAttribute('data-theme', settings.theme || 'dark');
}

function applyTabCloak() {
  const cloak = TAB_CLOAKS[settings.tabCloak] || TAB_CLOAKS.none;
  document.title = cloak.title;
  const fav = $('favicon');
  if (fav) fav.href = cloak.favicon || AXIS_FAVICON;
}

function applyBookmarksBar() {
  const visible = settings.bookmarksVisible;
  document.documentElement.style.setProperty('--bookmarks-h', visible ? '28px' : '0px');
  bookmarksBar.classList.toggle('visible', visible);
}

function applyAllSettings() {
  applyTheme();
  applyTabCloak();
  applyBookmarksBar();
  renderBookmarks();
}

// ── About:blank launcher ──────────────────────────────────────────
// The actual window.open() runs synchronously in <head> to preserve user activation.
// Here we just react to the flags it set.
function handleAboutBlankResult() {
  if (!settings.aboutBlankMode) return;
  if (window !== window.top) return; // Already inside an ab iframe

  if (window.__axisAbLaunched) {
    // Stealth tab opened successfully — show "close this tab" message
    document.body.innerHTML =
      `<div style="position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;` +
      `justify-content:center;background:#000;color:#fff;font-family:system-ui,sans-serif;gap:10px">` +
      `<p style="font-size:18px;opacity:0.6">Stealth tab opened.</p>` +
      `<p style="font-size:13px;color:#555">You can close this tab.</p>` +
      `</div>`;
  } else if (window.__axisAbBlocked) {
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
  if (settingsPanel.classList.contains('open')) { closeSettings(); return; }
  const url = settings.panicUrl || 'https://classroom.google.com';
  window.location.replace(url);
});

// ── Boot ──────────────────────────────────────────────────────────
const prevController = navigator.serviceWorker?.controller ?? null;
navigator.serviceWorker?.addEventListener('controllerchange', () => {
  if (prevController) window.location.reload();
});

applyAllSettings();
handleAboutBlankResult();
openTab();
initProxy();
