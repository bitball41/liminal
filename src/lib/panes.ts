import type { IconName } from "@/components/icons";

export type PaneId =
  | "themes"
  | "appearance"
  | "widgets"
  | "toolbar"
  | "privacy"
  | "history"
  | "cloaker"
  | "bookmarks"
  | "search"
  | "panic"
  | "layout"
  | "advanced";

export interface PaneMeta {
  id: PaneId;
  label: string;
  icon: IconName;
  desc: string;
  /** Sections users can pin to the toolbar as popover buttons. */
  pinnable: boolean;
}

export const SIDEBAR_GROUPS: { group: string; items: PaneMeta[] }[] = [
  {
    group: "Appearance",
    items: [
      { id: "themes", label: "Themes", icon: "sun-medium", desc: "Pick or build a colour theme", pinnable: true },
      { id: "appearance", label: "Personalize", icon: "square-pen", desc: "Accent colour and wallpaper", pinnable: true },
      { id: "widgets", label: "Widgets", icon: "layout-grid", desc: "What shows on the new-tab page", pinnable: true },
      { id: "layout", label: "Layout", icon: "layout-panel-top", desc: "Tab bar position and sidebar", pinnable: true },
      { id: "toolbar", label: "Toolbar", icon: "grip", desc: "Arrange the toolbar buttons", pinnable: false },
    ],
  },
  {
    group: "Browsing",
    items: [
      { id: "search", label: "Search", icon: "search", desc: "Default search engine", pinnable: true },
      { id: "bookmarks", label: "Bookmarks", icon: "bookmark", desc: "Show or hide the bookmarks bar", pinnable: true },
      { id: "history", label: "History", icon: "history", desc: "Browsing history kept on this device", pinnable: true },
    ],
  },
  {
    group: "Privacy & Safety",
    items: [
      { id: "privacy", label: "Privacy", icon: "key-circle", desc: "Session restore and stealth launching", pinnable: true },
      { id: "cloaker", label: "Tab Cloaker", icon: "eye", desc: "Disguise the browser tab", pinnable: true },
      { id: "panic", label: "Panic Key", icon: "party-popper", desc: "Instantly bail to a safe page", pinnable: true },
    ],
  },
  {
    group: "System",
    items: [
      { id: "advanced", label: "Engine", icon: "file-cog", desc: "Engine, devtools and maintenance", pinnable: true },
    ],
  },
];

const ALL_PANES = SIDEBAR_GROUPS.flatMap((g) => g.items);

export const PANE_BY_ID = Object.fromEntries(ALL_PANES.map((p) => [p.id, p])) as Record<PaneId, PaneMeta>;

export const PINNABLE_PANES = ALL_PANES.filter((p) => p.pinnable);
