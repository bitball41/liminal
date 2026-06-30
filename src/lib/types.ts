export type ThemeName =
  | "dark"
  | "slate"
  | "graphite"
  | "macchiato"
  | "mocha"
  | "space"
  | "midnight"
  | "aurora"
  | "forest"
  | "crimson"
  | "ember"
  | "rose"
  | "light"
  | "latte"
  | "cappuccino"
  | "stone"
  | "fog"
  | "nebula"
  | "daylight"
  | "dawn"
  | "meadow"
  | "blush"
  | "sand"
  | "petal";

export type TabPosition = "top" | "bottom" | "left" | "right";
export type EngineName = "scramjet" | "scramjet2" | "klystron";
export type WallpaperType = "none" | "gradient" | "image";

export interface ScramjetController {
  encodeUrl(url: string): string;
  createFrame(iframe: HTMLIFrameElement): ScramjetFrame;
  init(): Promise<void>;
}

export interface ScramjetFrame {
  go(url: string): void;
  reload(): void;
  back(): void;
  forward(): void;
  addEventListener(type: "urlchange", fn: (e: { url: string }) => void): void;
}

export interface ScramjetControllerFactory {
  ScramjetController: new (opts: {
    prefix: string;
    files: { wasm: string; all: string; sync: string };
  }) => ScramjetController;
}

export interface BareMuxConnection {
  setTransport(path: string, args: [{ wisp: string }]): Promise<void>;
}

export interface Bookmark {
  id: number;
  title: string;
  url: string;
}

export interface Settings {
  theme: ThemeName;
  aboutBlankMode: boolean;
  tabCloak: string;
  bookmarksVisible: boolean;
  bookmarks: Bookmark[];
  searchEngine: string;
  panicKey: string;
  panicUrl: string;
  erudaEnabled: boolean;
  engine: EngineName;
  tabPosition: TabPosition;
  ntClock: boolean;
  restoreTabs: boolean;
  historyEnabled: boolean;
  widgetQuickLinks: boolean;
  widgetNotes: boolean;
  widgetWeather: boolean;
  widgetDate: boolean;
  widgetTodo: boolean;
  widgetPomodoro: boolean;
  widgetBattery: boolean;
  wallpaperType: WallpaperType;
  accent: string;
  sidebarCollapsed: boolean;
}

export interface HistoryEntry {
  url: string;
  title: string;
  ts: number;
}

export interface Shortcut {
  label: string;
  url: string;
  icon?: string;
}

export interface TabView {
  id: number;
  title: string;
  url: string;
  favicon: string | null;
  loading: boolean;
  active: boolean;
  pinned: boolean;
}

export interface InternalTab {
  id: number;
  title: string;
  url: string;
  favicon: string | null;
  loading: boolean;
  iframe: HTMLIFrameElement;
  frame: ScramjetFrame | null;
  navCount: number;
  inPageNavCount: number;
  homeBackUrl: string | null;
  suspended: boolean;
  pinned: boolean;
}

declare global {
  interface Window {
    __bardoAbLaunched?: boolean;
    __bardoAbBlocked?: boolean;
  }
}
