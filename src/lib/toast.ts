import { useSyncExternalStore } from "react";

export type ToastKind = "success" | "error" | "info";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  action?: ToastAction;
}

interface ToastOptions {
  /** Milliseconds before auto-dismiss. 0 keeps it until dismissed. */
  duration?: number;
  action?: ToastAction;
}

const DEFAULT_DURATION = 3200;
const MAX_TOASTS = 4;

class ToastStore {
  private toasts: Toast[] = [];
  private timers = new Map<number, ReturnType<typeof setTimeout>>();
  private nextId = 1;
  private listeners = new Set<() => void>();

  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };
  getSnapshot = () => this.toasts;

  private emit() {
    this.toasts = [...this.toasts];
    for (const cb of this.listeners) cb();
  }

  private push(kind: ToastKind, message: string, opts: ToastOptions = {}) {
    const id = this.nextId++;
    const toast: Toast = { id, kind, message, action: opts.action };
    this.toasts.push(toast);
    // Cap the stack so a burst of actions can't bury the screen.
    while (this.toasts.length > MAX_TOASTS) {
      const dropped = this.toasts.shift();
      if (dropped) this.clearTimer(dropped.id);
    }
    const duration = opts.duration ?? (opts.action ? 5200 : DEFAULT_DURATION);
    if (duration > 0) {
      this.timers.set(
        id,
        setTimeout(() => this.dismiss(id), duration),
      );
    }
    this.emit();
    return id;
  }

  private clearTimer(id: number) {
    const t = this.timers.get(id);
    if (t) {
      clearTimeout(t);
      this.timers.delete(id);
    }
  }

  dismiss = (id: number) => {
    this.clearTimer(id);
    const next = this.toasts.filter((t) => t.id !== id);
    if (next.length === this.toasts.length) return;
    this.toasts = next;
    this.emit();
  };

  success = (message: string, opts?: ToastOptions) => this.push("success", message, opts);
  error = (message: string, opts?: ToastOptions) => this.push("error", message, opts);
  info = (message: string, opts?: ToastOptions) => this.push("info", message, opts);
}

export const toast = new ToastStore();

export function useToasts(): Toast[] {
  return useSyncExternalStore(toast.subscribe, toast.getSnapshot, toast.getSnapshot);
}
