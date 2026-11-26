"use client";
import { useEffect, useId, useState } from "react";
import { FieldBubble } from "./FieldBubble";
import { MinusIcon, PlusIcon } from "./icons";
import { cx } from "./cx";

/**
 * [−] [field] [+] for a whole number (spec F4/F5 P-4 `NumberStepper`). Free typing is allowed;
 * the owner validates the text (`error`) and this shows it in a FieldBubble once typing has paused
 * for 300ms, or on blur. ArrowUp / ArrowDown step by 1, PageUp / PageDown by 10. − is aria-disabled
 * at `min` and + at `max`, so focus never drops off a button that runs out.
 */
export function NumberStepper({
  value,
  onChange,
  label,
  decrementLabel,
  incrementLabel,
  error,
  min = 1,
  max = 9999,
  disabled,
  className,
  "data-testid": testId,
}: {
  /** The field's text (it may be invalid while the user types). */
  value: string;
  onChange: (text: string) => void;
  /** Accessible name of the field. */
  label: string;
  decrementLabel: string;
  incrementLabel: string;
  /** Why the text is not a valid value, or null. */
  error: string | null;
  min?: number;
  max?: number;
  disabled?: boolean;
  className?: string;
  "data-testid"?: string;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const [shown, setShown] = useState<string | null>(null);
  // The bubble follows the error after a 300ms typing pause; clearing it is immediate.
  useEffect(() => {
    if (!error) {
      setShown(null);
      return;
    }
    const t = setTimeout(() => setShown(error), 300);
    return () => clearTimeout(t);
  }, [error, value]);

  const current = /^\d+$/.test(value.trim()) ? Number(value.trim()) : null;
  const step = (delta: number) => {
    const base = current ?? min;
    const next = Math.max(min, Math.min(max, base + delta));
    onChange(String(next));
  };
  const atMin = current !== null && current <= min;
  const atMax = current !== null && current >= max;

  return (
    <span className={cx("relative inline-flex items-center gap-1", className)} data-testid={testId}>
      <button
        type="button"
        className="mp-iconbtn mp-iconbtn--plain size-11 shrink-0 text-brand-strong aria-disabled:opacity-40"
        aria-label={decrementLabel}
        aria-disabled={atMin || disabled || undefined}
        tabIndex={-1}
        onClick={() => !atMin && !disabled && step(-1)}
      >
        <MinusIcon size={16} />
      </button>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        aria-label={label}
        aria-invalid={shown ? true : undefined}
        aria-describedby={shown ? errorId : undefined}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setShown(error)}
        onKeyDown={(e) => {
          const delta = e.key === "ArrowUp" ? 1 : e.key === "ArrowDown" ? -1 : e.key === "PageUp" ? 10 : e.key === "PageDown" ? -10 : 0;
          if (!delta) return;
          e.preventDefault();
          step(delta);
        }}
        className="ip-field h-11 w-(--ip-stepper-field-w) shrink-0 px-1 text-center tabular-nums"
        data-testid="stepper-field"
      />
      <button
        type="button"
        className="mp-iconbtn mp-iconbtn--plain size-11 shrink-0 text-brand-strong aria-disabled:opacity-40"
        aria-label={incrementLabel}
        aria-disabled={atMax || disabled || undefined}
        tabIndex={-1}
        onClick={() => !atMax && !disabled && step(1)}
      >
        <PlusIcon size={16} />
      </button>
      {shown && <FieldBubble id={errorId} text={shown} />}
    </span>
  );
}
