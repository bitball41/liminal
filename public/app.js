/* ── Liminal Axis — app.js ───────────────────────────────────────── */

// ── DOM refs ──────────────────────────────────────────────────────
const searchForm    = document.getElementById('searchForm');
const searchInput   = document.getElementById('searchInput');
const searchHint    = document.getElementById('searchHint');
const settingsBtn   = document.getElementById('settingsBtn');
const modalBackdrop = document.getElementById('modalBackdrop');
const modalClose    = document.getElementById('modalClose');

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
  const ctrl = window.__liminalScramjet;
  if (ctrl) {
    try {
      window.location.href = ctrl.encodeUrl(targetUrl);
      return;
    } catch (e) {
      console.warn('[liminal] Scramjet encodeUrl failed:', e);
    }
  }
  setHint('⚠ Proxy not ready yet. Please wait a moment and try again.', true);
}

// ── Service worker & proxy init ───────────────────────────────────
async function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.onload  = resolve;
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

async function initProxy() {
  if (!('serviceWorker' in navigator)) {
    setHint('⚠ Service workers not supported in this browser.', true);
    return;
  }

  try {
    // bare-mux is UMD — exposes window.BareMux as a global
    await loadScript('/baremux/index.js');

    // scramjet.bundle.js is ESM (exports ScramjetController) — use import()
    const { ScramjetController } = await import('/scramjet/scramjet.bundle.js');

    // scramjet.all.js is the actual SW script (plain IIFE, not ESM)
    await navigator.serviceWorker.register('/scramjet/scramjet.all.js', {
      scope: '/scramjet/',
    });
    await navigator.serviceWorker.ready;

    const wispUrl = (location.protocol === 'https:' ? 'wss' : 'ws') + '://' + location.host + '/wisp/';
    const conn = new BareMux.BareMuxConnection('/baremux/worker.js');
    await conn.setTransport('/epoxy/index.mjs', [{ wisp: wispUrl }]);

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
  } catch (e) {
    console.warn('[liminal] Scramjet init failed:', e);
    setHint('⚠ Proxy failed to initialise. Try refreshing.', true);
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

document.addEventListener('keydown', e => {
  if (e.key === '/' && document.activeElement !== searchInput) {
    e.preventDefault();
    searchInput.focus();
  }
  if (e.key === 'Escape') closeModal();
});

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
initProxy();
window.addEventListener('load', () => searchInput.focus());
