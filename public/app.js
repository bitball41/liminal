/* ── Liminal Axis — app.js ───────────────────────────────────────── */

const searchForm    = document.getElementById('searchForm');
const searchInput   = document.getElementById('searchInput');
const searchHint    = document.getElementById('searchHint');
const settingsBtn   = document.getElementById('settingsBtn');
const modalBackdrop = document.getElementById('modalBackdrop');
const modalClose    = document.getElementById('modalClose');

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

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.onload  = resolve;
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

// ── Proxy init ────────────────────────────────────────────────────
async function initProxy() {
  if (!('serviceWorker' in navigator)) {
    setHint('⚠ Service workers not supported.', true);
    return;
  }

  try {
    setHint('[1/3] Loading transport…');
    await loadScript('/baremux/index.js');

    setHint('[2/3] Setting up service worker…');

    // Reuse the existing SW if it's already active — avoids full WASM reload on every visit
    let reg = await navigator.serviceWorker.getRegistration('/scramjet/');
    if (!reg || !reg.active) {
      // Clear any stale SWs before registering
      const stale = await navigator.serviceWorker.getRegistrations();
      await Promise.all(stale.map(r => r.unregister()));

      reg = await navigator.serviceWorker.register('/scramjet-sw.js', { scope: '/scramjet/' });
      await new Promise((resolve, reject) => {
        if (reg.active) { resolve(); return; }
        const sw = reg.installing || reg.waiting;
        if (!sw) { reject(new Error('SW not installing')); return; }
        const t = setTimeout(() => reject(new Error('SW timed out')), 15000);
        sw.addEventListener('statechange', function () {
          if (this.state === 'activated') { clearTimeout(t); resolve(); }
          if (this.state === 'redundant') { clearTimeout(t); reject(new Error('SW install failed')); }
        });
      });
    }

    setHint('[3/3] Starting proxy engine…');
    const conn = new BareMux.BareMuxConnection('/baremux/worker.js');
    await conn.setTransport('/bare-transport.mjs', [location.origin + '/bare/']);

    const { ScramjetController } = await import('/scramjet/scramjet.bundle.js');
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
