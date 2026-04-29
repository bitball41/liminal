/* ── Liminal Axis — app.js ───────────────────────────────────────── */

const searchForm    = document.getElementById('searchForm');
const searchInput   = document.getElementById('searchInput');
const searchHint    = document.getElementById('searchHint');
const settingsBtn   = document.getElementById('settingsBtn');
const modalBackdrop = document.getElementById('modalBackdrop');
const modalClose    = document.getElementById('modalClose');

// BareMux connection at module scope so the SharedWorker persists
const conn = new BareMux.BareMuxConnection('/baremux/worker.js');

const PUBLIC_WISP = 'wss://wisp.mercurywork.shop/wisp/';

function looksLikeUrl(s) {
  s = s.trim();
  if (/^https?:\/\//i.test(s)) return true;
  if (!s.includes(' ') && /^[a-z0-9-]+(\.[a-z]{2,})(\/.*)?$/i.test(s)) return true;
  return false;
}

function toAbsoluteUrl(s) {
  s = s.trim();
  if (/^https?:\/\//i.test(s)) return s;
  if (looksLikeUrl(s))         return 'https://' + s;
  return 'https://duckduckgo.com/?q=' + encodeURIComponent(s);
}

function proxyNavigate(targetUrl) {
  const ctrl = window.__liminalScramjet;
  if (ctrl) {
    window.location.href = ctrl.encodeUrl(targetUrl);
  } else {
    setHint('⚠ Proxy not ready yet — check status below.', true);
  }
}

function checkWisp(url) {
  return new Promise(resolve => {
    const ws = new WebSocket(url);
    const done = (ok) => { clearTimeout(timer); try { ws.close(); } catch (_) {} resolve(ok); };
    const timer = setTimeout(() => done(false), 2000);
    ws.addEventListener('open',  () => done(true));
    ws.addEventListener('error', () => done(false));
  });
}

// ── Proxy init ────────────────────────────────────────────────────
async function initProxy() {
  if (!('serviceWorker' in navigator)) {
    setHint('⚠ Service workers not supported.', true);
    return;
  }

  try {
    setHint('[1/3] Registering service worker…');
    navigator.serviceWorker.register('/scramjet-sw.js', { scope: '/scramjet/' });
    await navigator.serviceWorker.ready;

    setHint('[2/3] Setting up transport…');
    const localWisp = `wss://${location.host}/wisp/`;
    const wispUrl = (await checkWisp(localWisp)) ? localWisp : PUBLIC_WISP;
    await conn.setTransport('/epoxy/index.mjs', [{ wisp: wispUrl }]);

    setHint('[3/3] Starting proxy engine…');
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
    window.__liminalScramjet = ctrl;
    clearHint();
  } catch (e) {
    console.error('[liminal] init failed:', e);
    setHint('⚠ Init failed: ' + e.message, true);
  }
}

// ── Search ────────────────────────────────────────────────────────
searchForm.addEventListener('submit', e => {
  e.preventDefault();
  const val = searchInput.value.trim();
  if (!val) return;
  proxyNavigate(toAbsoluteUrl(val));
});

searchInput.addEventListener('input', () => {
  const val = searchInput.value.trim();
  if (!val) { clearHint(); return; }
  setHint(looksLikeUrl(val)
    ? '→ Proxy: ' + (val.startsWith('http') ? val : 'https://' + val)
    : '→ DuckDuckGo: "' + val + '"'
  );
});

document.addEventListener('keydown', e => {
  if (e.key === '/' && document.activeElement !== searchInput) {
    e.preventDefault();
    searchInput.focus();
  }
  if (e.key === 'Escape') closeModal();
});

document.querySelectorAll('.quick-btn').forEach(btn =>
  btn.addEventListener('click', () => proxyNavigate(btn.dataset.url))
);

function setHint(msg, warn = false) {
  searchHint.textContent = msg;
  searchHint.classList.toggle('warn', warn);
}
function clearHint() {
  searchHint.textContent = '';
  searchHint.classList.remove('warn');
}

// ── Settings modal ────────────────────────────────────────────────
function openModal()  { modalBackdrop.classList.add('open');    document.body.style.overflow = 'hidden'; }
function closeModal() { modalBackdrop.classList.remove('open'); document.body.style.overflow = ''; }

settingsBtn.addEventListener('click', openModal);
modalClose.addEventListener('click', closeModal);
modalBackdrop.addEventListener('click', e => { if (e.target === modalBackdrop) closeModal(); });

// ── Boot ──────────────────────────────────────────────────────────
initProxy();
window.addEventListener('load', () => searchInput.focus());
