"use client";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { cx } from "./cx";
import { LazyFieldBubble } from "./LazyFieldBubble";
import { IconButton } from "./IconButton";
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
 * [−] [56px number field] [+] (spec F4/F5 UI P-4 `NumberStepper`). Free typing is allowed; the
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
  /** Outside the dock (Alternate's file cards): the error is a line under the stepper, covering nothing. */
  under?: boolean;
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
    const delta = e.key === "ArrowUp" ? 1 : e.key === "ArrowDown" ? -1 : e.key === "PageUp" ? 10 : e.key === "PageDown" ? -10 : 0;
    if (!delta) return;
    e.preventDefault();
    onChange(stepText(value, delta, min, max));
  }

  return (
    <span className={cx("relative inline-flex items-center gap-1", className)} data-testid="number-stepper" data-fb-under={under ? "" : undefined}>
      <IconButton
        label={decLabel}
        variant="soft"
        className="size-11"
        aria-disabled={atMin || undefined}
        icon={<MinusIcon size={18} />}
        onClick={() => !atMin && onChange(stepText(value, -1, min, max))}
      />
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
        className="ip-field h-11 w-(--ip-stepper-field-w) px-2 text-center tabular-nums"
      />
      <IconButton
        label={incLabel}
        variant="soft"
        className="size-11"
        aria-disabled={atMax || undefined}
        icon={<PlusIcon size={18} />}
        onClick={() => !atMax && onChange(stepText(value, 1, min, max))}
      />
      <LazyFieldBubble id={errId} error={shown && !valid ? error : null} className="dock-side:absolute dock-side:top-full dock-side:left-0" />
    </span>
  );
}
