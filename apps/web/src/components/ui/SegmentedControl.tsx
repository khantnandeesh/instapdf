"use client";
import { useRef, type KeyboardEvent } from "react";
import { cx } from "./cx";

export type SegmentOption<T extends string> = { value: T; label: string; shortLabel?: string };

/** Radio group with roving tabindex; arrow keys move and select. */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
  className,
  fullWidth,
}: {
  label: string;
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
  fullWidth?: boolean;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = Math.max(0, options.findIndex((o) => o.value === value));

  function onKeyDown(e: KeyboardEvent) {
    const delta = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    let next = current;
    if (delta) next = (current + delta + options.length) % options.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = options.length - 1;
    else return;
    e.preventDefault();
    onChange(options[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      onKeyDown={onKeyDown}
      className={cx("inline-flex h-11 rounded-md bg-surface-sunken p-0.5 lg:h-10", fullWidth && "flex w-full", className)}
    >
      {options.map((o, i) => {
        const checked = i === current;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={cx(
              "min-w-11 flex-1 rounded-sm px-3 text-sm whitespace-nowrap transition-[background-color,color,box-shadow] duration-(--ip-duration-fast)",
              checked ? "bg-surface-overlay font-semibold text-fg shadow-control" : // text-strong: `text` on the ink-2 track would dip under 4.5:1.
                "font-medium text-fg hover:bg-hover",
              "disabled:text-fg-disabled",
              checked && "disabled:bg-surface-raised disabled:shadow-none",
            )}
          >
            {o.shortLabel ? (
              <>
                <span className="lg:hidden">{o.shortLabel}</span>
                <span className="hidden lg:inline">{o.label}</span>
              </>
            ) : (
              o.label
            )}
          </button>
        );
      })}
    </div>
  );
}
