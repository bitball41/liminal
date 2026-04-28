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
    setHint('⚠ Proxy not ready yet — check hint below for status.', true);
  }
}

// ── Load a classic (non-module) script ───────────────────────────
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
    setHint('[1/4] Loading transport…');
    await loadScript('/baremux/index.js');

    setHint('[2/4] Registering service worker…');
    // Unregister any stale SWs from previous visits
    const old = await navigator.serviceWorker.getRegistrations();
    await Promise.all(old.map(r => r.unregister()));

    // Register our wrapper SW (adds skipWaiting + clients.claim)
    const reg = await navigator.serviceWorker.register('/scramjet-sw.js', {
      scope: '/scramjet/',
    });

    // Wait for this specific SW to activate
    await new Promise((resolve, reject) => {
      if (reg.active) { resolve(); return; }
      const sw = reg.installing || reg.waiting;
      if (!sw) { reject(new Error('SW not installing')); return; }
      const t = setTimeout(() => reject(new Error('SW timed out')), 10000);
      sw.addEventListener('statechange', function () {
        if (this.state === 'activated') { clearTimeout(t); resolve(); }
        if (this.state === 'redundant') { clearTimeout(t); reject(new Error('SW install failed')); }
      });
    });

    setHint('[3/4] Configuring transport…');
    const conn = new BareMux.BareMuxConnection('/baremux/worker.js');
    await conn.setTransport('/bare-transport.mjs', ['/bare/']);

    setHint('[4/4] Starting proxy engine…');
    const { ScramjetController } = await import('/scramjet/scramjet.bundle.js');
    const origin = location.origin;
    const ctrl = new ScramjetController({
      prefix: origin + '/scramjet/',
      files: {
        wasm: origin + '/scramjet/scramjet.wasm.wasm',
        all:  origin + '/scramjet/scramjet.all.js',
        sync: origin + '/scramjet/scramjet.sync.js',
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

// ── Starfield ─────────────────────────────────────────────────────
(function () {
  const canvas = document.getElementById('starfield');
  const ctx = canvas.getContext('2d');
  const COUNT = 200;
  let stars = [];

  function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
  function mkStar() {
    return {
      x: Math.random() * canvas.width,  y: Math.random() * canvas.height,
      r: Math.random() * 1.4 + 0.15,    o: Math.random() * 0.65 + 0.1,
      vy: Math.random() * 0.25 + 0.04,  tw: Math.random() * Math.PI * 2,
      ts: Math.random() * 0.018 + 0.004,
    };
  }
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const s of stars) {
      s.tw += s.ts;
      const o = s.o * (0.55 + 0.45 * Math.sin(s.tw));
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(215,195,255,${o})`; ctx.fill();
      if (s.r > 1) {
        const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 3);
        g.addColorStop(0, `rgba(200,170,255,${o * .3})`); g.addColorStop(1, 'transparent');
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 3, 0, Math.PI * 2);
        ctx.fillStyle = g; ctx.fill();
      }
      s.y += s.vy;
      if (s.y > canvas.height + 2) { s.y = -2; s.x = Math.random() * canvas.width; }
    }
    requestAnimationFrame(draw);
  }
  window.addEventListener('resize', () => { resize(); stars = Array.from({ length: COUNT }, mkStar); });
  resize(); stars = Array.from({ length: COUNT }, mkStar); draw();
})();

// ── Boot ──────────────────────────────────────────────────────────
initProxy();
window.addEventListener('load', () => searchInput.focus());
