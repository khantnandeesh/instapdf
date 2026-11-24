"use client";
import { forwardRef, useEffect, useRef, type ReactNode } from "react";
import { Button } from "../ui/Button";
import { Notice } from "../ui/Notice";
import { ProgressBar } from "../ui/ProgressBar";
import { copy } from "./copy";

/**
 * Options and the primary action. The primary action never leaves the viewport.
 *
 * - `layout="side"` (the empty state): from 1024 px an app Panel in a sticky column, --ip-work-h
 *   tall (fits the first screen); options scroll inside it, status + primary pinned at its bottom.
 * - `layout="bar"` (a file is loaded): one compact row fixed to the bottom, options on the left and
 *   status + primary on the right, so the pages get the rest of the screen (like the phone dock).
 *
 * Below 1024 px it is always the bottom bar. Options style themselves with the `dock-side:` /
 * `dock-bar:` variants (globals.css), which read data-ip-dock. While fixed, its measured height is
 * written to --ip-dock-actual on the document so the pages area and the footer stay clear of it.
 */
export function ControlDock({
  label,
  layout = "side",
  optionsDisabled,
  options,
  status,
  footer,
}: {
  label: string;
  layout?: "side" | "bar";
  optionsDisabled: boolean;
  options: ReactNode;
  status: ReactNode;
  footer: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const root = document.documentElement;
    const measure = () => {
      const fixed = getComputedStyle(el).position === "fixed";
      if (fixed) root.style.setProperty("--ip-dock-actual", `${el.offsetHeight}px`);
      else root.style.removeProperty("--ip-dock-actual");
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => {
      ro.disconnect();
      root.style.removeProperty("--ip-dock-actual");
    };
  }, [layout]);
  const side = layout === "side";
  return (
    <aside
      ref={ref}
      data-ip-dock={layout}
      role="region"
      aria-label={label}
      // Bar: BerryPDF's strawberry-cream action tab fixed to the bottom (EditorToolbar).
      // Side (>= 1024 px): an app Panel (white, sand outline, 20px radius, soft pink shadow) in a sticky column.
      className={[
        "fixed inset-x-0 bottom-0 z-20 rounded-t-[18px] bg-sand shadow-menu",
        "px-[15px] pt-3 pb-[calc(14px+env(safe-area-inset-bottom))]",
        side
          ? "lg:sticky lg:top-[calc(var(--ip-header-h)+16px)] lg:z-auto lg:flex lg:h-(--ip-work-h) lg:flex-col lg:rounded-panel lg:border-[1.5px] lg:border-panel-border lg:bg-surface-raised lg:p-6 lg:shadow-card"
          : "mp-dock-bar lg:px-8 lg:pt-3.5 lg:pb-[calc(16px+env(safe-area-inset-bottom))]",
      ].join(" ")}
    >
      <div
        className={[
          "flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4",
          side ? "lg:min-h-0 lg:flex-1 lg:flex-col lg:items-stretch" : "lg:mx-auto lg:max-w-[1216px] lg:gap-8",
        ].join(" ")}
      >
        <fieldset
          disabled={optionsDisabled}
          className={["min-w-0 sm:flex-1", side ? "ip-dock-scroll lg:min-h-0 lg:flex-1 lg:overflow-y-auto" : ""].join(" ")}
          data-testid="dock-options"
        >
          <legend className="sr-only">{label}</legend>
          {/* No visible title (minimal text); kept for heading navigation. */}
          <h2 className="sr-only">Options</h2>
          {options}
        </fieldset>
        <div className={["flex shrink-0 flex-col gap-2 sm:min-w-[200px]", side ? "lg:min-w-0" : "lg:w-[320px]"].join(" ")} data-testid="dock-footer">
          <div className="max-lg:sr-only">{status}</div>
          {footer}
        </div>
      </div>
    </aside>
  );
}

export function DockStatus({ id, text, extra }: { id: string; text: string; extra?: string }) {
  return (
    <p id={id} className="truncate text-sm text-muted tabular-nums" data-testid="dock-status">
      {text}
      {extra ? ` · ${extra}` : ""}
    </p>
  );
}

/**
 * Same box as the primary button, so swapping them moves nothing: the "Rotating… 42%" line over
 * BerryPDF's JamProgress (the progressbar).
 */
export const ProcessingBar = forwardRef<HTMLDivElement, { label: string; value: number }>(function ProcessingBar({ label, value }, ref) {
  const pct = Math.round(value * 100);
  return (
    <div ref={ref} tabIndex={-1} className="flex h-[56px] w-full flex-col justify-center gap-1.5 rounded-lg outline-none" data-testid="processing">
      <span className="font-display text-[17px] leading-5 font-semibold text-ink tabular-nums">{copy.progress(label, pct)}</span>
      <ProgressBar label={label} value={pct} valueText={`${pct}%`} />
    </div>
  );
});

export const ProcessError = forwardRef<HTMLButtonElement, { message: string; onRetry: () => void; onStartOver: () => void }>(function ProcessError(
  { message, onRetry, onStartOver },
  ref,
) {
  return (
    <div className="flex flex-col gap-2" data-testid="process-error">
      <Notice tone="danger">{message}</Notice>
      <div className="flex gap-2">
        <Button ref={ref} variant="primary" size="lg" className="flex-1" onClick={onRetry}>
          Try again
        </Button>
        <Button variant="ghost" size="lg" className="flex-1" onClick={onStartOver}>
          Start over
        </Button>
      </div>
    </div>
  );
});
