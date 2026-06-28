import { useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { core, useBardoSelector } from "@/lib/useCore";
import type { TabView } from "@/lib/types";
import { cn } from "@/lib/utils";

const PageGlyph = () => (
  <svg
    viewBox="0 0 14 14"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="2" y="1" width="10" height="12" rx="1.5" />
    <line x1="4.5" y1="4.5" x2="9.5" y2="4.5" />
    <line x1="4.5" y1="7" x2="9.5" y2="7" />
    <line x1="4.5" y1="9.5" x2="7.5" y2="9.5" />
  </svg>
);

function TabFavicon({ tab }: { tab: TabView }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="tab-favicon">
      {tab.favicon && !failed ? (
        <img src={tab.favicon} alt="" onError={() => setFailed(true)} />
      ) : (
        <PageGlyph />
      )}
    </div>
  );
}

export function TabBar() {
  const tabs = useBardoSelector(
    (snapshot) => snapshot.tabs,
    (previous, next) =>
      previous.length === next.length &&
      previous.every((tab, index) => {
        const candidate = next[index];
        return (
          candidate !== undefined &&
          tab.id === candidate.id &&
          tab.title === candidate.title &&
          tab.url === candidate.url &&
          tab.favicon === candidate.favicon &&
          tab.loading === candidate.loading &&
          tab.active === candidate.active &&
          tab.pinned === candidate.pinned
        );
      }),
  );
  const [dragId, setDragId] = useState<number | null>(null);
  const [overId, setOverId] = useState<number | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ id: number; x: number; y: number } | null>(null);

  // Pointer-based tab reordering. We deliberately avoid the native HTML5
  // drag-and-drop API: when a native drag passes over the cross-origin proxy
  // iframes (.nav-frame) the OS drag loop's hit-testing breaks, so drop/dragend
  // never fire and the whole page freezes mid-drag with nothing clickable.
  // Pointer events + pointer capture never start an OS drag and keep firing on
  // the captured tab even over an iframe, so reordering stays reliable.
  const drag = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);

  const tabIdAtPoint = (x: number, y: number): number | null => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>(".tab");
    return el?.dataset.tabId ? Number(el.dataset.tabId) : null;
  };

  const endDrag = () => {
    drag.current = null;
    setDragId(null);
    setOverId(null);
    document.body.classList.remove("tab-dragging");
  };

  return (
    <div id="tab-bar">
      <div id="tab-bar-tabs">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            data-tab-id={tab.id}
            className={cn("tab", tab.active && "active", overId === tab.id && "drag-over", dragId === tab.id && "dragging", tab.pinned && "pinned")}
            onContextMenu={(e) => {
              e.preventDefault();
              setCtxMenu({ id: tab.id, x: e.clientX, y: e.clientY });
            }}
            onPointerDown={(e) => {
              if (e.button !== 0) return; // ignore right/middle click
              if ((e.target as HTMLElement).closest(".tab-close")) return; // let close button handle it
              drag.current = { id: tab.id, x: e.clientX, y: e.clientY, moved: false };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (!d) return;
              if (!d.moved) {
                if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 5) return;
                d.moved = true;
                setDragId(d.id);
                document.body.classList.add("tab-dragging");
              }
              const over = tabIdAtPoint(e.clientX, e.clientY);
              setOverId(over !== null && over !== d.id ? over : null);
            }}
            onPointerUp={(e) => {
              const d = drag.current;
              if (!d) return;
              if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
              if (d.moved) {
                const target = tabIdAtPoint(e.clientX, e.clientY);
                if (target !== null && target !== d.id) core.reorderTab(d.id, target);
              } else {
                core.activateTab(d.id); // treat a no-drag press as a plain click
              }
              endDrag();
            }}
            onPointerCancel={endDrag}
          >
            <TabFavicon tab={tab} />
            <span className={cn("tab-title", tab.pinned && "pinned")}>{tab.title}</span>
            <button
              className="tab-close"
              title="Close tab"
              onClick={(e) => {
                e.stopPropagation();
                core.closeTab(tab.id);
              }}
            >
              <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <line x1="2" y1="2" x2="8" y2="8" />
                <line x1="8" y1="2" x2="2" y2="8" />
              </svg>
            </button>
          </div>
        ))}
      </div>
      <button id="btn-new-tab" title="New tab" onClick={() => core.openTab()}>
        <Icon name="plus" size={13} />
      </button>

      {ctxMenu && (
        <div
          className="tab-ctx-menu"
          style={{ position: "fixed", left: ctxMenu.x, top: ctxMenu.y, zIndex: 100 }}
          onClick={() => setCtxMenu(null)}
        >
          <div className="tab-ctx-item" onClick={() => { core.togglePinTab(ctxMenu.id); setCtxMenu(null); }}>
            {tabs.find((t) => t.id === ctxMenu.id)?.pinned ? "Unpin" : "Pin"}
          </div>
          <div className="tab-ctx-item" onClick={() => { core.closeTab(ctxMenu.id); setCtxMenu(null); }}>
            Close tab
          </div>
          <div className="tab-ctx-item" onClick={() => { core.reload(); setCtxMenu(null); }}>
            Reload
          </div>
        </div>
      )}
    </div>
  );
}
