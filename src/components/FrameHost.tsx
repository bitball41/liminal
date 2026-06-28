import { useEffect, useRef } from "react";
import { core } from "@/lib/useCore";

/**
 * Mount node for the proxy iframes. BardoCore creates and owns the <iframe>
 * elements imperatively (so Scramjet's per-tab frames survive React re-renders)
 * and appends them here. The iframes are position:fixed via .nav-frame, so they
 * overlay the chrome regardless of where they sit in the DOM.
 */
export function FrameHost() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) core.mount(ref.current);
  }, []);
  return <div ref={ref} aria-hidden />;
}
