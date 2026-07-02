import { useState } from "react";
import { Icon } from "@/components/icons";
import { PANE_BY_ID, SIDEBAR_GROUPS, type PaneId } from "@/lib/panes";
import { cn } from "@/lib/utils";
import { SectionBody } from "./sections";
import { ThemesPane } from "./ThemeEditor";
import { ToolbarEditor } from "./ToolbarEditor";

export function Settings({ open, onClose, onOpenHistory }: { open: boolean; onClose: () => void; onOpenHistory: () => void }) {
  const [pane, setPane] = useState<PaneId>("themes");

  return (
    <div id="settings-overlay" className={open ? "open" : ""} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div id="settings-modal" role="dialog" aria-modal="true" aria-label="Settings">
        <div className="sm-header">
          <span className="sm-title">
            <Icon name="settings" size={17} />
            Settings
          </span>
          <button className="nav-btn" title="Close settings" onClick={onClose}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <line x1="3" y1="3" x2="13" y2="13" />
              <line x1="13" y1="3" x2="3" y2="13" />
            </svg>
          </button>
        </div>

        <div className="sm-body">
          <nav className="sm-sidebar">
            {SIDEBAR_GROUPS.map((g) => (
              <div key={g.group} className="sm-group">
                <div className="sm-group-label">{g.group}</div>
                {g.items.map((t) => (
                  <button key={t.id} className={cn("sm-tab", pane === t.id && "active")} onClick={() => setPane(t.id)}>
                    <Icon name={t.icon} size={13} anim={pane === t.id ? undefined : "none"} />
                    {t.label}
                  </button>
                ))}
              </div>
            ))}
          </nav>

          <div className="sm-content">
            <div className="sm-pane-header">
              <Icon name={PANE_BY_ID[pane].icon} size={16} anim="none" />
              <div>
                <div className="sm-pane-title">{PANE_BY_ID[pane].label}</div>
                <div className="sm-pane-desc">{PANE_BY_ID[pane].desc}</div>
              </div>
            </div>

            {pane === "themes" ? (
              <ThemesPane />
            ) : pane === "toolbar" ? (
              <ToolbarEditor />
            ) : (
              <SectionBody
                pane={pane}
                onOpenHistory={() => {
                  onClose();
                  onOpenHistory();
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
