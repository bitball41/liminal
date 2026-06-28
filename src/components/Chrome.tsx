import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { GooeyInput } from "@/components/ui/gooey-input";
import { WaffleMenu } from "@/components/WaffleMenu";
import { core, shallowEqual, useBardoSelector } from "@/lib/useCore";

interface ChromeProps {
  onSettings: () => void;
  onHistory: () => void;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
}

export function Chrome({ onSettings, onHistory, fullscreen, onToggleFullscreen }: ChromeProps) {
  const { activeUrl, canBack, canFwd, settings, progress } = useBardoSelector(
    (snapshot) => ({
      activeUrl: snapshot.activeUrl,
      canBack: snapshot.canBack,
      canFwd: snapshot.canFwd,
      settings: snapshot.settings,
      progress: snapshot.progress,
    }),
    shallowEqual,
  );
  const [value, setValue] = useState(activeUrl);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  // Keep the address bar in sync with the active tab unless the user is editing.
  useEffect(() => {
    setValue(activeUrl);
  }, [activeUrl]);

  useEffect(() => {
    if (copyState === "idle") return;
    const timeout = window.setTimeout(() => setCopyState("idle"), 1800);
    return () => window.clearTimeout(timeout);
  }, [copyState]);

  const vertical = settings.tabPosition === "left" || settings.tabPosition === "right";
  const collapsed = settings.sidebarCollapsed;

  return (
    <div id="chrome">
      {vertical && (
        <button
          className="nav-btn"
          title={collapsed ? "Show tabs" : "Hide tabs"}
          onClick={() => core.setSetting("sidebarCollapsed", !collapsed)}
        >
          <Icon
            name={
              collapsed
                ? settings.tabPosition === "right"
                  ? "panel-right-open"
                  : "panel-left-open"
                : "panel-left-close"
            }
            size={15}
          />
        </button>
      )}

      <div id="nav-btns">
        <button className="nav-btn" id="btn-back" title="Back" disabled={!canBack} onClick={() => core.back()}>
          <Icon name="arrow-left" size={15} />
        </button>
        <button className="nav-btn" id="btn-fwd" title="Forward" disabled={!canFwd} onClick={() => core.forward()}>
          <Icon name="arrow-right" size={15} />
        </button>
        <button className="nav-btn" id="btn-reload" title="Reload" onClick={() => core.reload()}>
          <Icon name="refresh-ccw" size={15} />
        </button>
        <button className="nav-btn" id="btn-home" title="Home" onClick={() => core.goHome()}>
          <Icon name="home" size={15} />
        </button>
      </div>

      <form
        id="chrome-form"
        autoComplete="off"
        spellCheck={false}
        onSubmit={(e) => {
          e.preventDefault();
          core.submitUrl(e.currentTarget.querySelector<HTMLInputElement>("#url-bar")?.value ?? value);
        }}
      >
        <GooeyInput
          inputId="url-bar"
          placeholder="Search or enter address"
          value={value}
          onValueChange={setValue}
          collapsedWidth="100%"
          expandedWidth="calc(100% - 32px)"
          expandedOffset={32}
          gooeyBlur={5}
          collapseOnBlur
          clearOnCollapse={false}
          selectOnFocus
          className="gooey-address-root"
          classNames={{
            filterWrap: "gooey-address-filter",
            buttonRow: "gooey-address-row",
            trigger: "gooey-address-trigger",
            input: "gooey-address-input",
            bubble: "gooey-address-bubble",
            bubbleSurface: "gooey-address-bubble-surface",
          }}
        />
      </form>

      <button
        className="nav-btn"
        id="btn-copy-link"
        title={copyState === "copied" ? "Link copied" : copyState === "error" ? "Could not copy link" : "Copy link"}
        disabled={!activeUrl}
        onClick={async () => {
          try {
            await copyText(activeUrl);
            setCopyState("copied");
          } catch {
            setCopyState("error");
          }
        }}
      >
        <Icon name={copyState === "copied" ? "check" : copyState === "error" ? "badge-alert" : "copy"} size={15} />
      </button>
      <button
        className="nav-btn"
        id="btn-fullscreen"
        title={fullscreen ? "Exit fullscreen" : "Fullscreen page"}
        onClick={onToggleFullscreen}
      >
        <Icon name="maximize-2" size={15} />
      </button>
      {settings.erudaEnabled && (
        <button className="nav-btn" id="btn-devtools" title="Developer tools" onClick={openEruda}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4,5 1,8 4,11" />
            <polyline points="12,5 15,8 12,11" />
            <line x1="9.5" y1="2.5" x2="6.5" y2="13.5" />
          </svg>
        </button>
      )}
      <button className="nav-btn" id="btn-history" title="History" onClick={onHistory}>
        <Icon name="history" size={15} />
      </button>
      <WaffleMenu />
      <button className="nav-btn" id="btn-menu" title="Settings" onClick={onSettings}>
        <Icon name="settings" size={15} />
      </button>

      <div id="progress-bar" className={progress === "idle" ? "" : progress} style={{ width: progress === "active" ? "75%" : progress === "done" ? "100%" : "0%" }} />
    </div>
  );
}

async function copyText(value: string) {
  if (!value) throw new Error("No active URL");
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const input = document.createElement("textarea");
  input.value = value;
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  const copied = document.execCommand("copy");
  input.remove();
  if (!copied) throw new Error("Copy unavailable");
}

let erudaOpen = false;
function openEruda() {
  const w = window as any;
  if (!w.eruda) {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/eruda";
    s.onload = () => {
      w.eruda.init();
      w.eruda.show();
      erudaOpen = true;
    };
    s.onerror = () => {
      import("@/lib/toast").then(({ toast }) => toast.error("DevTools CDN failed to load."));
    };
    document.body.appendChild(s);
  } else if (erudaOpen) {
    w.eruda.hide();
    erudaOpen = false;
  } else {
    w.eruda.show();
    erudaOpen = true;
  }
}
