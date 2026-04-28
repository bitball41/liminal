/* ── Liminal Axis — app.js ───────────────────────────────────────── */

// ── Settings ─────────────────────────────────────────────────────
const STORE_KEY = 'liminal-engine';
let activeEngine = localStorage.getItem(STORE_KEY) || 'scramjet';

function saveEngine(e) {
  activeEngine = e;
  localStorage.setItem(STORE_KEY, e);
}

// ── DOM refs ──────────────────────────────────────────────────────
const searchForm    = document.getElementById('searchForm');
const searchInput   = document.getElementById('searchInput');
const searchHint    = document.getElementById('searchHint');
const settingsBtn   = document.getElementById('settingsBtn');
const modalBackdrop = document.getElementById('modalBackdrop');
const modalClose    = document.getElementById('modalClose');
const engineList    = document.getElementById('engineList');
const engineLabel   = document.getElementById('engineLabel');

// ── URL helpers ───────────────────────────────────────────────────
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

// ── Proxy navigation ──────────────────────────────────────────────
function proxyNavigate(targetUrl) {
  if (activeEngine === 'uv') {
    navigateUV(targetUrl);
  } else {
    navigateScramjet(targetUrl);
  }
}

function navigateUV(url) {
  if (typeof __uv$config === 'undefined') {
    setHint('⚠ UV not loaded. Try refreshing.', true);
    return;
  }
  try {
    const encoded = __uv$config.encodeUrl(url);
    window.location.href = __uv$config.prefix + encoded;
  } catch (err) {
    setHint('⚠ UV error: ' + err.message, true);
  }
}

function navigateScramjet(url) {
  const ctrl = window.__liminalScramjet;
  if (ctrl) {
    try {
      window.location.href = ctrl.encodeUrl(url);
      return;
    } catch (e) {
      console.warn('[liminal] Scramjet encodeUrl failed:', e);
    }
  }
  // Controller not ready yet – fall back to UV
  navigateUV(url);
}

// ── Service worker & proxy init ───────────────────────────────────
async function loadScript(src, asModule = false) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    if (asModule) s.type = 'module';
    s.onload  = resolve;
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

async function initUV() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('/uv/uv.sw.js', { scope: '/service/' });
  } catch (e) {
    console.warn('[liminal] UV SW failed:', e);
  }
}

async function initScramjet() {
  if (!('serviceWorker' in navigator)) { await initUV(); return; }

  try {
    // 1. Load scramjet client bundle (defines ScramjetController globally)
    await loadScript('/scramjet/scramjet.bundle.js');

    // 2. Load bare-mux client (defines BareMux globally)
    await loadScript('/baremux/index.js');

    // 3. Register Scramjet service worker
    await navigator.serviceWorker.register('/scramjet/scramjet.bundle.js', {
      scope: '/scramjet/',
    });
    await navigator.serviceWorker.ready;

    // 4. Set up bare-mux transport → bare server at /bare/
    if (typeof BareMux !== 'undefined') {
      const conn = new BareMux.BareMuxConnection('/baremux/worker.js');
      await conn.setManualTransport('/bare-transport.mjs', ['/bare/']);
    }

    // 5. Initialise ScramjetController
    if (typeof ScramjetController !== 'undefined') {
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
    }
  } catch (e) {
    console.warn('[liminal] Scramjet init failed, falling back to UV:', e);
    await initUV();
  }
}

async function initProxy() {
  if (activeEngine === 'scramjet') {
    await initScramjet();
    // Also register UV SW as backup
    initUV();
  } else {
    await initUV();
  }
}

// ── Search form ───────────────────────────────────────────────────
searchForm.addEventListener('submit', e => {
  e.preventDefault();
  const val = searchInput.value.trim();
  if (!val) return;
  proxyNavigate(toAbsoluteUrl(val));
});

searchInput.addEventListener('input', () => {
  const val = searchInput.value.trim();
  if (!val) { clearHint(); return; }
  if (looksLikeUrl(val)) {
    setHint('→ Proxy: ' + (val.startsWith('http') ? val : 'https://' + val));
  } else {
    setHint('→ DuckDuckGo: "' + val + '"');
  }
});

// Slash focuses search bar
document.addEventListener('keydown', e => {
  if (e.key === '/' && document.activeElement !== searchInput) {
    e.preventDefault();
    searchInput.focus();
  }
  if (e.key === 'Escape') closeModal();
});

// Quick link buttons
document.querySelectorAll('.quick-btn').forEach(btn => {
  btn.addEventListener('click', () => proxyNavigate(btn.dataset.url));
});

function setHint(msg, warn = false) {
  searchHint.textContent = msg;
  searchHint.classList.toggle('warn', warn);
}
function clearHint() {
  searchHint.textContent = '';
  searchHint.classList.remove('warn');
}

// ── Settings modal ────────────────────────────────────────────────
function openModal() {
  modalBackdrop.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeModal() {
  modalBackdrop.classList.remove('open');
  document.body.style.overflow = '';
}

settingsBtn.addEventListener('click', openModal);
modalClose.addEventListener('click', closeModal);
modalBackdrop.addEventListener('click', e => {
  if (e.target === modalBackdrop) closeModal();
});

// Engine cards
engineList.querySelectorAll('.engine-card[data-engine]').forEach(card => {
  card.addEventListener('click', () => {
    const eng = card.dataset.engine;
    saveEngine(eng);
    syncEngineUI();
    initProxy();
  });
});

function syncEngineUI() {
  engineList.querySelectorAll('.engine-card[data-engine]').forEach(card => {
    card.classList.toggle('active', card.dataset.engine === activeEngine);
  });
  engineLabel.textContent = activeEngine === 'uv' ? 'Ultraviolet' : 'Scramjet';
}

// ── Starfield canvas ──────────────────────────────────────────────
(function starfield() {
  const canvas = document.getElementById('starfield');
  const ctx    = canvas.getContext('2d');
  const COUNT  = 200;
  let stars    = [];

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function mkStar() {
    return {
      x:  Math.random() * canvas.width,
      y:  Math.random() * canvas.height,
      r:  Math.random() * 1.4 + 0.15,
      o:  Math.random() * 0.65 + 0.1,
      vy: Math.random() * 0.25 + 0.04,
      tw: Math.random() * Math.PI * 2,
      ts: Math.random() * 0.018 + 0.004,
    };
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const s of stars) {
      s.tw += s.ts;
      const o = s.o * (0.55 + 0.45 * Math.sin(s.tw));
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(215,195,255,${o})`;
      ctx.fill();
      if (s.r > 1) {
        const grad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 3);
        grad.addColorStop(0, `rgba(200,170,255,${o * .3})`);
        grad.addColorStop(1, 'transparent');
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * 3, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
      }
      s.y += s.vy;
      if (s.y > canvas.height + 2) {
        s.y = -2;
        s.x = Math.random() * canvas.width;
      }
    }
    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', () => {
    resize();
    stars = Array.from({ length: COUNT }, mkStar);
  });
  resize();
  stars = Array.from({ length: COUNT }, mkStar);
  draw();
})();

// ── Init ──────────────────────────────────────────────────────────
syncEngineUI();
initProxy();
window.addEventListener('load', () => searchInput.focus());
