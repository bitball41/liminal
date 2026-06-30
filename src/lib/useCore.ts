import { useCallback, useRef, useSyncExternalStore } from "react";
import { core, type Snapshot } from "./core";

type EqualityFn<T> = (previous: T, next: T) => boolean;

export function useBardoSelector<T>(
  selector: (snapshot: Snapshot) => T,
  isEqual: EqualityFn<T> = Object.is,
): T {
  const selectorRef = useRef(selector);
  const isEqualRef = useRef(isEqual);
  const cacheRef = useRef<{ snapshot: Snapshot; value: T } | undefined>(undefined);
  selectorRef.current = selector;
  isEqualRef.current = isEqual;

  const getSelection = useCallback(() => {
    const snapshot = core.getSnapshot();
    const cached = cacheRef.current;
    if (cached?.snapshot === snapshot) return cached.value;

    const next = selectorRef.current(snapshot);
    const value = cached && isEqualRef.current(cached.value, next) ? cached.value : next;
    cacheRef.current = { snapshot, value };
    return value;
  }, []);

  return useSyncExternalStore(core.subscribe, getSelection, getSelection);
}

export function shallowEqual<T extends Record<string, unknown>>(previous: T, next: T) {
  if (Object.is(previous, next)) return true;
  const previousKeys = Object.keys(previous);
  const nextKeys = Object.keys(next);
  if (previousKeys.length !== nextKeys.length) return false;
  return previousKeys.every((key) => Object.is(previous[key], next[key]));
}

export { core };
