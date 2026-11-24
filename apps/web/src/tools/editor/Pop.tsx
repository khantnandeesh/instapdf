"use client";
/**
 * Anchored popover (U-E12 `Popover`): native `popover="auto"` (top layer, light dismiss), opens
 * below its trigger or above when there is no room, clamped to the viewport. Escape closes and
 * returns focus to the trigger.
 */
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cx } from "@/components/ui/cx";

export function Pop({
  label,
  trigger,
  children,
  className,
  panelClassName,
  title,
  disabled,
  pressed,
  testId,
  onOpen,
}: {
  label: string;
  trigger: ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  className?: string;
  panelClassName?: string;
  title?: string;
  disabled?: boolean;
  pressed?: boolean;
  testId?: string;
  onOpen?: () => void;
}) {
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const id = useId();

  const place = useCallback(() => {
    const t = btn.current?.getBoundingClientRect();
    const p = panel.current;
    if (!t || !p) return;
    const h = p.offsetHeight;
    const w = p.offsetWidth;
    const below = window.innerHeight - t.bottom;
    const top = below < h + 8 && t.top > below ? t.top - h - 6 : t.bottom + 6;
    const left = Math.max(8, Math.min(window.innerWidth - w - 8, t.left + t.width / 2 - w / 2));
    p.style.top = `${Math.max(8, Math.min(window.innerHeight - h - 8, top))}px`;
    p.style.left = `${left}px`;
  }, []);

  useEffect(() => {
    const p = panel.current;
    if (!p) return;
    const onToggle = (e: Event) => {
      const isOpen = (e as ToggleEvent).newState === "open";
      setOpen(isOpen);
      if (isOpen) {
        place();
        onOpen?.();
        requestAnimationFrame(() => (p.querySelector<HTMLElement>("[data-autofocus], [aria-checked=true], button, input, [tabindex='0']"))?.focus());
      }
    };
    p.addEventListener("toggle", onToggle);
    return () => p.removeEventListener("toggle", onToggle);
  }, [place, onOpen]);

  const close = useCallback(() => {
    try {
      panel.current?.hidePopover();
    } catch {
      // already closed
    }
    btn.current?.focus();
  }, []);

  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        aria-pressed={pressed}
        title={title ?? label}
        disabled={disabled}
        data-testid={testId}
        className={cx("ed-ctl", className)}
        onClick={() => {
          const p = panel.current;
          if (!p) return;
          try {
            if (open) p.hidePopover();
            else {
              p.showPopover();
              place();
            }
          } catch {
            // unsupported: nothing
          }
        }}
      >
        {trigger}
      </button>
      <div
        ref={panel}
        id={id}
        role="dialog"
        aria-label={label}
        popover="auto"
        data-popover
        className={cx("ed-pop", panelClassName)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") {
            e.preventDefault();
            close();
          }
        }}
      >
        {open && (typeof children === "function" ? children(close) : children)}
      </div>
    </>
  );
}
