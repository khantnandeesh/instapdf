"use client";
import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "./cx";

export type SegmentOption<T extends string> = {
  value: T;
  label: string;
  shortLabel?: string;
  icon?: ReactNode;
  /** Replaces the drawn label (its text is the accessible name), e.g. a shorter one at some widths. */
  node?: ReactNode;
  /** Tooltip (title) on the option. */
  title?: string;
};

/**
 * Radio group with roving tabindex; arrow keys move and select. Three BerryPDF looks:
 * - "toolbar": joined blueberry editing tools in their halo (EditorToolbar); selected = active.
 * - "tiles": ChoiceTiles (icon over a Fredoka label, on a pale lip); selected = berry edge and text
 *   on the pink tint with a leaf-green tick badge.
 * - "tabs": the soft segmented pill (Tabs) for 2-4 modes; selected = white pill with berry text.
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
  look?: "toolbar" | "tiles" | "tabs";
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
  const tabs = look === "tabs";
  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      onKeyDown={onKeyDown}
      className={cx(tiles ? "grid grid-flow-col auto-cols-fr gap-3" : tabs ? "mp-tabs" : "mp-toolbar", fullWidth && (tiles ? "w-full" : "flex w-full"), className)}
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
            title={o.title}
            className={cx(
              tiles ? "mp-choice min-w-0 px-2 py-4 dock-bar:flex-row dock-bar:gap-1.5 dock-bar:py-2.5" : tabs ? "mp-tab" : "mp-btn mp-btn--tool flex-1",
              checked && "ip-seg-checked",
            )}
            // The toolbar look shows the pressed state through aria-checked styling below.
            data-active={!tiles && !tabs && checked ? "" : undefined}
          >
            {tiles && o.icon}
            {o.node ? (
              o.node
            ) : o.shortLabel ? (
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
