import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { core, useBardoSelector } from "@/lib/useCore";
import { gFav } from "@/lib/constants";
import type { Shortcut } from "@/lib/types";

// Every preset documented in shortcuts.json is implemented here. Names that are
// not in this map fall back to the site favicon rather than leaking the literal
// "preset:name" string into an <img src>, which previously fired a broken
// request (ERR_UNKNOWN_URL_SCHEME) on every load for video/music/link/chat/news.
const PRESET_ICONS: Record<string, React.ReactNode> = {
  home: <><path d="M2 7.5L8 2l6 5.5" /><path d="M4 6.5V14h3v-3h2v3h3V6.5" /></>,
  star: <polygon points="8,2 9.8,6.2 14.5,6.6 11,9.7 12.1,14.3 8,11.9 3.9,14.3 5,9.7 1.5,6.6 6.2,6.2" />,
  mail: <><rect x="1.5" y="4" width="13" height="9" rx="1.5" /><polyline points="1.5,4 8,9.5 14.5,4" /></>,
  search: <><circle cx="6.5" cy="6.5" r="4" /><line x1="9.7" y1="9.7" x2="13.5" y2="13.5" /></>,
  bookmark: <path d="M4 2h8v12l-4-2.5L4 14V2z" />,
  video: <><rect x="1.5" y="3.5" width="9" height="9" rx="1.5" /><path d="M10.5 6.5l4-2v7l-4-2z" /></>,
  music: <><circle cx="4.5" cy="12" r="2" /><circle cx="12.5" cy="10.5" r="2" /><path d="M6.5 12V4l8-1.5V10.5" /></>,
  link: <><path d="M6.5 9.5l3-3" /><path d="M7.5 4.5l1-1a2.5 2.5 0 0 1 3.5 3.5l-1 1" /><path d="M8.5 11.5l-1 1a2.5 2.5 0 0 1-3.5-3.5l1-1" /></>,
  chat: <path d="M2 3.5h12v8H6l-3 2.5v-2.5H2z" />,
  news: <><rect x="1.5" y="3" width="13" height="10" rx="1" /><line x1="3.5" y1="6" x2="9" y2="6" /><line x1="3.5" y1="8.5" x2="9" y2="8.5" /><line x1="3.5" y1="11" x2="7" y2="11" /><rect x="10.5" y="6" width="2.5" height="2.5" /></>,
};

function ShortcutIcon({ sc }: { sc: Shortcut }) {
  const [failed, setFailed] = useState(false);
  const icon = sc.icon || "";
  const isPreset = icon.startsWith("preset:");
  if (isPreset) {
    const paths = PRESET_ICONS[icon.slice(7)];
    if (paths)
      return (
        <svg className="waffle-icon-svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          {paths}
        </svg>
      );
  }
  // Real image URL, or favicon fallback for missing/unknown-preset icons.
  let src = isPreset ? "" : icon;
  if (!src) {
    try {
      src = gFav(new URL(sc.url).hostname);
    } catch {
      /* unparseable */
    }
  }
  if (!src || failed) return <span className="waffle-icon-svg" />;
  return <img className="waffle-icon" src={src} alt="" onError={() => setFailed(true)} />;
}

export function WaffleMenu() {
  const shortcuts = useBardoSelector((snapshot) => snapshot.shortcuts);
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });

  useEffect(() => {
    if (!open) return;
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    const onDoc = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node) && e.target !== btnRef.current) setOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        className="nav-btn"
        title="Shortcuts"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        <Icon name="grip" size={15} />
      </button>
      <div
        ref={panelRef}
        id="waffle-panel"
        className={open ? "open" : ""}
        style={{ top: pos.top, right: pos.right }}
      >
        {shortcuts.length === 0 ? (
          <p style={{ fontSize: 12, color: "var(--muted)", padding: 12, gridColumn: "1/-1", textAlign: "center" }}>
            No shortcuts yet
          </p>
        ) : (
          shortcuts.map((sc, i) => (
            <button
              key={i}
              className="waffle-item"
              title={sc.label}
              onClick={() => {
                setOpen(false);
                core.navigate(sc.url);
              }}
            >
              <ShortcutIcon sc={sc} />
              <span className="waffle-label">{sc.label}</span>
            </button>
          ))
        )}
      </div>
    </>
  );
}
