"use client";
import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";
import { cx } from "./cx";
import { IconButton } from "./IconButton";
import { CloseIcon } from "./icons";

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
      // One scroller per layer (docs/design/berrypdf.md "Scrolling"): the full-screen dialog scrolls itself;
      // the sheet and the modal scroll their inner body, so the <dialog> element never does.
      data-ip-scroll={variant === "fullscreen" ? "overlay" : undefined}
      className={cx(
        variant === "fullscreen"
          ? "mp-modal-in m-0 h-dvh max-h-none w-screen max-w-none overflow-y-auto overscroll-contain border-0 bg-surface-raised p-0 text-ink backdrop:bg-transparent"
          : variant === "sheet"
            ? // BerryPDF bottom sheet: white, 24px top corners, the modal's blurred berry backdrop; rises in (0.3s overshoot).
              "mp-sheet mx-0 mt-auto mb-0 max-h-(--ip-sheet-max-h) w-screen max-w-none border-0 p-0"
            : cx(
              // BerryPDF Modal: 380px, 24px corners with a 40px leaf corner, a pale-pink wave across the top,
              // one deep soft shadow on a blurred berry-tinted backdrop; rises 14px and pops in (0.3s overshoot).
              "mp-modal m-auto max-h-[calc(100dvh-32px)] p-0",
              wide ? "w-[min(880px,calc(100vw-32px))]" : "w-[min(380px,calc(100vw-32px))]",
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
          <div className="flex shrink-0 flex-col items-stretch border-b-[1.5px] border-sand px-4 pt-2 pb-2">
            <span aria-hidden="true" className="mx-auto mb-2 h-1.5 w-10 rounded-pill bg-sand" />
            <div className="flex items-center justify-between gap-3">
              <h2 id={titleId} className="text-tile-title text-ink-black">
                {title}
              </h2>
              {onCloseButton && <IconButton label="Close" icon={<CloseIcon size={18} />} variant="soft" tooltip={false} onClick={onCloseButton} />}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4" data-ip-scroll="overlay">
            {children}
          </div>
          {footer && <div className="flex shrink-0 flex-wrap gap-2 border-t-[1.5px] border-sand px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))]">{footer}</div>}
        </div>
      )}
      {open && variant === "default" && (
        // The modal's one scroll region (only used when it is taller than the screen). A dialog with a long list
        // (the page picker) caps the list instead, so this never scrolls around a second scroller.
        <div className="flex max-h-[calc(100dvh-32px)] flex-col gap-5 overflow-y-auto overscroll-contain px-7 pt-[34px] pb-[26px]" data-ip-scroll="overlay">
          <div className="min-w-0 text-center">
            {/* One icon says what the dialog is about: berry duotone in a white circle with a pink ring, on the wave. */}
            {icon && <span className="mp-modal__icon">{icon}</span>}
            <h2 id={titleId} className="text-card-heading break-words text-ink-black">
              {title}
            </h2>
            {description && (
              <div id={descId} className="mt-2 leading-[1.45] text-muted">
                {description}
              </div>
            )}
          </div>
          {children}
          {/* BerryPDF: equal-width buttons, the quiet one on the left and the filled one on the right (DOM order = Tab order).
              Below 640px they stack full width (filled one last), so three buttons never overflow a phone. */}
          {footer && <div className="grid grid-cols-1 gap-3 sm:auto-cols-fr sm:grid-flow-col sm:grid-cols-none [&>*]:px-2.5" data-testid="dialog-footer">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
