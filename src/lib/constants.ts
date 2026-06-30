import type { Settings, ThemeName } from "./types";

export const PUBLIC_WISP_SERVERS = [
  "wss://wisp.mercurywork.shop/wisp/",
  "wss://anura.pro/wisp/",
  "wss://nebulaservices.org/wisp/",
  "wss://wisp.terbiumon.top/wisp/",
];

export const SVC_PREFIX = "/scramjet/service/";
export const SVC_PREFIX_V2 = "/scramjet2/service/";
export const SVC_PREFIX_KLYSTRON = "/klystron/";

export const BARDO_FAVICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'>` +
      `<path d='M8 34 L8 19 Q8 6 20 6 Q32 6 32 19 L32 34' stroke='white' stroke-width='2.5' fill='none' stroke-linecap='round'/>` +
      `<line x1='4' y1='34' x2='36' y2='34' stroke='white' stroke-width='2.5' stroke-linecap='round'/></svg>`,
  );

export const SEARCH_ENGINES: Record<string, (q: string) => string> = {
  duckduckgo: (q) => "https://duckduckgo.com/?q=" + encodeURIComponent(q),
  google: (q) => "https://www.google.com/search?q=" + encodeURIComponent(q),
  bing: (q) => "https://www.bing.com/search?q=" + encodeURIComponent(q),
  brave: (q) => "https://search.brave.com/search?q=" + encodeURIComponent(q),
  startpage: (q) => "https://www.startpage.com/search?q=" + encodeURIComponent(q),
};

export function gFav(domain: string) {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
}

export interface Cloak {
  title: string;
  favicon: string | null;
}

export const TAB_CLOAKS: Record<string, Cloak> = {
  none: { title: "Bardo", favicon: null },
  canvas: { title: "Dashboard - Canvas", favicon: gFav("instructure.com") },
  gdrive: { title: "My Drive - Google Drive", favicon: gFav("drive.google.com") },
  canva: { title: "Home - Canva", favicon: gFav("canva.com") },
  classlink: { title: "ClassLink Launchpad", favicon: gFav("launchpad.classlink.com") },
  blooket: { title: "Blooket", favicon: gFav("blooket.com") },
  classroom: { title: "Google Classroom", favicon: gFav("classroom.google.com") },
  docs: { title: "Untitled document - Google Docs", favicon: gFav("docs.google.com") },
};

export interface ThemeDef {
  id: ThemeName;
  label: string;
  mode: "dark" | "light";
  group: "neutral" | "color";
  surface: string;
  text: string;
  accent: string;
  border: string;
}

export const THEMES: ThemeDef[] = [
  { id: "dark", label: "Dark", mode: "dark", group: "neutral", surface: "#111", text: "#fff", accent: "#4466ff", border: "#333" },
  { id: "slate", label: "Slate", mode: "dark", group: "neutral", surface: "#232328", text: "#d4d4d8", accent: "#4a9eff", border: "#34343c" },
  { id: "graphite", label: "Graphite", mode: "dark", group: "neutral", surface: "#1e1e1e", text: "#e0e0e0", accent: "#9aa0a6", border: "#333" },
  { id: "macchiato", label: "Macchiato", mode: "dark", group: "neutral", surface: "#24273a", text: "#cad3f5", accent: "#c6a0f6", border: "#363a4f" },
  { id: "mocha", label: "Mocha", mode: "dark", group: "neutral", surface: "#1e1e2e", text: "#cdd6f4", accent: "#cba6f7", border: "#313244" },
  { id: "space", label: "Deep Space", mode: "dark", group: "color", surface: "#0e0050", text: "#e8e0ff", accent: "#7c5fe6", border: "#2c0090" },
  { id: "midnight", label: "Midnight", mode: "dark", group: "color", surface: "#0d1525", text: "#c8d8f8", accent: "#4488ff", border: "#1e2d4e" },
  { id: "aurora", label: "Aurora", mode: "dark", group: "color", surface: "#10101e", text: "#e8e0ff", accent: "#8855ff", border: "#252545" },
  { id: "forest", label: "Forest", mode: "dark", group: "color", surface: "#061209", text: "#c8f0d4", accent: "#30c55a", border: "#0e2814" },
  { id: "crimson", label: "Crimson", mode: "dark", group: "color", surface: "#140404", text: "#f5d8d8", accent: "#e03838", border: "#2d0808" },
  { id: "ember", label: "Ember", mode: "dark", group: "color", surface: "#140800", text: "#f5e8d0", accent: "#e07820", border: "#2d1500" },
  { id: "rose", label: "Rose", mode: "dark", group: "color", surface: "#140410", text: "#f5d8ee", accent: "#e03880", border: "#2d0824" },
  { id: "light", label: "Light", mode: "light", group: "neutral", surface: "#fff", text: "#111", accent: "#4455ee", border: "#c0c0ce" },
  { id: "latte", label: "Latte", mode: "light", group: "neutral", surface: "#dce0e8", text: "#4c4f69", accent: "#8839ef", border: "#bcc0cc" },
  { id: "cappuccino", label: "Cappuccino", mode: "light", group: "neutral", surface: "#e3d9c8", text: "#3b2f25", accent: "#a9744f", border: "#c9bba6" },
  { id: "stone", label: "Stone", mode: "light", group: "neutral", surface: "#e2e2de", text: "#33332f", accent: "#5b6472", border: "#c2c2bc" },
  { id: "fog", label: "Fog", mode: "light", group: "neutral", surface: "#e4e6ea", text: "#2b2d31", accent: "#1f6feb", border: "#c8cbd1" },
  { id: "nebula", label: "Nebula", mode: "light", group: "color", surface: "#fbf9ff", text: "#1a1330", accent: "#6d4fd6", border: "#d9cdf0" },
  { id: "daylight", label: "Daylight", mode: "light", group: "color", surface: "#fbfdff", text: "#0f1b2e", accent: "#2f7ae0", border: "#c8d8ee" },
  { id: "dawn", label: "Dawn", mode: "light", group: "color", surface: "#fdfbff", text: "#1c1430", accent: "#7a3fe0", border: "#dcd0f2" },
  { id: "meadow", label: "Meadow", mode: "light", group: "color", surface: "#fbfffc", text: "#0d2014", accent: "#1ea34a", border: "#cae6d3" },
  { id: "blush", label: "Blush", mode: "light", group: "color", surface: "#fffbfb", text: "#2e1212", accent: "#d12d2d", border: "#eed0d0" },
  { id: "sand", label: "Sand", mode: "light", group: "color", surface: "#fffdfb", text: "#2e1f0d", accent: "#c25e10", border: "#eedfca" },
  { id: "petal", label: "Petal", mode: "light", group: "color", surface: "#fffbfd", text: "#2e1224", accent: "#d12d72", border: "#eed0e2" },
];

