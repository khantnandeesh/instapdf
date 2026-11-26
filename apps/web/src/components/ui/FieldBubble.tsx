import "./field-bubble.css";
import { useLayoutEffect, useRef } from "react";
import { cx } from "./cx";
import { AlertIcon } from "./icons";

/**
 * The hint or error of a field (spec F4/F5 UI P-4 `FieldBubble`). In the bottom bar it floats
 * above the field (absolute, so it never moves the layout): white with a 6px tail, a 1.5px danger
 * edge and the alert icon for an error, the card edge for a hint. In the side panel the same text
 * is a line under the field, in a reserved 20px slot.
 *
 * An error has role="alert" and is keyed by its text, so each new error is announced once, not
 * on every keystroke. A hint is decorative (the field's sr-only description says the same).
 *
 * Fields load it lazily (`LazyFieldBubble`): it only ever shows once a file is in, so it stays out
 * of the tool's first load (spec F4/F5 UI P-12); `BubbleSlot` keeps the side panel's line meanwhile.
 */
export function FieldBubble({ id, error, hint, className }: { id: string; error?: string | null; hint?: string | null; className?: string }) {
  const text = error || hint || "";
  const isError = !!error;
  // A floating bubble stays inside the screen (16px margin): it slides left when the field sits near
  // the right edge (a phone's bar), and its tail moves the other way so it still points at the field.
  const bubble = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = bubble.current;
    if (!el) return;
    el.style.translate = "";
    el.style.removeProperty("--ip-fb-tail");
    if (getComputedStyle(el.parentElement ?? el).position !== "absolute") return;
    const r = el.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    let dx = r.right > vw - 16 ? vw - 16 - r.right : 0;
    if (r.left + dx < 16) dx = 16 - r.left;
    if (!dx) return;
    el.style.translate = `${dx}px 0`;
    el.style.setProperty("--ip-fb-tail", `${Math.max(12, Math.min(r.width - 24, 20 - dx))}px`);
  }, [text]);
  return (
    // Layout and the bubble look live in field-bubble.css (loaded with this chunk, not on every page).
    <span className={cx("ip-fb", className)} data-empty={text ? undefined : ""}>
      {text && (
        <span
          key={text}
          ref={bubble}
          id={isError ? id : undefined}
          role={isError ? "alert" : undefined}
          aria-hidden={isError ? undefined : true}
          data-testid={isError ? "field-error" : "field-hint"}
          data-tone={isError ? "error" : "hint"}
          className="ip-fb__text ip-bubble-in flex items-center gap-1.5 text-help font-semibold"
        >
          {isError && <AlertIcon size={16} className="shrink-0 text-danger" />}
          <span className="min-w-0">{text}</span>
        </span>
      )}
    </span>
  );
}
