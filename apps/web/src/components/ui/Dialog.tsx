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
  variant = "default",
  onCloseButton,
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
  /**
   * "fullscreen" (spec F2 H-5): covers the viewport, renders `children` as is
   * under a visually hidden title, and focuses that title unless
   * `initialFocusRef` is set (no on-screen keyboard popping up on open).
   */
  /** "sheet" (spec F3 M-4): anchored to the bottom, full width, max height --ip-sheet-max-h; body scrolls, header and footer stay. */
  variant?: "default" | "fullscreen" | "sheet";
  /** Sheet only: a close button in the header. */
  onCloseButton?: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const descId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      opener.current = document.activeElement as HTMLElement | null;
      dialog.showModal();
      const target = initialFocusRef?.current ?? (variant === "fullscreen" ? titleRef.current : null);
      if (target) requestAnimationFrame(() => target.focus());
    } else if (!open && dialog.open) {
      dialog.close();
      const back = returnFocusRef?.current ?? opener.current;
      // <body> means nothing had focus when the dialog opened (e.g. the picker that started
      // the intake had already unmounted), so use the fallback instead of dropping focus.
      const el = back && back !== document.body && back.isConnected && !back.closest("[inert]") ? back : fallbackFocus?.();
      el?.focus();
    }
  }, [open, initialFocusRef, returnFocusRef, fallbackFocus, variant]);

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

  /** Wrap guard (spec U-7): Tab from the last control goes to the first, Shift+Tab the reverse, instead of leaving for the browser UI. */
  function wrapTab(e: React.KeyboardEvent<HTMLDialogElement>) {
    if (e.key !== "Tab" || !ref.current) return;
    const items = Array.from(
      ref.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
    ).filter((el) => !(el as HTMLButtonElement).disabled && el.tabIndex >= 0 && el.getClientRects().length > 0);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    } else if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    }
  }

  return (
    <dialog
      ref={ref}
      onKeyDown={wrapTab}
      aria-labelledby={titleId}
      aria-modal={variant === "fullscreen" ? true : undefined}
      aria-describedby={description ? descId : undefined}
      className={cx(
        variant === "fullscreen"
          ? "ip-rise-in m-0 h-dvh max-h-none w-screen max-w-none overflow-y-auto overscroll-contain border-0 bg-bg p-0 text-fg backdrop:bg-transparent"
          : variant === "sheet"
            ? "ip-rise-in mx-0 mt-auto mb-0 max-h-(--ip-sheet-max-h) w-screen max-w-none rounded-t-xl border-0 bg-surface-raised p-0 text-fg shadow-lg backdrop:bg-scrim"
            : cx(
              "m-auto max-h-[calc(100dvh-32px)] rounded-xl bg-surface-raised p-0 text-fg shadow-lg backdrop:bg-scrim",
              wide ? "w-[min(880px,calc(100vw-32px))]" : "w-[min(440px,calc(100vw-32px))]",
            ),
        className,
      )}
    >
      {open && variant === "fullscreen" && (
        <>
          <h2 id={titleId} ref={titleRef} tabIndex={-1} className="sr-only">
            {title}
          </h2>
          {children}
        </>
      )}
      {open && variant === "sheet" && (
        <div className="flex max-h-(--ip-sheet-max-h) flex-col">
          <div className="flex shrink-0 flex-col items-stretch border-b border-border px-4 pt-2 pb-2">
            <span aria-hidden="true" className="mx-auto mb-2 h-1 w-9 rounded-full bg-border-strong" />
            <div className="flex items-center justify-between gap-3">
              <h2 id={titleId} className="text-lg font-semibold">
                {title}
              </h2>
              {onCloseButton && (
                <button
                  type="button"
                  aria-label="Close"
                  onClick={onCloseButton}
                  className="relative grid size-11 place-items-center rounded-md text-fg hover:bg-surface-sunken"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round">
                    <path d="M6 6l12 12M18 6 6 18" />
                  </svg>
                </button>
              )}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">{children}</div>
          {footer && <div className="flex shrink-0 flex-wrap gap-2 border-t border-border px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))]">{footer}</div>}
        </div>
      )}
      {open && variant === "default" && (
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