export const DARK_THEMES = THEMES.filter((t) => t.mode === "dark");
export const LIGHT_THEMES = THEMES.filter((t) => t.mode === "light");

export const THEME_COLUMNS = [
  { mode: "dark" as const, head: "Dark", themes: DARK_THEMES },
  { mode: "light" as const, head: "Light", themes: LIGHT_THEMES },
];

const RECOMMENDED_IDS: ThemeName[] = ["dark", "slate", "macchiato", "space", "aurora", "rose"];
export const RECOMMENDED_THEMES = RECOMMENDED_IDS.map((id) => THEMES.find((t) => t.id === id)!);

export const ACCENTS = [
  { value: "#4466ff", title: "Blue" },
  { value: "#7c5fe6", title: "Violet" },
  { value: "#e03880", title: "Pink" },
  { value: "#e03838", title: "Red" },
  { value: "#e07820", title: "Orange" },
  { value: "#30c55a", title: "Green" },
  { value: "#22b8c8", title: "Cyan" },
];

export const DEFAULT_SETTINGS: Settings = {
  theme: "dark",
  aboutBlankMode: false,
  tabCloak: "none",
  bookmarksVisible: false,
  bookmarks: [],
  searchEngine: "duckduckgo",
  panicKey: "",
  panicUrl: "https://classroom.google.com",
  erudaEnabled: false,
  engine: "scramjet",
  tabPosition: "top",
  ntClock: true,
  restoreTabs: true,
  historyEnabled: true,
  widgetQuickLinks: true,
  widgetNotes: false,
  widgetWeather: false,
  widgetDate: false,
  widgetTodo: false,
  widgetPomodoro: false,
  widgetBattery: false,
  wallpaperType: "none",
  accent: "",
  sidebarCollapsed: false,
};

export const SETTINGS_KEY = "bardo-settings";
export const SESSION_KEY = "bardo-session";
export const HISTORY_KEY = "bardo-history";
export const NOTES_KEY = "bardo-notes";
export const TODOS_KEY = "bardo-todos";
export const WALLPAPER_KEY = "bardo-wallpaper";
export const WEATHER_KEY = "bardo-weather";
export const SHORTCUTS_KEY = "bardo-shortcuts";
export const HISTORY_MAX = 200;

export function wmo(code: number): { icon: WeatherIcon; text: string } {
  if (code === 0) return { icon: "cloud-sun", text: "Clear" };
  if (code <= 2) return { icon: "cloud-sun", text: "Partly cloudy" };
  if (code === 3) return { icon: "cloud-sun", text: "Overcast" };
  if (code <= 48) return { icon: "cloud-sun", text: "Fog" };
  if (code <= 57) return { icon: "cloud-rain", text: "Drizzle" };
  if (code <= 67) return { icon: "cloud-rain", text: "Rain" };
  if (code <= 77) return { icon: "cloud-snow", text: "Snow" };
  if (code <= 82) return { icon: "cloud-rain", text: "Showers" };
  if (code <= 86) return { icon: "cloud-snow", text: "Snow showers" };
  if (code <= 99) return { icon: "cloud-lightning", text: "Thunderstorm" };
  return { icon: "cloud-sun", text: "" };
}

export type WeatherIcon =
  | "cloud-sun"
  | "cloud-rain"
  | "cloud-snow"
  | "cloud-lightning";
