"use client";
import { useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";

/**
 * A non-modal popover under its trigger, right-aligned to it (F25 §3.3, More options from 1024px):
 * white, panel corners, the menu shadow. Its body is the only scroller in it (`data-ip-scroll="overlay"`),
 * capped to the screen under the row. Focus goes to its first control; Escape, a click outside or the
 * trigger again close it, and focus returns to the trigger. The trigger's wrapper must be `relative`.
 * When right-aligning would push it past a screen edge (a trigger near the row's left), it slides
 * back inside with an 8px margin, measured before paint so it never jumps.
 */
export function Popover({
  open,
  onClose,
  trigger,
  label,
  testId,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  trigger: RefObject<HTMLElement | null>;
  label: string;
  testId?: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useLayoutEffect(() => {
    const el = box.current;
    if (!open || !el) return;
    const fit = () => {
      el.style.translate = "";
      const r = el.getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      // Right-aligned to the trigger; a trigger near the row's left would push it off screen, so there it
      // is left-aligned to the trigger instead (eval G-7: always under its button), then kept 8px inside.
      const t = trigger.current?.getBoundingClientRect();
      let dx = r.left < 8 && t ? t.left - r.left : 0;
      if (r.right + dx > vw - 8) dx = vw - 8 - r.right;
      if (r.left + dx < 8) dx = 8 - r.left;
      if (dx) el.style.translate = `${Math.round(dx)}px 0`;
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [open, trigger]);
  useEffect(() => {
    if (!open) return;
    const el = box.current;
    // The first control that is shown: a form can hide some at this width (Merge's Contents page sits in the row from 1280).
    const first = Array.from(
      el?.querySelectorAll<HTMLElement>("input:not([disabled]), select:not([disabled]), textarea, button:not([disabled]), [tabindex]:not([tabindex='-1'])") ?? [],
    ).find((c) => c.getClientRects().length > 0);
    first?.focus();
    const shut = (refocus: boolean) => {
      close.current();
      if (refocus) trigger.current?.focus();
    };
    const onKey = (e: KeyboardEvent) => {
      // A control inside that handles Escape itself (a rename field) prevents the default: leave it open.
      // (React's own listener is on the document too, so its stopPropagation can't stop this one.)
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      shut(true);
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (el?.contains(t) || trigger.current?.contains(t)) return;
      shut(false);
      // Focus returns to the trigger (§3.3, eval G-7), unless the click went to another control, which
      // keeps its focus (a click on the page, a heading or <body> gives it back to the trigger).
      setTimeout(() => {
        const a = document.activeElement;
        if (!a?.isConnected || !a.matches("a[href], button, input, select, textarea, [contenteditable], [role=button], [role=menuitem], [role=tab]"))
          trigger.current?.focus({ preventScroll: true });
      }, 0);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [open, trigger]);
  if (!open) return null;
  return (
    <div ref={box} role="dialog" aria-modal="false" aria-label={label} className="ip-popover" data-testid={testId}>
      <div className="ip-popover__body" data-ip-scroll="overlay">
        {children}
      </div>
      {footer && <div className="ip-popover__foot">{footer}</div>}
    </div>
  );
}
