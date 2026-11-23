"use client";
import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";
import { cx } from "./cx";

export type DialogCloseReason = "escape" | "action";

/**
 * Modal dialog on the native <dialog> element: top layer, inert background and
 * a focus trap from the browser. Escape goes through `onClose("escape")`.
 * Backdrop clicks do nothing (prevents an accidental skip).
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  initialFocusRef,
  returnFocusRef,
  fallbackFocus,
  icon,
  className,
  wide,
}: {
  open: boolean;
  onClose: (reason: DialogCloseReason) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  initialFocusRef?: RefObject<HTMLElement | null>;
  returnFocusRef?: RefObject<HTMLElement | null>;
  /** Focus target when the element that opened the dialog is gone. */
  fallbackFocus?: () => HTMLElement | null;
  icon?: ReactNode;
  className?: string;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      opener.current = document.activeElement as HTMLElement | null;
      dialog.showModal();
      const target = initialFocusRef?.current;
      if (target) requestAnimationFrame(() => target.focus());
    } else if (!open && dialog.open) {
      dialog.close();
      const back = returnFocusRef?.current ?? opener.current;
      const el = back && back.isConnected && !back.closest("[inert]") ? back : fallbackFocus?.();
      el?.focus();
    }
  }, [open, initialFocusRef, returnFocusRef, fallbackFocus]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const onCancel = (e: Event) => {
      e.preventDefault();
      onCloseRef.current("escape");
    };
    dialog.addEventListener("cancel", onCancel);
    return () => dialog.removeEventListener("cancel", onCancel);
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      className={cx(
        "m-auto max-h-[calc(100dvh-32px)] rounded-xl bg-surface-raised p-0 text-fg shadow-lg backdrop:bg-scrim",
        wide ? "w-[min(880px,calc(100vw-32px))]" : "w-[min(440px,calc(100vw-32px))]",
        className,
      )}
    >
      {open && (
        <div className="flex flex-col gap-4 p-6 max-sm:p-5">
          <div className="flex min-w-0 items-start gap-3">
            {icon && <span className="mt-0.5 shrink-0 text-fg-muted">{icon}</span>}
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="text-lg font-semibold break-words">
                {title}
              </h2>
              {description && (
                <div id={descId} className="mt-1 text-sm text-fg-muted">
                  {description}
                </div>
              )}
            </div>
          </div>
          {children}
          {footer && <div className="flex flex-col-reverse gap-2 min-[400px]:flex-row min-[400px]:justify-end">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
