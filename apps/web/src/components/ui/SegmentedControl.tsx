"use client";
import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "./cx";

export type SegmentOption<T extends string> = { value: T; label: string; shortLabel?: string; icon?: ReactNode };

/**
 * Radio group with roving tabindex; arrow keys move and select. Two Mint Paper looks:
 * - "toolbar": joined editing-tool buttons in the soft blue glow (EditorToolbar); selected = active.
 * - "tiles": ChoiceTiles (line icon over a 15px label); selected = mint edge on choice-bg.
 */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
  className,
  fullWidth,
  look = "toolbar",
}: {
  label: string;
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
  fullWidth?: boolean;
  look?: "toolbar" | "tiles";
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

  const tiles = look === "tiles";
  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      onKeyDown={onKeyDown}
      className={cx(tiles ? "grid grid-flow-col auto-cols-fr gap-2.5" : "mp-toolbar", fullWidth && (tiles ? "w-full" : "flex w-full"), className)}
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
              tiles ? "mp-choice min-w-0 px-2 py-4 max-lg:flex-row max-lg:gap-1.5 max-lg:py-2" : "mp-btn mp-btn--tool flex-1",
              checked && "ip-seg-checked",
            )}
            // The toolbar look shows the pressed state through aria-checked styling below.
            data-active={!tiles && checked ? "" : undefined}
          >
            {tiles && o.icon}
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
