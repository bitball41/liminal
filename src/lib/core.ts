import {
  ACCENTS,
  DEFAULT_SETTINGS,
  HISTORY_KEY,
  HISTORY_MAX,
  NOTES_KEY,
  PUBLIC_WISP_SERVERS,
  SEARCH_ENGINES,
  SESSION_KEY,
  SETTINGS_KEY,
  SVC_PREFIX,
  SVC_PREFIX_V2,
  TODOS_KEY,
} from "./constants";
import type {
  Bookmark,
  HistoryEntry,
  InternalTab,
  Settings,
  Shortcut,
  TabView,
  ScramjetController,
  ScramjetControllerFactory,
  BareMuxConnection,
} from "./types";

// Proxy globals injected by the deferred scripts in index.html.
declare global {
  interface Window {
    BareMux: { BareMuxConnection: new (worker: string) => BareMuxConnection };
    $scramjetLoadController: () => ScramjetControllerFactory;
    __bardoCtrl?: ScramjetController | { _prefix: string; createFrame: (iframe: HTMLIFrameElement) => Scramjet2Frame };
    eruda?: { init(): void; show(): void; hide(): void };
  }
}

export type ProgressPhase = "idle" | "active" | "done";

export interface Snapshot {
  tabs: TabView[];
  activeId: number | null;
  activeUrl: string;
  showNewTab: boolean;
  canBack: boolean;
  canFwd: boolean;
  status: string;
  statusWarn: boolean;
  progress: ProgressPhase;
  settings: Settings;
  history: HistoryEntry[];
  shortcuts: Shortcut[];
  ctrlReady: boolean;
  abLaunched: boolean;
  abBlocked: boolean;
}

class BardoCore {
  private settings: Settings = this.loadSettings();
  private tabs: InternalTab[] = [];
  private activeTabId: number | null = null;
  private nextTabId = 0;
  private host: HTMLElement | null = null;
  private restoring = false;
  private booted = false;

  private status = "";
  private statusWarn = false;
  private progress: ProgressPhase = "idle";
  private progressTimer: ReturnType<typeof setTimeout> | null = null;
  private ctrlReady = false;
  private pendingUrl: string | null = null;

  private conn: BareMuxConnection | null = null;
  private activeSWReg: ServiceWorkerRegistration | null = null;
  private swUpdateDebounce: ReturnType<typeof setTimeout> | null = null;
  private swUpdateScheduled = false;

  private history: HistoryEntry[] = this.loadHistory();
  private shortcuts: Shortcut[] = [];

  private listeners = new Set<() => void>();
  private snapshot: Snapshot = this.buildSnapshot();

