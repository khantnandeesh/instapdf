"use client";
import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { exit, motionReady, settle } from "@/lib/motion";
import { cx } from "./cx";
// Styles: ./dialog.css (modal and sheet) is imported by the screens that open them (ToolFlow, ControlDock, the
// editor), so it stays off pages whose only dialog is the full-screen menu.
import { IconButton } from "./IconButton";
import { CloseIcon } from "./icons";

export type DialogCloseReason = "escape" | "action";

/**
 * Modal dialog on the native <dialog> element: top layer, inert background and
 * a focus trap from the browser. Escape goes through `onClose("escape")`.
 * Backdrop clicks do nothing in the default modal (prevents an accidental skip); the page
 * viewer (fullscreen, PagePreviewDialog) closes on a tap on its own backdrop.
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
  variant?: "default" | "fullscreen" | "sheet";
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
  // The content stays while the dialog leaves (motion.md S7, S11, S13).
  const [shown, setShown] = useState(open);
  if (open && !shown) setShown(true);
  const body = open || shown;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    // What fades on close: the panel; for the full-screen variant only its content, so its opaque
    // ground never shows the page through it (S7).
    const parts = () => (variant === "fullscreen" ? (Array.from(dialog.children).filter((c) => c.tagName !== "H2") as HTMLElement[]) : [dialog]);
    if (open && !dialog.open) {
      dialog.removeAttribute("data-leaving");
      parts().forEach(settle);
      opener.current = document.activeElement as HTMLElement | null;
      dialog.showModal();
      const target = initialFocusRef?.current ?? (variant === "fullscreen" ? titleRef.current : null);
      if (target) requestAnimationFrame(() => target.focus());
    } else if (!open && dialog.open) {
      // Closed at once (focus returns now, the page is usable now); globals.css keeps a leaving dialog
      // painted in the top layer while lib/motion fades it, then it is gone. No engine yet: instant.
      const leaving = motionReady();
      if (leaving) dialog.setAttribute("data-leaving", "");
      dialog.close();
      void Promise.all(leaving ? parts().map((el) => exit(el, variant === "default" ? "dialog" : variant === "sheet" ? "sheet" : "overlay")) : []).then(() => {
        if (dialog.open) return; // reopened meanwhile
        dialog.removeAttribute("data-leaving");
        settle(dialog);
        setShown(false);
      });
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
              // BerryPDF Modal: 380px, 24px corners with a 40px leaf corner, plain white (no wave, no badge),
              // one deep soft shadow on a blurred berry-tinted backdrop; rises 14px and pops in (0.3s overshoot).
              "mp-modal m-auto max-h-[calc(100dvh-32px)] p-0",
              wide ? "w-[min(880px,calc(100vw-32px))]" : "w-[min(380px,calc(100vw-32px))]",
            ),
        className,
      )}
    >
      {body && variant === "fullscreen" && (
        <>
          <h2 id={titleId} ref={titleRef} tabIndex={-1} className="sr-only">
            {title}
          </h2>
          {children}
        </>
      )}
      {body && variant === "sheet" && (
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
      {body && variant === "default" && (
        // The modal's one scroll region (only used when it is taller than the screen). A dialog with a long list
        // (the page picker) caps the list instead, so this never scrolls around a second scroller.
        <div className="flex max-h-[calc(100dvh-32px)] flex-col gap-4 overflow-y-auto overscroll-contain px-6 pt-5 pb-5" data-ip-scroll="overlay">
          <div className={onCloseButton && "pe-9"}>
            <h2 id={titleId} className="mp-modal__title break-words">
              {title}
            </h2>
            {description && (
              <div id={descId} className="mt-1.5 text-[15px] leading-[1.45] text-muted">
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
          {/* Last in the DOM, so the dialog opens on its content (the browser focuses the first control); drawn in
              the title row's corner. */}
          {onCloseButton && <IconButton label="Close" size="sm" icon={<CloseIcon size={18} />} tooltip={false} className="absolute top-3.5 right-3.5" onClick={onCloseButton} />}
        </div>
      )}
    </dialog>
  );
}
