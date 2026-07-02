import { useState, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { ACCENTS, RECOMMENDED_THEMES, THEME_COLUMNS, WALLPAPER_KEY } from "@/lib/constants";
import type { PaneId } from "@/lib/panes";
import { toast } from "@/lib/toast";
import { core, useBardoSelector } from "@/lib/useCore";
import type { CustomTheme, EngineName, Settings as SettingsType, TabPosition, ThemeName } from "@/lib/types";
import { cn } from "@/lib/utils";

export function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle-wrap">
      <input type="checkbox" className="toggle-input" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" />
    </label>
  );
}

export function ToggleRow({
  name,
  hint,
  k,
  s,
  icon,
}: {
  name: string;
  hint?: string;
  k: keyof SettingsType;
  s: SettingsType;
  icon?: IconName;
}) {
  return (
    <label className="setting-row toggle-row" style={{ marginBottom: 10 }}>
      <div className="setting-info">
        <span className={cn("setting-name", icon && "setting-name-icon")}>
          {icon && <Icon name={icon} size={14} />}
          {name}
        </span>
        {hint && <span className="setting-hint">{hint}</span>}
      </div>
      <Toggle checked={s[k] as boolean} onChange={(v) => core.setSetting(k, v as never)} />
    </label>
  );
}

const CLOAKS = [
  ["none", "None"],
  ["canvas", "Canvas"],
  ["gdrive", "Google Drive"],
  ["canva", "Canva"],
  ["classlink", "ClassLink"],
  ["blooket", "Blooket"],
  ["classroom", "Classroom"],
  ["docs", "Google Docs"],
] as const;

function compressWallpaper(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxDim = 2560;
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      let quality = 0.85;
      let data = canvas.toDataURL("image/jpeg", quality);
      while (data.length > 2_500_000 && quality > 0.4) {
        quality -= 0.15;
        data = canvas.toDataURL("image/jpeg", quality);
      }
      if (data.length > 2_500_000) reject(new Error("too large"));
      else resolve(data);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode failed"));
    };
    img.src = url;
  });
}

const TAB_POS_SVG: Record<TabPosition, ReactNode> = {
  top: (
    <svg viewBox="0 0 40 30" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="0.75" y="0.75" width="38.5" height="28.5" rx="2.5" />
      <rect x="0.75" y="0.75" width="38.5" height="7.5" rx="2.5" fill="currentColor" fillOpacity="0.18" />
      <line x1="0.75" y1="8.25" x2="39.25" y2="8.25" />
    </svg>
  ),
  bottom: (
    <svg viewBox="0 0 40 30" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="0.75" y="0.75" width="38.5" height="28.5" rx="2.5" />
      <rect x="0.75" y="21.75" width="38.5" height="7.5" rx="2.5" fill="currentColor" fillOpacity="0.18" />
      <line x1="0.75" y1="21.75" x2="39.25" y2="21.75" />
    </svg>
  ),
  left: (
    <svg viewBox="0 0 40 30" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="0.75" y="0.75" width="38.5" height="28.5" rx="2.5" />
      <rect x="0.75" y="0.75" width="12" height="28.5" rx="2.5" fill="currentColor" fillOpacity="0.18" />
      <line x1="12.75" y1="0.75" x2="12.75" y2="29.25" />
    </svg>
  ),
  right: (
    <svg viewBox="0 0 40 30" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="0.75" y="0.75" width="38.5" height="28.5" rx="2.5" />
      <rect x="27.25" y="0.75" width="12" height="28.5" rx="2.5" fill="currentColor" fillOpacity="0.18" />
      <line x1="27.25" y1="0.75" x2="27.25" y2="29.25" />
    </svg>
  ),
};

export interface ThemesSectionProps {
  onEditTheme?: (theme: CustomTheme) => void;
  onNewTheme?: () => void;
}