  // ── Store plumbing (useSyncExternalStore) ───────────────────────
  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };
  getSnapshot = () => this.snapshot;

  private emit() {
    this.snapshot = this.buildSnapshot();
    for (const cb of this.listeners) cb();
  }

  private buildSnapshot(): Snapshot {
    const active = this.tabs.find((t) => t.id === this.activeTabId) ?? null;
    return {
      tabs: this.tabs.map((t) => ({
        id: t.id,
        title: t.title,
        url: t.url,
        favicon: t.favicon,
        loading: t.loading,
        active: t.id === this.activeTabId,
        pinned: t.pinned,
      })),
      activeId: this.activeTabId,
      activeUrl: active?.url ?? "",
      // New-tab page shows whenever there's no loaded page, or while the engine
      // is still booting (so the status line stays visible).
      showNewTab: !active || !active.url || !this.ctrlReady,
      canBack: !!active && (active.navCount >= 1 || active.inPageNavCount >= 1),
      canFwd: !!active && !!active.homeBackUrl,
      status: this.status,
      statusWarn: this.statusWarn,
      progress: this.progress,
      settings: this.settings,
      history: this.history,
      shortcuts: this.shortcuts,
      ctrlReady: this.ctrlReady,
      abLaunched: !!window.__bardoAbLaunched,
      abBlocked: !!window.__bardoAbBlocked,
    };
  }

  // ── Settings ─────────────────────────────────────────────────────
  private loadSettings(): Settings {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }
  private saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch (e: any) {
      if (e.name === "QuotaExceededError" || e.code === 22) {
        import("./toast").then(({ toast }) => toast.error("Storage full — settings couldn't be saved."));
      }
    }
  }
  getSettings() {
    return this.settings;
  }

  setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
    this.settings = { ...this.settings, [key]: value };
    this.saveSettings();

    // Core-domain side effects (appearance side effects live in React).
    if (key === "engine") {
      this.initEngine();
    } else if (key === "restoreTabs") {
      if (value) this.saveSession();
      else this.clearSession();
    }
    this.emit();
  }

  patchSettings(patch: Partial<Settings>) {
    this.settings = { ...this.settings, ...patch };
    this.saveSettings();
    this.emit();
  }

  /** Restore every preference to its default, keeping saved bookmarks. */
  resetSettings() {
    const prevEngine = this.settings.engine;
    const bookmarks = this.settings.bookmarks;
    this.settings = { ...DEFAULT_SETTINGS, bookmarks };
    this.saveSettings();
    if (this.settings.engine !== prevEngine) this.initEngine();
    if (!this.settings.restoreTabs) this.clearSession();
    this.emit();
  }

  // ── Mount point for proxy iframes ────────────────────────────────
  mount(host: HTMLElement) {
    this.host = host;
    for (const t of this.tabs) host.appendChild(t.iframe);
  }

  boot() {
    if (this.booted) return;
    this.booted = true;
    this.restoreSession();
    this.initEngine();
    this.loadShortcuts();
  }

  // ── Tab management ───────────────────────────────────────────────
  private getActiveTab() {
    return this.tabs.find((t) => t.id === this.activeTabId) ?? null;
  }

  private createTabIframe(): HTMLIFrameElement {
    const iframe = document.createElement("iframe");
    iframe.className = "nav-frame";
    iframe.hidden = true;
    iframe.setAttribute(
      "sandbox",
      "allow-same-origin allow-scripts allow-forms allow-popups allow-modals " +
        "allow-pointer-lock allow-orientation-lock allow-presentation allow-downloads",
    );
    (this.host ?? document.body).appendChild(iframe);
    return iframe;
  }

  private bindTabLoad(tab: InternalTab) {
    tab.iframe.addEventListener("load", () => {
      if (!tab.url) return;
      tab.loading = false;
      if (tab.id === this.activeTabId) this.finishProgress();
      this.refreshTabMeta(tab);
      this.addHistory(tab.url, tab.title);
      this.saveSession();
      this.emit();
    });
  }

  openTab(url: string | null = null) {
    const id = this.nextTabId++;
    const iframe = this.createTabIframe();
    const tab: InternalTab = {
      id,
      title: "New Tab",
      url: "",
      favicon: null,
      loading: false,
      iframe,
      frame: null,
      navCount: 0,
      inPageNavCount: 0,
      homeBackUrl: null,
      suspended: false,
      pinned: false,
    };
    this.tabs.push(tab);
    this.bindTabLoad(tab);
    this.activateTab(id);
    if (url) this.navigate(url);
    this.emit();
    return id;
  }

  private openSuspendedTab(meta: { url: string; title?: string; favicon?: string | null; pinned?: boolean }) {
    const id = this.nextTabId++;
    const iframe = this.createTabIframe();
    const tab: InternalTab = {
      id,
      title: meta.title || "New Tab",
      url: meta.url,
      favicon: meta.favicon || null,
      loading: false,
      iframe,
      frame: null,
      navCount: 0,
      inPageNavCount: 0,
      homeBackUrl: null,
      suspended: true,
      pinned: meta.pinned ?? false,
    };
    this.tabs.push(tab);
    this.bindTabLoad(tab);
    return tab;
  }

  closeTab(id: number) {
    const idx = this.tabs.findIndex((t) => t.id === id);
    if (idx === -1) return;
    this.tabs[idx].iframe.remove();
    this.tabs.splice(idx, 1);
    if (this.tabs.length === 0) {
      this.clearSession();
      this.openTab();
      return;
    }
    if (this.activeTabId === id) {
      // Prefer the next non-pinned tab, or the nearest tab overall
      const next = this.tabs.find((t, i) => i >= idx && !t.pinned) ?? this.tabs[Math.min(idx, this.tabs.length - 1)];
      this.activateTab(next.id);
    }
    this.saveSession();
    this.emit();
  }

  pinTab(id: number) {
    const tab = this.tabs.find((t) => t.id === id);
    if (!tab || tab.pinned) return;
    tab.pinned = true;
    // Move pinned tabs to the start of the list
    this.tabs.sort((a, b) => (a.pinned === b.pinned ? 0 : a.pinned ? -1 : 1));
    this.saveSession();
    this.emit();
  }

  unpinTab(id: number) {
    const tab = this.tabs.find((t) => t.id === id);
    if (!tab || !tab.pinned) return;
    tab.pinned = false;
    this.saveSession();
    this.emit();
  }

  togglePinTab(id: number) {
    const tab = this.tabs.find((t) => t.id === id);
    if (!tab) return;
    if (tab.pinned) this.unpinTab(id);
    else this.pinTab(id);
  }

  activateTab(id: number) {
    for (const t of this.tabs) t.iframe.hidden = true;
    this.activeTabId = id;
    const tab = this.tabs.find((t) => t.id === id);
    if (!tab) {
      this.emit();
      return;
    }
    if (tab.suspended) {
      tab.suspended = false;
      this.navigate(tab.url);
      this.saveSession();
      return;
    }
    if (tab.url) {
      tab.iframe.hidden = false;
    }
    if (tab.loading) this.startProgress();
    else this.finishProgress();
    this.emit();
  }

  reorderTab(srcId: number, dstId: number) {
    if (srcId === dstId) return;
    const srcIdx = this.tabs.findIndex((t) => t.id === srcId);
    const dstIdx = this.tabs.findIndex((t) => t.id === dstId);
    if (srcIdx === -1 || dstIdx === -1) return;
    const srcTab = this.tabs[srcIdx];
    const dstTab = this.tabs[dstIdx];
    // Prevent moving a pinned tab after an unpinned tab, or vice versa
    if (srcTab.pinned !== dstTab.pinned) return;
    const [moved] = this.tabs.splice(srcIdx, 1);
    this.tabs.splice(dstIdx, 0, moved);
    this.saveSession();
    this.emit();
  }

  // ── Session persistence ──────────────────────────────────────────
  private saveSession() {
    if (this.restoring || !this.settings.restoreTabs) return;
    try {
      const open: { url: string; title: string; favicon: string | null; pinned: boolean }[] = [];
      let active = -1;
      for (const t of this.tabs) {
        if (!t.url) continue;
        if (t.id === this.activeTabId) active = open.length;
        open.push({ url: t.url, title: t.title, favicon: t.favicon, pinned: t.pinned });
      }
      localStorage.setItem(SESSION_KEY, JSON.stringify({ tabs: open, active }));
    } catch (e: any) {
      if (e.name === "QuotaExceededError" || e.code === 22) {
        import("./toast").then(({ toast }) => toast.error("Storage full — session couldn't be saved."));
      }
    }
  }
  private clearSession() {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
  }
  private restoreSession() {
    let data: any = null;
    if (this.settings.restoreTabs) {
      try {
        data = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
      } catch {
        /* ignore */
      }
    }
    const saved =
      data && Array.isArray(data.tabs) ? data.tabs.filter((t: any) => t && t.url) : [];
    if (!saved.length) {
      this.openTab();
      return;
    }
    this.restoring = true;
    saved.forEach((m: any) => this.openSuspendedTab(m));
    const idx =
      typeof data.active === "number" && data.active >= 0 && data.active < this.tabs.length
        ? data.active
        : 0;
    this.restoring = false;
    this.activateTab(this.tabs[idx].id);
    this.saveSession();
  }

  // ── Tab metadata + progress ──────────────────────────────────────
  private applyUrlMeta(tab: InternalTab, url: string) {
    let host = "";
    try {
      host = new URL(url).hostname;
    } catch {
      /* unparseable */
    }
    tab.title = host || "Loading…";
    tab.favicon = host ? gFav(host) : null;
  }

  private refreshTabMeta(tab: InternalTab) {
    try {
      const doc = tab.iframe.contentWindow?.document;
      const t = doc?.title?.trim();
      if (t) tab.title = t;
    } catch {
      /* cross-origin / not ready */
    }
  }

  private startProgress() {
    if (this.progressTimer) clearTimeout(this.progressTimer);
    this.progress = "active";
    this.emit();
  }
  private finishProgress() {
    if (this.progress !== "active") return;
    this.progress = "done";
    this.emit();
    this.progressTimer = setTimeout(() => {
      this.progress = "idle";
      this.emit();
    }, 320);
  }

  // ── URL helpers ──────────────────────────────────────────────────
  toUrl(s: string) {
    s = s.trim();
    if (/^https?:\/\//i.test(s)) return s;
    if (!s.includes(" ") && /^[a-z0-9-]+(\.[a-z]{2,})(\/.*)?$/i.test(s)) return "https://" + s;
    const engine = SEARCH_ENGINES[this.settings.searchEngine] || SEARCH_ENGINES.duckduckgo;
    return engine(s);
  }

  private activeSvcPrefix() {
    return this.settings.engine === "scramjet2" ? SVC_PREFIX_V2 : SVC_PREFIX;
  }

  proxiedUrl(rawUrl: string) {
    const ctrl = window.__bardoCtrl;
    const encoded =
      ctrl && "encodeUrl" in ctrl && typeof ctrl.encodeUrl === "function"
        ? ctrl.encodeUrl(rawUrl)
        : encodeURIComponent(rawUrl);
    return location.origin + this.activeSvcPrefix() + encoded;
  }

  // ── Navigation ───────────────────────────────────────────────────
  navigate(url: string) {
    const ctrl = window.__bardoCtrl;
    if (!ctrl) {
      this.pendingUrl = url;
      this.setStatus("Loading, will navigate when ready…");
      const tab = this.getActiveTab();
      if (tab) {
        tab.url = url;
        tab.iframe.hidden = true;
      }
      this.emit();
      return;
    }
    const tab = this.getActiveTab();
    if (!tab) return;

    if (!tab.frame) {
      tab.frame = ctrl.createFrame(tab.iframe);
      tab.frame.addEventListener("urlchange", (e: any) => {
        if (!e.url) return;
        tab.inPageNavCount++;
        tab.homeBackUrl = null;
        tab.url = e.url;
        this.applyUrlMeta(tab, e.url);
        this.addHistory(e.url, tab.title);
        this.saveSession();
        this.emit();
      });
    }

    tab.url = url;
    tab.navCount++;
    tab.inPageNavCount = 0;
    tab.homeBackUrl = null;
    tab.loading = true;
    if (tab.id === this.activeTabId) this.startProgress();
    tab.frame.go(url);
    this.applyUrlMeta(tab, url);
    this.addHistory(url, tab.title);
    tab.iframe.hidden = false;
    this.saveSession();
    this.emit();
  }

  back() {
    const tab = this.getActiveTab();
    if (!tab) return;
    if (tab.inPageNavCount > 0) {
      tab.inPageNavCount--;
      tab.frame?.back();
      tab.iframe.contentWindow?.history?.back();
    } else if (tab.navCount > 0) {
      tab.homeBackUrl = tab.url;
      tab.url = "";
      tab.title = "New Tab";
      tab.navCount = 0;
      tab.inPageNavCount = 0;
      tab.iframe.hidden = true;
      this.saveSession();
    }
    this.emit();
  }

  forward() {
    const tab = this.getActiveTab();
    if (!tab) return;
    if (tab.homeBackUrl) {
      this.navigate(tab.homeBackUrl);
    } else {
      tab.frame?.forward();
      tab.iframe.contentWindow?.history?.forward();
    }
  }

  reload() {
    const tab = this.getActiveTab();
    if (tab?.url) tab.frame?.reload();
    else this.initEngine();
  }

  goHome() {
    const tab = this.getActiveTab();
    if (!tab) return;
    tab.url = "";
    tab.title = "New Tab";
    tab.navCount = 0;
    tab.iframe.hidden = true;
    this.saveSession();
    this.emit();
  }

  /** Address bar / search submit from chrome or new-tab page. */
  submitUrl(raw: string) {
    const v = raw.trim();
    if (v) this.navigate(this.toUrl(v));
  }

  openExternal() {
    const url = this.getActiveTab()?.url;
    if (!url) return;
    window.open(this.proxiedUrl(url), "_blank", "noopener,noreferrer");
  }

  // ── Bookmarks ────────────────────────────────────────────────────
  /** Returns the bookmarked title on success, "duplicate" if already saved,
   * or null when there's no page to bookmark — lets the UI give feedback. */
  addBookmark(): { status: "added" | "duplicate" | "empty"; title?: string } {
    const tab = this.getActiveTab();
    if (!tab?.url) return { status: "empty" };
    const url = tab.url;
    if (this.settings.bookmarks.some((b) => b.url === url)) return { status: "duplicate" };
    let title = tab.title;
    if (!title) {
      try {
        title = new URL(url).hostname;
      } catch {
        title = url;
      }
    }
    this.patchSettings({ bookmarks: [...this.settings.bookmarks, { id: Date.now(), title, url }] });
    return { status: "added", title };
  }
  removeBookmark(id: number) {
    this.patchSettings({ bookmarks: this.settings.bookmarks.filter((b) => b.id !== id) });
  }
  restoreBookmark(bookmark: Bookmark, index: number) {
    if (this.settings.bookmarks.some((b) => b.id === bookmark.id)) return;
    const next = [...this.settings.bookmarks];
    next.splice(Math.min(index, next.length), 0, bookmark);
    this.patchSettings({ bookmarks: next });
  }

  // ── WISP / engine init ───────────────────────────────────────────
  private checkWisp(url: string, timeoutMs = 8000) {
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const ws = new WebSocket(url);
      const done = (ok: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(t);
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        resolve(ok);
      };
      const t = setTimeout(() => done(false), timeoutMs);
      ws.addEventListener("open", () => done(true));
      ws.addEventListener("error", () => done(false));
    });
  }

  private firstReachable(urls: string[], timeoutMs = 6000) {
    return new Promise<string | null>((resolve) => {
      let remaining = urls.length;
      if (remaining === 0) {
        resolve(null);
        return;
      }
      let settled = false;
      urls.forEach((url) => {
        this.checkWisp(url, timeoutMs).then((ok) => {
          if (settled) return;
          if (ok) {
            settled = true;
            resolve(url);
            return;
          }
          if (--remaining === 0) resolve(null);
        });
      });
    });
  }

  private async setupTransport() {
    this.setStatus("Setting up transport…");
    if (!this.conn) this.conn = new window.BareMux.BareMuxConnection("/baremux/worker.js");
    const wsProto = location.protocol === "https:" ? "wss" : "ws";
    const localWisp = `${wsProto}://${location.host}/wisp/`;
    // The same-origin endpoint is Bardo's fast path. Public probes only start
    // if it fails, avoiding several unnecessary WebSockets on every launch.
    const localReady = await this.checkWisp(localWisp, 1500);
    const wispUrl = localReady
      ? localWisp
      : await this.firstReachable(PUBLIC_WISP_SERVERS);
    if (!wispUrl) throw new Error("No Wisp server reachable — check your connection.");
    await this.conn.setTransport("/epoxy/index.mjs", [{ wisp: wispUrl }]);
    return wispUrl;
  }

  private async registerSW(swPath: string, scope: string) {
    for (const reg of await navigator.serviceWorker.getRegistrations()) {
      if (!reg.scope.endsWith(scope)) await reg.unregister();
    }
    const reg = await navigator.serviceWorker.register(swPath, {
      scope,
      updateViaCache: "none",
    });
    await new Promise<void>((resolve, reject) => {
      if (reg.active) {
        resolve();
        return;
      }
      const sw = reg.installing || reg.waiting;
      if (!sw) {
        reject(new Error("No service worker found"));
        return;
      }
      sw.addEventListener("statechange", function (this: ServiceWorker) {
        if (this.state === "activated") resolve();
        if (this.state === "redundant") reject(new Error("Service worker install failed"));
      });
    });
    return reg;
  }

  private scheduleSWUpdate(reg: ServiceWorkerRegistration) {
    this.activeSWReg = reg;
    if (this.swUpdateScheduled) return;
    this.swUpdateScheduled = true;
    setInterval(() => {
      if (this.activeSWReg) this.activeSWReg.update().catch(() => {});
    }, 30 * 60 * 1000);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && this.activeSWReg) {
        if (this.swUpdateDebounce) clearTimeout(this.swUpdateDebounce);
        this.swUpdateDebounce = setTimeout(() => {
          this.activeSWReg?.update().catch(() => {});
        }, 5000);
      }
    });
  }

  async initEngine(attempt = 1) {
    if (!("serviceWorker" in navigator)) {
      this.setStatus("Service workers not supported.", true);
      return;
    }
    try {
      if (this.settings.engine === "scramjet2") await this.initScramjet2();
      else await this.initScramjet();
    } catch (e: any) {
      console.error(`[bardo] init failed (attempt ${attempt}):`, e);
      if (attempt < 3) {
        const delay = attempt * 2000;
        this.setStatus(`Error, retrying in ${delay / 1000}s…`, true);
        setTimeout(() => this.initEngine(attempt + 1), delay);
      } else if (!sessionStorage.getItem("bardo-sw-fix-attempted")) {
        sessionStorage.setItem("bardo-sw-fix-attempted", "1");
        this.setStatus("Refreshing…");
        await this.forceReload();
      } else {
        sessionStorage.removeItem("bardo-sw-fix-attempted");
        this.setStatus(e.message, true);
      }
    }
  }

  private async initScramjet() {
    this.setStatus("Starting engine…");
    // The WISP transport probe, the Scramjet controller (which fetches and
    // compiles ~500 kB of wasm), and service-worker registration are mutually
    // independent. Running them concurrently overlaps the network probe and the
    // wasm download/compile instead of serializing them, which is the dominant
    // cost of a cold boot. Navigation only proceeds once all three resolve.
    const [, ctrl, reg] = await Promise.all([
      this.setupTransport(),
      this.startScramjetController(),
      this.registerSW("/sw.js", SVC_PREFIX),
    ]);
    this.scheduleSWUpdate(reg);
    window.__bardoCtrl = ctrl;
    this.ctrlReady = true;
    sessionStorage.removeItem("bardo-sw-fix-attempted");
    this.setStatus("");
    this.flushPending();
  }

  private async startScramjetController() {
    const { ScramjetController } = window.$scramjetLoadController();
    const ctrl = new ScramjetController({
      prefix: SVC_PREFIX,
      files: {
        wasm: "/scramjet/scramjet.wasm.wasm",
        all: "/scramjet/scramjet.all.js",
        sync: "/scramjet/scramjet.sync.js",
      },
    });
    try {
      await ctrl.init();
    } catch (e: any) {
      if (e.message?.includes("object store") || e.message?.includes("IDBDatabase")) {
        await new Promise<void>((resolve) => {
          const r = indexedDB.deleteDatabase("$scramjet");
          r.onsuccess = r.onerror = r.onblocked = () => resolve();
        });
        await ctrl.init();
      } else {
        throw e;
      }
    }
    return ctrl;
  }

  private async initScramjet2() {
    this.setStatus("Starting Scramjet v2…");
    // Transport setup and SW registration are independent — overlap them.
    const [, reg] = await Promise.all([
      this.setupTransport(),
      this.registerSW("/sw-scramjet2.js", SVC_PREFIX_V2),
    ]);
    this.scheduleSWUpdate(reg);
    window.__bardoCtrl = {
      _prefix: SVC_PREFIX_V2,
      createFrame: (iframe: HTMLIFrameElement) => new Scramjet2Frame(iframe, SVC_PREFIX_V2),
    };
    this.ctrlReady = true;
    sessionStorage.removeItem("bardo-sw-fix-attempted");
    this.setStatus("");
    this.flushPending();
  }

  private flushPending() {
    if (this.pendingUrl) {
      const url = this.pendingUrl;
      this.pendingUrl = null;
      this.navigate(url);
    }
    this.emit();
  }

  async forceReload() {
    this.setStatus("Clearing cache…");
    for (const reg of await navigator.serviceWorker.getRegistrations()) {
      if (reg.scope.includes(SVC_PREFIX) || reg.scope.includes(SVC_PREFIX_V2)) {
        await reg.unregister();
      }
    }
    for (const db of ["$scramjet", "$scramjet2"]) {
      await new Promise<void>((resolve) => {
        const r = indexedDB.deleteDatabase(db);
        r.onsuccess = r.onerror = r.onblocked = () => resolve();
      });
    }
    window.location.reload();
  }

  private setStatus(msg: string, warn = false) {
    this.status = msg;
    this.statusWarn = warn;
    this.emit();
  }

  // ── History ──────────────────────────────────────────────────────
  private loadHistory(): HistoryEntry[] {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    } catch {
      return [];
    }
  }
  private saveHistory() {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(this.history));
    } catch (e: any) {
      if (e.name === "QuotaExceededError" || e.code === 22) {
        import("./toast").then(({ toast }) => toast.error("Storage full — history couldn't be saved."));
      }
    }
  }
  private addHistory(url: string, title: string) {
    if (!this.settings.historyEnabled) return;
    if (!url || !/^https?:/i.test(url)) return;
    if (this.history[0] && this.history[0].url === url) {
      this.history[0] = { ...this.history[0], ts: Date.now(), title: title || this.history[0].title };
      this.history = [...this.history];
      this.saveHistory();
      return;
    }
    this.history = [{ url, title: title || "", ts: Date.now() }, ...this.history];
    if (this.history.length > HISTORY_MAX) this.history.length = HISTORY_MAX;
    this.saveHistory();
  }
  removeHistory(entry: HistoryEntry) {
    this.history = this.history.filter((x) => x !== entry);
    this.saveHistory();
    this.emit();
  }
  /** Clears history, returning the prior list so the UI can offer an undo. */
  clearHistory(): HistoryEntry[] {
    const prior = this.history;
    this.history = [];
    this.saveHistory();
    this.emit();
    return prior;
  }
  restoreHistory(entries: HistoryEntry[]) {
    this.history = entries;
    this.saveHistory();
    this.emit();
  }

  // ── Shortcuts (waffle + quick links) ─────────────────────────────
  private async loadShortcuts() {
    try {
      const resp = await fetch("/shortcuts.json");
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      const data = await resp.json();
      this.shortcuts = Array.isArray(data) ? data.filter((s: any) => s.url) : [];
      this.emit();
    } catch (e) {
      console.error("[bardo] failed to load shortcuts:", e);
    }
  }

  // ── Panic key ────────────────────────────────────────────────────
  panic() {
    try {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(HISTORY_KEY);
      localStorage.removeItem(NOTES_KEY);
      localStorage.removeItem(TODOS_KEY);
    } catch {
      /* ignore */
    }
    this.history = [];
    window.location.replace(this.settings.panicUrl || "https://classroom.google.com");
  }

  /** Random accent helper used by the accent picker's shuffle (kept for parity). */
  randomAccent() {
    return ACCENTS[Math.floor(Math.random() * ACCENTS.length)].value;
  }
}

