"use client";
import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { cx } from "./cx";
import { LazyFieldBubble } from "./LazyFieldBubble";
import { MinusIcon, PlusIcon } from "./icons";
import { shakeElement } from "./shake";

/** The stepper's whole number, or null when the text is not one in [min, max]. */
export function stepperValue(text: string, min = 1, max = 9999): number | null {
  const t = text.trim();
  if (!/^\d+$/.test(t)) return null;
  const v = Number(t);
  return v >= min && v <= max ? v : null;
}

/** The text after a step of `delta` (an invalid text steps from `min`). */
export function stepText(text: string, delta: number, min = 1, max = 9999): string {
  const v = stepperValue(text, min, max) ?? (delta > 0 ? min - 1 : min + 1);
  return String(Math.min(max, Math.max(min, v + delta)));
}

/**
 * [− | number | +] as one joined control (spec F4/F5 UI P-4 `NumberStepper`; globals.css .ip-stepper). Free typing is allowed; the
 * error shows 300ms after the last keystroke and at once on blur, in the same bubble as the range
 * field. ArrowUp / ArrowDown step by 1, PageUp / PageDown by 10; − is aria-disabled at `min`.
 */
export function NumberStepper({
  value,
  onChange,
  label,
  decLabel,
  incLabel,
  error,
  min = 1,
  max = 9999,
  under,
  onEnter,
  className,
}: {
  /** The field's text (the caller validates it with stepperValue). */
  value: string;
  onChange: (text: string) => void;
  label: string;
  decLabel: string;
  incLabel: string;
  /** The error text while the value is invalid. */
  error: string;
  min?: number;
  max?: number;
  /** Outside the dock (Alternate's file cards): the error is a line under the stepper, covering nothing, in a row
   *  kept free for it, so the card never jumps when it appears (visual gate round 2). */
  under?: boolean;
  /** Enter: run with the number as typed. The tool checks it (live) and runs only when it is valid. */
  onEnter?: () => void;
  className?: string;
}) {
  const id = useId();
  const errId = `${id}-err`;
  const valid = stepperValue(value, min, max) !== null;
  const [shown, setShown] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    clearTimeout(timer.current);
    if (valid) setShown(false);
    else timer.current = setTimeout(() => setShown(true), 300);
    return () => clearTimeout(timer.current);
  }, [valid, value]);
  const atMin = (stepperValue(value, min, max) ?? min) <= min;
  const atMax = (stepperValue(value, min, max) ?? 0) >= max;

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && onEnter && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (e.repeat) return; // a held Enter runs once
      if (!valid) {
        setShown(true);
        shakeElement(field.current);
      }
      // The tool decides from the number as typed (its live state), which this render may not show yet.
      onEnter();
      return;
    }
    const delta = e.key === "ArrowUp" ? 1 : e.key === "ArrowDown" ? -1 : e.key === "PageUp" ? 10 : e.key === "PageDown" ? -10 : 0;
    if (!delta) return;
    e.preventDefault();
    onChange(stepText(value, delta, min, max));
  }

  const step = (delta: number) => onChange(stepText(value, delta, min, max));
  return (
    <span className={cx("relative", under ? "inline-grid grid-rows-[auto_1.25rem]" : "inline-flex", className)} data-testid="number-stepper" data-fb-under={under ? "" : undefined}>
      {/* One joined control (globals.css .ip-stepper), the same everywhere a number steps. */}
      <span className="ip-stepper" style={{ "--ip-stepper-ch": Math.max(2, String(max).length) } as CSSProperties}>
        <button type="button" className="ip-stepper__btn" aria-label={decLabel} aria-disabled={atMin || undefined} onClick={() => !atMin && step(-1)}>
          <MinusIcon size={18} />
        </button>
        <input
          type="text"
          inputMode="numeric"
          aria-label={label}
          aria-invalid={shown && !valid ? true : undefined}
          aria-describedby={shown && !valid ? errId : undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => {
            if (!valid) {
              setShown(true);
              shakeElement(field.current);
            }
          }}
          ref={field}
          className="ip-stepper__value"
        />
        <button type="button" className="ip-stepper__btn" aria-label={incLabel} aria-disabled={atMax || undefined} onClick={() => !atMax && step(1)}>
          <PlusIcon size={18} />
        </button>
      </span>
      <LazyFieldBubble id={errId} error={shown && !valid ? error : null} className="dock-side:absolute dock-side:top-full dock-side:left-0" />
    </span>
  );
}
