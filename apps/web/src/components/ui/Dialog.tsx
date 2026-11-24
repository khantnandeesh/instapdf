"use client";
import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";
import { cx } from "./cx";
import "./dialog.css";
import { IconButton } from "./IconButton";
import { CloseIcon } from "./icons";

export type DialogCloseReason = "escape" | "action";

/**
 * Modal dialog on the native <dialog> element: top layer, inert background and
 * a focus trap from the browser. Escape goes through `onClose("escape")`.
 * Backdrop clicks do nothing in the default modal (prevents an accidental skip); the
 * "viewer" variant leaves the backdrop to its content, which closes on a tap there.
 *
 * Chrome follows docs/design/berrypdf.md "Modals": no decoration, a small title row
 * (title, optional close), content, then content-width buttons at the end of the row.
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
  className?: string;
  wide?: boolean;
  /**
   * "fullscreen" (spec F2 H-5): covers the viewport, renders `children` as is
   * under a visually hidden title, and focuses that title unless
   * `initialFocusRef` is set (no on-screen keyboard popping up on open).
   */
  /** "sheet" (spec F3 M-4): anchored to the bottom, full width, max height --ip-sheet-max-h; body scrolls, header and footer stay. */
  /**
   * "viewer": the big page view. Covers the viewport on a dark scrim with no surface of its own;
   * renders `children` as is under a visually hidden title (focused on open, like "fullscreen").
   */
  variant?: "default" | "fullscreen" | "sheet" | "viewer";
  /** Default modal and sheet: a small close button in the title row. */
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
      const target = initialFocusRef?.current ?? (variant === "fullscreen" || variant === "viewer" ? titleRef.current : null);
      if (target) requestAnimationFrame(() => target.focus());
      // The browser focuses the first control, which would be the close button in the title row; start on the
      // content instead (the close button stays one Shift+Tab away, and Escape closes).
      else if (variant === "default" && onCloseButton) {
        const first = Array.from(dialog.querySelectorAll<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")).find(
          (el) => !el.hasAttribute("data-dialog-close") && !(el as HTMLButtonElement).disabled && el.getClientRects().length > 0,
        );
        first?.focus();
      }
    } else if (!open && dialog.open) {
      dialog.close();
      const back = returnFocusRef?.current ?? opener.current;
      // <body> means nothing had focus when the dialog opened (e.g. the picker that started
      // the intake had already unmounted), so use the fallback instead of dropping focus.
      const el = back && back !== document.body && back.isConnected && !back.closest("[inert]") ? back : fallbackFocus?.();
      el?.focus();
    }
  }, [open, initialFocusRef, returnFocusRef, fallbackFocus, variant]); // eslint-disable-line react-hooks/exhaustive-deps -- onCloseButton: only whether it is set

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
      aria-modal={variant === "fullscreen" || variant === "viewer" ? true : undefined}
      aria-describedby={description ? descId : undefined}
      // One scroller per layer (docs/design/berrypdf.md "Scrolling"): the full-screen dialog scrolls itself;
      // the sheet and the modal scroll their inner body, so the <dialog> element never does.
      data-ip-scroll={variant === "fullscreen" ? "overlay" : undefined}
      className={cx(
        variant === "fullscreen"
          ? "mp-modal-in m-0 h-dvh max-h-none w-screen max-w-none overflow-y-auto overscroll-contain border-0 bg-surface-raised p-0 text-ink backdrop:bg-transparent"
          : variant === "viewer"
            ? "mp-viewer m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden border-0 bg-transparent p-0"
            : variant === "sheet"
            ? // BerryPDF bottom sheet: white, 24px top corners, the modal's blurred berry backdrop; rises in (0.3s overshoot).
              "mp-sheet mx-0 mt-auto mb-0 max-h-(--ip-sheet-max-h) w-screen max-w-none border-0 p-0"
            : cx(
              // BerryPDF Modal: 380px, 24px corners with a 40px leaf corner, plain white (no wave, no badge),
              // one deep soft shadow on a blurred berry-tinted backdrop; rises 14px and pops in (0.3s overshoot).
              "mp-modal m-auto max-h-[calc(100dvh-32px)] p-0",
              wide ? "w-[min(880px,calc(100vw-32px))]" : "w-[min(380px,calc(100vw-32px))]",
            ),
        className,
      )}
    >
      {open && (variant === "fullscreen" || variant === "viewer") && (
        <>
          <h2 id={titleId} ref={titleRef} tabIndex={-1} className="sr-only">
            {title}
          </h2>
          {children}
        </>
      )}
      {open && variant === "sheet" && (
        <div className="flex max-h-(--ip-sheet-max-h) flex-col">
          <div className="flex shrink-0 flex-col items-stretch border-b-[1.5px] border-sand px-4 py-2.5">
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
        <div className="flex max-h-[calc(100dvh-32px)] flex-col gap-4 overflow-y-auto overscroll-contain px-6 pt-5 pb-5" data-ip-scroll="overlay">
          <div className="min-w-0" data-dialog-head>
            <div className="flex items-start justify-between gap-3">
              <h2 id={titleId} className="mp-modal__title min-w-0 break-words">
                {title}
              </h2>
              {onCloseButton && <IconButton label="Close" size="sm" icon={<CloseIcon size={18} />} tooltip={false} className="-me-2 -mt-1" data-dialog-close onClick={onCloseButton} />}
            </div>
            {description && (
              <div id={descId} className="mt-1.5 text-[15px] leading-[1.45] text-muted" data-dialog-desc>
                {description}
              </div>
            )}
          </div>
          {children}
          {/* Content-width buttons at the end of the row, the quiet one first and the filled one last (DOM order = Tab
              order). They wrap when the row is too narrow, so a phone never scrolls sideways. */}
          {footer && (
            <div className="flex flex-wrap items-center justify-end gap-2" data-testid="dialog-footer">
              {footer}
            </div>
          )}
        </div>
      )}
    </dialog>
  );
}
