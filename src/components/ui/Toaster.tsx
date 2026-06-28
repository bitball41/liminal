import { Icon, type IconName } from "@/components/icons";
import { toast, useToasts, type ToastKind } from "@/lib/toast";

const ICON: Record<ToastKind, IconName> = {
  success: "check",
  error: "badge-alert",
  info: "badge-alert",
};

export function Toaster() {
  const toasts = useToasts();
  if (toasts.length === 0) return null;

  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          <span className="toast-icon">
            <Icon name={ICON[t.kind]} size={15} anim="none" />
          </span>
          <span className="toast-msg">{t.message}</span>
          {t.action && (
            <button
              className="toast-action"
              onClick={() => {
                t.action!.onClick();
                toast.dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
          <button className="toast-close" title="Dismiss" onClick={() => toast.dismiss(t.id)}>
            <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <line x1="3" y1="3" x2="11" y2="11" />
              <line x1="11" y1="3" x2="3" y2="11" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