// Frame shim for Scramjet v2 — mirrors the ScramjetFrame API used by navigate().
class Scramjet2Frame {
  private listeners: Record<string, ((e: any) => void)[]> = {};
  private iframe: HTMLIFrameElement;
  private prefix: string;
  constructor(iframe: HTMLIFrameElement, prefix: string) {
    this.iframe = iframe;
    this.prefix = prefix;
    iframe.addEventListener("load", () => this.onLoad());
  }
  private onLoad() {
    try {
      const href = this.iframe.contentWindow?.location.href;
      if (href && href.startsWith(location.origin + this.prefix)) {
        this.listeners.urlchange?.forEach((fn) => fn({ url: href }));
      }
    } catch {
      /* cross-origin */
    }
  }
  go(url: string) {
    this.iframe.src = this.prefix + encodeURIComponent(url);
  }
  reload() {
    this.iframe.contentWindow?.location.reload();
  }
  back() {
    this.iframe.contentWindow?.history.back();
  }
  forward() {
    this.iframe.contentWindow?.history.forward();
  }
  addEventListener(type: string, fn: (e: any) => void) {
    (this.listeners[type] ??= []).push(fn);
  }
}

function gFav(domain: string) {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
}

export const core = new BardoCore();

// Boot-time controllerchange reload guard (mirrors legacy boot block).
const prevController = navigator.serviceWorker?.controller ?? null;
navigator.serviceWorker?.addEventListener("controllerchange", () => {
  if (prevController) window.location.reload();
});
