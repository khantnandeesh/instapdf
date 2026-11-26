"use client";
import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from "react";
import { cx } from "../ui/cx";
import { LazyFieldBubble } from "../ui/LazyFieldBubble";
import { IconButton } from "../ui/IconButton";
import { CloseIcon } from "../ui/icons";
import { shakeElement } from "../ui/shake";
import { selectCopy } from "./copy";

export type RangeFieldHandle = { focus: () => void; shake: () => void };

/**
 * The page-range field of Split, Extract and Delete (spec F4/F5 §0a, §3a; UI P-4, P-5, P-8):
 * an `ip-field` with a trailing × (shown only when there is something to clear), the hint bubble
 * on focus while empty ("Also: odd, even, last"), and the error bubble, which shows 300ms after
 * the last keystroke and at once on blur. The error names the bad item (the caller words it).
 */
export const RangeField = forwardRef<
  RangeFieldHandle,
  {
    label: string;
    value: string;
    placeholder: string;
    /** "Differs per file": the placeholder while several files' pages differ. */
    differs?: boolean;
    /** The current error text, if any (shown after the input pause). */
    error: string | null;
    /** A message that is not about typing (Delete's "Keep at least one page"): shown at once. */
    notice?: string | null;
    clearLabel: string;
    canClear: boolean;
    onChange: (text: string) => void;
    onBlur: () => void;
    onClear: () => void;
    className?: string;
    testId?: string;
  }
>(function RangeField({ label, value, placeholder, differs, error, notice, clearLabel, canClear, onChange, onBlur, onClear, className, testId = "range-field" }, ref) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;
  const input = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const [shownError, setShownError] = useState<string | null>(null);
  const box = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    clearTimeout(timer.current);
    if (!error) setShownError(null);
    else timer.current = setTimeout(() => setShownError(error), 300);
    return () => clearTimeout(timer.current);
  }, [error]);
  useImperativeHandle(ref, () => ({
    focus: () => input.current?.focus(),
    shake: () => {
      if (error) setShownError(error);
      shakeElement(box.current);
    },
  }));
  // The hint waits 300ms after focus (P-10 P6), so tabbing through never flashes it.
  const [hintReady, setHintReady] = useState(false);
  useEffect(() => {
    if (!focused) return setHintReady(false);
    const t = setTimeout(() => setHintReady(true), 300);
    return () => clearTimeout(t);
  }, [focused]);
  const message = shownError ?? notice ?? null;
  const hint = hintReady && focused && !value && !message ? selectCopy.hintBubble : null;
  return (
    <span className={cx("relative flex min-w-0 flex-col", className)}>
      <span ref={box} className="relative flex min-w-0 items-center">
        <input
          ref={input}
          type="text"
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          aria-label={label}
          aria-invalid={shownError ? true : undefined}
          aria-describedby={message ? `${hintId} ${errId}` : hintId}
          placeholder={differs ? selectCopy.placeholderDiffers : placeholder}
          value={value}
          data-testid={testId}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            if (error) {
              clearTimeout(timer.current);
              setShownError(error);
              shakeElement(box.current);
            }
            onBlur();
          }}
          className={cx("ip-field h-11 w-full min-w-0 ps-3.5 text-[15px]", canClear ? "pe-11" : "pe-3.5")}
        />
        {canClear && (
          <IconButton
            label={clearLabel}
            size="sm"
            className="absolute end-1 top-1/2 -translate-y-1/2"
            icon={<CloseIcon size={16} />}
            onClick={() => {
              onClear();
              input.current?.focus();
            }}
          />
        )}
      </span>
      <span id={hintId} className="sr-only">
        {selectCopy.hintSr}
      </span>
      <LazyFieldBubble id={errId} error={message} hint={hint} />
    </span>
  );
});
