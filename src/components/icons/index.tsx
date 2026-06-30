import {
  useEffect,
  useRef,
  type CSSProperties,
  type ForwardRefExoticComponent,
  type RefAttributes,
} from "react";
import { cn } from "@/lib/utils";

import { ClockIcon } from "@/components/ui/animated/clock";
import { HistoryIcon } from "@/components/ui/animated/history";
import { AttachFileIcon } from "@/components/ui/animated/attach-file";
import { BadgeAlertIcon } from "@/components/ui/animated/badge-alert";
import { BatteryFullIcon } from "@/components/ui/animated/battery-full";
import { BatteryLowIcon } from "@/components/ui/animated/battery-low";
import { BatteryMediumIcon } from "@/components/ui/animated/battery-medium";
import { BatteryChargingIcon } from "@/components/ui/animated/battery-charging";
import { BatteryWarningIcon } from "@/components/ui/animated/battery-warning";
import { BookmarkIcon } from "@/components/ui/animated/bookmark";
import { CalendarDaysIcon } from "@/components/ui/animated/calendar-days";
import { KeyCircleIcon } from "@/components/ui/animated/key-circle";
import { CheckIcon } from "@/components/ui/animated/check";
import { ArrowLeftIcon } from "@/components/ui/animated/arrow-left";
import { ArrowRightIcon } from "@/components/ui/animated/arrow-right";
import { CloudLightningIcon } from "@/components/ui/animated/cloud-lightning";
import { CloudRainIcon } from "@/components/ui/animated/cloud-rain";
import { CloudSnowIcon } from "@/components/ui/animated/cloud-snow";
import { CloudSunIcon } from "@/components/ui/animated/cloud-sun";
import { SettingsIcon } from "@/components/ui/animated/settings";
import { CopyIcon } from "@/components/ui/animated/copy";
import { DeleteIcon } from "@/components/ui/animated/delete";
import { FileCogIcon } from "@/components/ui/animated/file-cog";
import { GripIcon } from "@/components/ui/animated/grip";
import { HourglassIcon } from "@/components/ui/animated/hourglass";
import { HomeIcon } from "@/components/ui/animated/home";
import { LayoutGridIcon } from "@/components/ui/animated/layout-grid";
import { LayoutPanelTopIcon } from "@/components/ui/animated/layout-panel-top";
import { LoaderCircleIcon } from "@/components/ui/animated/loader-circle";
import { Maximize2Icon } from "@/components/ui/animated/maximize-2";
import { PanelLeftCloseIcon } from "@/components/ui/animated/panel-left-close";
import { PanelLeftOpenIcon } from "@/components/ui/animated/panel-left-open";
import { PanelRightOpenIcon } from "@/components/ui/animated/panel-right-open";
import { PlusIcon } from "@/components/ui/animated/plus";
import { RefreshCCWIcon } from "@/components/ui/animated/refresh-ccw";
import { SearchIcon } from "@/components/ui/animated/search";
import { SquarePenIcon } from "@/components/ui/animated/square-pen";
import { SunMediumIcon } from "@/components/ui/animated/sun-medium";
import { TimerIcon } from "@/components/ui/animated/timer";
import { PartyPopperIcon } from "@/components/ui/animated/party-popper";
import { EyeIcon } from "@/components/ui/animated/eye";

export interface AnimatedIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

type AnimatedIcon = ForwardRefExoticComponent<
  { size?: number; className?: string } & RefAttributes<AnimatedIconHandle>
>;

const COMPONENTS = {
  clock: ClockIcon,
  history: HistoryIcon,
  "attach-file": AttachFileIcon,
  "badge-alert": BadgeAlertIcon,
  "battery-full": BatteryFullIcon,
  "battery-low": BatteryLowIcon,
  "battery-medium": BatteryMediumIcon,
  "battery-charging": BatteryChargingIcon,
  "battery-warning": BatteryWarningIcon,
  bookmark: BookmarkIcon,
  "calendar-days": CalendarDaysIcon,
  "key-circle": KeyCircleIcon,
  check: CheckIcon,
  "arrow-left": ArrowLeftIcon,
  "arrow-right": ArrowRightIcon,
  "cloud-lightning": CloudLightningIcon,
  "cloud-rain": CloudRainIcon,
  "cloud-snow": CloudSnowIcon,
  "cloud-sun": CloudSunIcon,
  settings: SettingsIcon,
  copy: CopyIcon,
  delete: DeleteIcon,
  "file-cog": FileCogIcon,
  grip: GripIcon,
  hourglass: HourglassIcon,
  home: HomeIcon,
  "layout-grid": LayoutGridIcon,
  "layout-panel-top": LayoutPanelTopIcon,
  "loader-circle": LoaderCircleIcon,
  "maximize-2": Maximize2Icon,
  "panel-left-close": PanelLeftCloseIcon,
  "panel-left-open": PanelLeftOpenIcon,
  "panel-right-open": PanelRightOpenIcon,
  plus: PlusIcon,
  "refresh-ccw": RefreshCCWIcon,
  search: SearchIcon,
  "square-pen": SquarePenIcon,
  "sun-medium": SunMediumIcon,
  timer: TimerIcon,
  "party-popper": PartyPopperIcon,
  eye: EyeIcon,
};

export type IconName = keyof typeof COMPONENTS;
export type IconAnim = "none" | "loader";

const REGISTRY = COMPONENTS as unknown as Record<IconName, AnimatedIcon>;

interface IconProps {
  name: IconName;
  size?: number;
  anim?: IconAnim;
  className?: string;
  style?: CSSProperties;
  "aria-label"?: string;
}

export function Icon({ name, anim, size = 16, className, style, ...rest }: IconProps) {
  const Glyph = REGISTRY[name];
  const handle = useRef<AnimatedIconHandle>(null);
  const host = useRef<HTMLSpanElement>(null);
  const ariaLabel = rest["aria-label"];

  useEffect(() => {
    const h = handle.current;
    if (!h || anim === "none") return;

    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    if (anim === "loader") {
      h.startAnimation();
      return;
    }

    const trigger = host.current?.closest("button, .widget-card, .ai-trigger") ?? host.current;
    if (!trigger) return;
    const start = () => h.startAnimation();
    const stop = () => h.stopAnimation();
    trigger.addEventListener("pointerenter", start);
    trigger.addEventListener("pointerleave", stop);
    trigger.addEventListener("focusin", start);
    trigger.addEventListener("focusout", stop);
    return () => {
      trigger.removeEventListener("pointerenter", start);
      trigger.removeEventListener("pointerleave", stop);
      trigger.removeEventListener("focusin", start);
      trigger.removeEventListener("focusout", stop);
    };
  }, [anim, name]);

  return (
    <span
      ref={host}
      className={cn("ai", `ai-${name}`, className)}
      style={style}
      aria-hidden={ariaLabel ? undefined : true}
      {...rest}
    >
      <Glyph ref={handle} size={size} className="ai-glyph" />
    </span>
  );
}