export function ThemesSection({ onEditTheme, onNewTheme }: ThemesSectionProps) {
  const s = useBardoSelector((snapshot) => snapshot.settings);
  const customThemes = useBardoSelector((snapshot) => snapshot.customThemes);

  const themeBtn = (t: (typeof RECOMMENDED_THEMES)[number]) => {
    const active = s.theme === t.id;
    return (
      <button
        key={t.id}
        className={cn("theme-btn theme-preview", active && "active")}
        style={{
          background: t.surface,
          color: t.text,
          borderColor: active ? t.accent : t.border,
          boxShadow: active ? `0 0 0 1px ${t.accent}` : undefined,
        }}
        onClick={() => core.setSetting("theme", t.id as ThemeName)}
      >
        <span className="theme-dot" style={{ background: t.accent }} />
        {t.label}
      </button>
    );
  };

  return (
    <div className="theme-groups">
      {(customThemes.length > 0 || onNewTheme) && (
        <div className="theme-section">
          <div className="theme-subhead">Your Themes</div>
          <div className="theme-rec-grid">
            {customThemes.map((t) => {
              const active = s.theme === t.id;
              return (
                <div key={t.id} className="custom-theme-wrap">
                  <button
                    className={cn("theme-btn theme-preview custom-theme-btn", active && "active")}
                    style={{
                      background: t.colors.surface,
                      color: t.colors.text,
                      borderColor: active ? t.colors.accent : t.colors.border,
                      boxShadow: active ? `0 0 0 1px ${t.colors.accent}` : undefined,
                    }}
                    onClick={() => core.setSetting("theme", t.id)}
                  >
                    <span className="theme-dot" style={{ background: t.colors.accent }} />
                    <span className="custom-theme-name">{t.name}</span>
                  </button>
                  {onEditTheme && (
                    <button
                      className="custom-theme-edit"
                      title={`Edit ${t.name}`}
                      aria-label={`Edit ${t.name}`}
                      onClick={() => onEditTheme(t)}
                    >
                      <Icon name="square-pen" size={12} />
                    </button>
                  )}
                </div>
              );
            })}
            {onNewTheme && (
              <button className="theme-btn theme-new-btn" onClick={onNewTheme}>
                <Icon name="plus" size={13} />
                New theme
              </button>
            )}
          </div>
        </div>
      )}
      <div className="theme-section">
        <div className="theme-subhead">Recommended</div>
        <div className="theme-rec-grid">{RECOMMENDED_THEMES.map(themeBtn)}</div>
      </div>
      {(["color", "neutral"] as const).map((grp) => (
        <div key={grp} className="theme-section">
          <div className="theme-subhead">{grp === "neutral" ? "Neutral" : "Color"}</div>
          <div className="theme-columns">
            {THEME_COLUMNS.map((col) => (
              <div key={col.mode} className="theme-col">
                <div className="theme-col-head">{col.head}</div>
                {col.themes.filter((t) => t.group === grp).map(themeBtn)}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function AppearanceSection() {
  const s = useBardoSelector((snapshot) => snapshot.settings);
  const [hasImg, setHasImg] = useState(() => {
    try {
      return !!localStorage.getItem(WALLPAPER_KEY);
    } catch {
      return false;
    }
  });
  const [wallpaperErr, setWallpaperErr] = useState(false);

  return (
    <>
      <div className="pane-label">Accent</div>
      <div className="accent-row">
        <button className={cn("accent-swatch", !s.accent && "active")} title="Theme default" onClick={() => core.setSetting("accent", "")}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M3 8h10" />
            <path d="M8 3v10" />
          </svg>
        </button>
        {ACCENTS.map((a) => (
          <button
            key={a.value}
            className={cn("accent-swatch", s.accent === a.value && "active")}
            style={{ background: a.value }}
            title={a.title}
            onClick={() => core.setSetting("accent", a.value)}
          />
        ))}
        <label className="accent-swatch accent-custom" title="Custom colour">
          <input type="color" value={s.accent || "#4466ff"} onChange={(e) => core.setSetting("accent", e.target.value)} />
        </label>
      </div>

      <div className="pane-label" style={{ marginTop: 18 }}>Background</div>
      <p className="pane-hint">Sets the backdrop behind the new-tab page.</p>
      <div className="bg-grid">
        <button className={cn("bg-btn", s.wallpaperType === "none" && "active")} onClick={() => core.setSetting("wallpaperType", "none")}>
          <span className="bg-swatch bg-swatch-none" />
          None
        </button>
        <button className={cn("bg-btn", s.wallpaperType === "gradient" && "active")} onClick={() => core.setSetting("wallpaperType", "gradient")}>
          <span className="bg-swatch bg-swatch-gradient" />
          Accent glow
        </button>
        <label className={cn("bg-btn bg-upload", s.wallpaperType === "image" && "active")} title="Upload an image">
          <span className="bg-swatch bg-swatch-image">
            <Icon name="attach-file" size={16} />
          </span>
          Image
          <input
            type="file"
            accept="image/*"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              try {
                const data = await compressWallpaper(file);
                localStorage.setItem(WALLPAPER_KEY, data);
                setHasImg(true);
                setWallpaperErr(false);
                core.setSetting("wallpaperType", "image");
                toast.success("Background image applied");
              } catch {
                setWallpaperErr(true);
                toast.error("That image couldn’t be used — try a smaller one");
              }
            }}
          />
        </label>
      </div>
      {(hasImg || wallpaperErr) && (
        <button
          className="action-btn"
          style={{ marginTop: 8 }}
          onClick={() => {
            try {
              localStorage.removeItem(WALLPAPER_KEY);
            } catch {
            }
            setHasImg(false);
            setWallpaperErr(false);
            if (s.wallpaperType === "image") core.setSetting("wallpaperType", "none");
            if (!wallpaperErr) toast.info("Background image removed");
          }}
        >
          <Icon name={wallpaperErr ? "badge-alert" : "delete"} size={13} />
          {wallpaperErr ? "Could not use that image" : "Remove image"}
        </button>
      )}
    </>
  );
}

export function WidgetsSection() {
  const s = useBardoSelector((snapshot) => snapshot.settings);
  return (
    <>
      <div className="pane-label">New-tab Page</div>
      <p className="pane-hint">Toggle the pieces that show on the new-tab page.</p>
      <ToggleRow name="Clock & greeting" hint="Live clock and time-of-day greeting" k="ntClock" s={s} icon="clock" />
      <ToggleRow name="Quick links" hint="Shortcut buttons under the search bar" k="widgetQuickLinks" s={s} />
      <div className="pane-label" style={{ marginTop: 8 }}>Widget Panel</div>
      <p className="pane-hint">A tidy column under the search bar. All off by default.</p>
      <ToggleRow name="Date" hint="Day of the week and full date" k="widgetDate" s={s} icon="calendar-days" />
      <ToggleRow name="Weather" hint="Local conditions, no permission prompt" k="widgetWeather" s={s} icon="cloud-sun" />
      <ToggleRow name="Battery" hint="Live level and charging time when your browser allows it" k="widgetBattery" s={s} icon="battery-medium" />
      <ToggleRow name="To-do list" hint="A quick checklist that saves on this device" k="widgetTodo" s={s} />
      <ToggleRow name="Focus timer" hint="A 25-minute Pomodoro countdown" k="widgetPomodoro" s={s} icon="hourglass" />
      <ToggleRow name="Quick notes" hint="A scratchpad that saves as you type" k="widgetNotes" s={s} icon="square-pen" />
    </>
  );
}

export function LayoutSection() {
  const s = useBardoSelector((snapshot) => snapshot.settings);
  const vertical = s.tabPosition === "left" || s.tabPosition === "right";
  return (
    <>
      <div className="pane-label">Tab Bar Position</div>
      <p className="pane-hint">Choose where the tab bar appears. Left and Right options show a vertical sidebar.</p>
      <div className="tab-pos-grid">
        {(["top", "bottom", "left", "right"] as TabPosition[]).map((pos) => (
          <button key={pos} className={cn("tab-pos-btn", s.tabPosition === pos && "active")} onClick={() => core.setSetting("tabPosition", pos)}>
            {TAB_POS_SVG[pos]}
            {pos[0].toUpperCase() + pos.slice(1)}
          </button>
        ))}
      </div>
      {vertical && (
        <div style={{ marginTop: 14 }}>
          <label className="setting-row toggle-row">
            <div className="setting-info">
              <span className="setting-name">Hide sidebar</span>
              <span className="setting-hint">Collapses the vertical tab bar</span>
            </div>
            <Toggle checked={s.sidebarCollapsed} onChange={(v) => core.setSetting("sidebarCollapsed", v)} />
          </label>
        </div>
      )}
    </>
  );
}

export function SearchSection() {
  const s = useBardoSelector((snapshot) => snapshot.settings);
  return (
    <>
      <div className="pane-label">Default Search Engine</div>
      <div className="setting-row">
        <span className="setting-name">Engine</span>
        <select className="setting-select" value={s.searchEngine} onChange={(e) => core.setSetting("searchEngine", e.currentTarget.value)}>
          <option value="duckduckgo">DuckDuckGo</option>
          <option value="google">Google</option>
          <option value="bing">Bing</option>
          <option value="brave">Brave</option>
          <option value="startpage">Startpage</option>
        </select>
      </div>
    </>
  );
}

export function BookmarksSection() {
  const s = useBardoSelector((snapshot) => snapshot.settings);
  return (
    <>
      <div className="pane-label">Bookmarks Bar</div>
      <label className="setting-row toggle-row">
        <span className="setting-name">Show bookmarks bar</span>
        <Toggle checked={s.bookmarksVisible} onChange={(v) => core.setSetting("bookmarksVisible", v)} />
      </label>
    </>
  );
}

export function HistorySection({ onOpenHistory }: { onOpenHistory: () => void }) {
  const s = useBardoSelector((snapshot) => snapshot.settings);
  return (
    <>
      <div className="pane-label">Browsing History</div>
      <ToggleRow name="Save history" hint="Stored only on this device — never uploaded" k="historyEnabled" s={s} />
      <button className="action-btn" onClick={onOpenHistory}>
        Open History Page
      </button>
    </>
  );
}

export function PrivacySection() {
  const s = useBardoSelector((snapshot) => snapshot.settings);
  return (
    <>
      <div className="pane-label">Session</div>
      <ToggleRow name="Restore tabs" hint="Reopen your previous tabs the next time you return" k="restoreTabs" s={s} />
      <div className="pane-label" style={{ marginTop: 8 }}>About:blank Launcher</div>
      <ToggleRow name="Enable launcher" hint="Opens the site inside an about:blank tab, hiding the real URL" k="aboutBlankMode" s={s} />
      <p className="pane-hint" style={{ marginTop: 14 }}>
        Your panic key also wipes saved tabs, history and notes when triggered.
      </p>
    </>
  );
}

export function CloakerSection() {
  const s = useBardoSelector((snapshot) => snapshot.settings);
  return (
    <>
      <div className="pane-label">Tab Cloaker</div>
      <p className="pane-hint">Changes the browser tab title and favicon to disguise this page.</p>
      <div className="cloak-grid">
        {CLOAKS.map(([id, label]) => (
          <button key={id} className={cn("cloak-btn", s.tabCloak === id && "active")} onClick={() => core.setSetting("tabCloak", id)}>
            {label}
          </button>
        ))}
      </div>
    </>
  );
}

export function PanicSection() {
  const s = useBardoSelector((snapshot) => snapshot.settings);
  return (
    <>
      <div className="pane-label">Panic Key</div>
      <p className="pane-hint">Instantly redirects the browser tab when pressed.</p>
      <div className="setting-row" style={{ marginBottom: 10 }}>
        <span className="setting-name">Trigger key</span>
        <select className="setting-select" value={s.panicKey} onChange={(e) => core.setSetting("panicKey", e.currentTarget.value)}>
          <option value="">Off</option>
          <option value="Escape">Escape</option>
          <option value="F1">F1</option>
          <option value="F2">F2</option>
          <option value="F3">F3</option>
          <option value="F4">F4</option>
        </select>
      </div>
      <div className="setting-row">
        <span className="setting-name">Redirect to</span>
        <input
          type="url"
          className="setting-input"
          placeholder="https://classroom.google.com"
          value={s.panicUrl}
          onInput={(e) => core.setSetting("panicUrl", e.currentTarget.value)}
        />
      </div>
    </>
  );
}

export function AdvancedSection({ compact }: { compact?: boolean }) {
  const s = useBardoSelector((snapshot) => snapshot.settings);
  return (
    <>
      <div className="pane-label">Engine</div>
      <p className="pane-hint">Changes take effect after a reload.</p>
      <div className="engine-grid">
        {(
          [
            ["scramjet", "Scramjet v1", "Default — stable"],
            ["klystron", "Klystron", "Server-side — beta"],
            ["opulent", "OpulentAPI", "Server-side — JS rendering, beta"],
            ["sherpa", "Sherpa", "Owned Scramjet fork — experimental"],
          ] as [EngineName, string, string][]
        ).map(([id, name, hint]) => (
          <button key={id} className={cn("engine-btn", (s.engine || "scramjet") === id && "active")} onClick={() => core.setSetting("engine", id)}>
            <span className="engine-name">{name}</span>
            <span className="engine-hint">{hint}</span>
          </button>
        ))}
      </div>
      {!compact && (
        <p className="pane-hint" style={{ marginTop: 8 }}>
          Sherpa is available under the AGPL-3.0 license.{" "}
          <a href="https://github.com/bitball41/sherpa" target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
            View Sherpa source code
          </a>
          .
        </p>
      )}
      <div className="pane-label" style={{ marginTop: 16 }}>Developer Tools</div>
      <ToggleRow name="Enable Eruda DevTools" hint="Shows a devtools button in the toolbar to inspect and debug the page" k="erudaEnabled" s={s} />
      <div className="pane-label" style={{ marginTop: 8 }}>Maintenance</div>
      <ConfirmButton
        className="action-btn"
        label="Force reload"
        confirmLabel="Click again to clear cache & reload"
        icon="refresh-ccw"
        onConfirm={() => {
          toast.info("Clearing cache and reloading…");
          core.forceReload();
        }}
      />
      {!compact && (
        <>
          <p className="pane-hint" style={{ marginTop: 8 }}>
            Clears the service worker and cache, then reloads. Use if the browser stops working.
          </p>
          <ConfirmButton
            className="action-btn"
            label="Restore default settings"
            confirmLabel="Click again to reset everything"
            icon="delete"
            onConfirm={() => {
              core.resetSettings();
              toast.success("Settings restored to defaults");
            }}
          />
          <p className="pane-hint" style={{ marginTop: 8 }}>
            Resets every preference to its default. Your saved bookmarks are kept.
          </p>
          <div className="pane-label" style={{ marginTop: 18 }}>Keyboard shortcuts</div>
          <div className="shortcut-list">
            <div className="shortcut-row"><span>Switch to tab 1–9</span><div className="shortcut-keys"><kbd>Alt</kbd> + <kbd>1</kbd>–<kbd>9</kbd></div></div>
            <div className="shortcut-row"><span>Back / forward</span><div className="shortcut-keys"><kbd>Alt</kbd> + <kbd>←</kbd> / <kbd>→</kbd></div></div>
            <div className="shortcut-row"><span>New tab</span><div className="shortcut-keys"><kbd>Ctrl</kbd> + <kbd>T</kbd></div></div>
            <div className="shortcut-row"><span>Open history</span><div className="shortcut-keys"><kbd>Ctrl</kbd> + <kbd>H</kbd></div></div>
            <div className="shortcut-row"><span>Close tab</span><div className="shortcut-keys"><kbd>Ctrl</kbd> + <kbd>W</kbd></div></div>
            <div className="shortcut-row"><span>Focus address bar</span><div className="shortcut-keys"><kbd>Ctrl</kbd> + <kbd>L</kbd></div></div>
            <div className="shortcut-row"><span>Reload page</span><div className="shortcut-keys"><kbd>Ctrl</kbd> + <kbd>R</kbd></div></div>
          </div>
          <p className="pane-hint" style={{ marginTop: 8 }}>
            The <kbd className="kbd-inline">Alt</kbd> (or <kbd className="kbd-inline">⌥</kbd>) shortcuts work everywhere. The{" "}
            <kbd className="kbd-inline">Ctrl</kbd> (or <kbd className="kbd-inline">⌘</kbd>) ones are reserved by most browsers in a
            normal tab, so they only take effect when Bardo runs standalone (e.g. the about:blank launcher under Privacy).
          </p>
        </>
      )}
    </>
  );
}

export interface SectionBodyProps {
  pane: PaneId;
  compact?: boolean;
  onOpenHistory: () => void;
  themesProps?: ThemesSectionProps;
}

/**
 * Shared pane content used by both the Settings modal and pinned toolbar
 * popovers, so there is exactly one implementation of every control.
 */
export function SectionBody({ pane, compact, onOpenHistory, themesProps }: SectionBodyProps) {
  switch (pane) {
    case "themes":
      return <ThemesSection {...themesProps} />;
    case "appearance":
      return <AppearanceSection />;
    case "widgets":
      return <WidgetsSection />;
    case "layout":
      return <LayoutSection />;
    case "search":
      return <SearchSection />;
    case "bookmarks":
      return <BookmarksSection />;
    case "history":
      return <HistorySection onOpenHistory={onOpenHistory} />;
    case "privacy":
      return <PrivacySection />;
    case "cloaker":
      return <CloakerSection />;
    case "panic":
      return <PanicSection />;
    case "advanced":
      return <AdvancedSection compact={compact} />;
    default:
      return null;
  }
}
