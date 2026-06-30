import { useEffect, useRef } from "react";
import { core } from "@/lib/useCore";

export function FrameHost() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) core.mount(ref.current);
  }, []);
  return <div ref={ref} aria-hidden />;
}
