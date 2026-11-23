import { forwardRef, type KeyboardEvent } from "react";
import { cx } from "./cx";
import { CloseIcon, SearchIcon } from "./icons";
import { Kbd } from "./Kbd";

export type SearchFieldProps = {
  id: string;
  label: string;
  /** Visually hide the label (it stays the accessible name). */
  hideLabel?: boolean;
  value: string;
  onChange: (value: string) => void;
  onEscape?: () => void;
  onEnter?: () => void;
  onArrowDown?: () => void;
  /** Called after "Clear search" empties the field (focus is already back in it). */
  onClear?: () => void;
  placeholder?: string;
  /** Shows the "/" key hint while empty (fine pointers only). */
  shortcutHint?: boolean;
  size?: "md" | "lg";
  describedBy?: string;
  controls?: string;
  className?: string;
};

/**
 * Labeled `type=search` field with a fixed 40 px end slot that holds either the
 * "/" hint or a Clear button, so swapping them never changes the width.
 */
export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(function SearchField(
  { id, label, hideLabel, value, onChange, onEscape, onEnter, onArrowDown, onClear, placeholder, shortcutHint, size = "md", describedBy, controls, className },
  ref,
) {
  const hintId = `${id}-hint`;
  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    const handler = e.key === "Escape" ? onEscape : e.key === "Enter" ? onEnter : e.key === "ArrowDown" ? onArrowDown : undefined;
    if (!handler) return;
    e.preventDefault();
    handler();
  }
  return (
    <div className={cx("min-w-0", className)}>
      <label htmlFor={id} className={hideLabel ? "sr-only" : "mb-1 block text-sm font-bold"}>
        {label}
      </label>
      <div className="relative">
        <SearchIcon size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
        <input
          ref={ref}
          id={id}
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          enterKeyHint="search"
          autoComplete="off"
          spellCheck={false}
          aria-describedby={cx(shortcutHint && hintId, describedBy) || undefined}
          aria-controls={controls}
          className={cx(
            // Mint Paper Input: 1px edge, radius-sm, 17px text, faint inset shadow; link-blue focus glow.
            "ip-search ip-field w-full ps-10 pe-11",
            size === "lg" ? "h-11" : "h-10",
          )}
        />
        {shortcutHint && (
          <span id={hintId} className="sr-only">
            Press slash to search.
          </span>
        )}
        <span className="absolute inset-y-0 end-0 grid w-10 place-items-center">
          {value ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={(e) => {
                onChange("");
                (e.currentTarget.closest("div")?.querySelector("input") as HTMLInputElement | null)?.focus();
                onClear?.();
              }}
              className="ip-fade-in grid size-9 place-items-center rounded-pill text-muted transition-colors duration-(--dur-base) hover:bg-surface-soft hover:text-ink-black"
            >
              <CloseIcon size={18} />
            </button>
          ) : (
            shortcutHint && (
              <span className="hidden [@media(pointer:fine)]:inline-grid">
                <Kbd>/</Kbd>
              </span>
            )
          )}
        </span>
      </div>
    </div>
  );
});
