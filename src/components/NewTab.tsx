import { lazy, Suspense, useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { GooeyInput } from "@/components/ui/gooey-input";
import { gFav } from "@/lib/constants";
import { core, shallowEqual, useBardoSelector } from "@/lib/useCore";
import type { Shortcut } from "@/lib/types";

const lazyWidget = <T extends keyof typeof import("@/components/widgets")>(name: T) =>
  lazy(() => import("@/components/widgets").then((module) => ({ default: module[name] })));

const BatteryWidget = lazyWidget("BatteryWidget");
const DateWidget = lazyWidget("DateWidget");
const NotesWidget = lazyWidget("NotesWidget");
const PomodoroWidget = lazyWidget("PomodoroWidget");
const TodoWidget = lazyWidget("TodoWidget");
const WeatherWidget = lazyWidget("WeatherWidget");

function greeting(h: number) {
  if (h < 5) return "Good night";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 10000);
    return () => clearInterval(t);
  }, []);
  return (
    <div id="nt-clock" className="visible">
      <span className="nt-time-row">
        <span id="nt-time">{now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
      </span>
      <span id="nt-greeting">{greeting(now.getHours())}</span>
    </div>
  );
}

function QuickLinkIcon({ sc }: { sc: Shortcut }) {
  const [failed, setFailed] = useState(false);
  let src = sc.icon && !sc.icon.startsWith("preset:") ? sc.icon : "";
  if (!src) {
    try {
      src = gFav(new URL(sc.url).hostname);
    } catch {
      /* ignore */
    }
  }
  if (!src || failed) return null;
  return <img src={src} alt="" onError={() => setFailed(true)} />;
}

export function NewTab() {
  const { settings, status, statusWarn, showNewTab, shortcuts, abBlocked } = useBardoSelector(
    (snapshot) => ({
      settings: snapshot.settings,
      status: snapshot.status,
      statusWarn: snapshot.statusWarn,
      showNewTab: snapshot.showNewTab,
      shortcuts: snapshot.shortcuts,
      abBlocked: snapshot.abBlocked,
    }),
    shallowEqual,
  );
  const [search, setSearch] = useState("");
  const statusLoading = !statusWarn && /loading|setting up|starting|registering|refreshing|clearing/i.test(status);

  return (
    <div id="new-tab" hidden={!showNewTab}>
      {settings.ntClock && <Clock />}

      <div id="brand">
        <svg id="logo" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M16 68 L16 38 Q16 12 40 12 Q64 12 64 38 L64 68"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
          />
          <line x1="8" y1="68" x2="72" y2="68" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
        <h1 id="wordmark">Bardo</h1>
        <span id="byline">By Liminal</span>
      </div>

      <form
        id="search-form"
        autoComplete="off"
        spellCheck={false}
        onSubmit={(e) => {
          e.preventDefault();
          core.submitUrl(e.currentTarget.querySelector<HTMLInputElement>("#search-input")?.value ?? search);
          setSearch("");
        }}
      >
        <GooeyInput
          inputId="search-input"
          placeholder="Search or enter URL…"
          value={search}
          onValueChange={setSearch}
          collapsedWidth="100%"
          expandedWidth="calc(100% - 48px)"
          expandedOffset={48}
          gooeyBlur={6}
          collapseOnBlur
          clearOnCollapse={false}
          selectOnFocus
          className="gooey-newtab-root"
          classNames={{
            filterWrap: "gooey-newtab-filter",
            buttonRow: "gooey-newtab-row",
            trigger: "gooey-newtab-trigger",
            input: "gooey-newtab-input",
            bubble: "gooey-newtab-bubble",
            bubbleSurface: "gooey-newtab-bubble-surface",
          }}
        />
      </form>

      <p id="status" aria-live="polite" style={statusWarn ? { color: "#ff5555" } : undefined}>
        {statusWarn ? (
          <Icon name="badge-alert" size={14} />
        ) : statusLoading ? (
          <Icon name="loader-circle" size={14} anim="loader" />
        ) : null}
        {status}
      </p>

      {settings.widgetQuickLinks && shortcuts.length > 0 && (
        <div id="nt-quicklinks">
          {shortcuts.slice(0, 6).map((sc, i) => (
            <button key={i} className="ql-item" title={sc.url} onClick={() => core.navigate(sc.url)}>
              <QuickLinkIcon sc={sc} />
              <span>{sc.label}</span>
            </button>
          ))}
        </div>
      )}

      <Suspense fallback={null}>
        <div id="nt-widgets-left" className="nt-corner">
          {settings.widgetDate && <DateWidget />}
          {settings.widgetWeather && <WeatherWidget />}
          {settings.widgetBattery && <BatteryWidget />}
          {settings.widgetPomodoro && <PomodoroWidget />}
        </div>
        <div id="nt-widgets-right" className="nt-corner">
          {settings.widgetTodo && <TodoWidget />}
          {settings.widgetNotes && <NotesWidget />}
        </div>
      </Suspense>

      {abBlocked && (
        <button className="stealth-launch-btn" style={{ display: "flex" }} onClick={launchStealth}>
          <Icon name="eye" size={15} />
          Open in stealth tab
        </button>
      )}
    </div>
  );
}

function launchStealth() {
  const src = location.href;
  const w = window.open("about:blank", "_blank");
  if (!w) return;
  w.document.write(
    `<!DOCTYPE html><html><head><title></title>` +
      `<style>*{margin:0;padding:0}html,body,iframe{display:block;width:100%;height:100%;border:none;overflow:hidden}</style>` +
      `</head><body><iframe src="${src}"></iframe></body></html>`,
  );
  w.document.close();
}
