"use client";
import { forwardRef, useEffect, useRef, type ReactNode } from "react";
import { Button } from "../ui/Button";
import { Notice } from "../ui/Notice";
import { ProgressBar } from "../ui/ProgressBar";
import { copy } from "./copy";

/**
 * Options and the primary action. A sticky side column at >= 1024 px, a fixed
 * bottom bar below. Its measured height is written to --ip-dock-actual on the
 * document so `main` keeps the last row of tiles clear of it.
 */
export function ControlDock({
  label,
  optionsDisabled,
  options,
  status,
  footer,
}: {
  label: string;
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
    const ro = new ResizeObserver(() => {
      const fixed = getComputedStyle(el).position === "fixed";
      if (fixed) root.style.setProperty("--ip-dock-actual", `${el.offsetHeight}px`);
      else root.style.removeProperty("--ip-dock-actual");
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--ip-dock-actual");
    };
  }, []);
  return (
    <aside
      ref={ref}
      data-ip-dock=""
      role="region"
      aria-label={label}
      // Below 1024 px: Mint Paper's sand action strip fixed to the bottom. From 1024 px: an app Panel
      // (white, panel-border, radius-panel, shadow-panel) in a sticky side column.
      className={[
        "fixed inset-x-0 bottom-0 z-20 rounded-t-[12px] bg-sand",
        "px-[15px] pt-3 pb-[calc(12px+env(safe-area-inset-bottom))]",
        "lg:sticky lg:top-[calc(var(--ip-header-h)+24px)] lg:z-auto lg:flex lg:h-[calc(100dvh-var(--ip-header-h)-48px)] lg:max-h-[640px] lg:flex-col lg:rounded-panel lg:border lg:border-panel-border lg:bg-surface-raised lg:p-[30px] lg:shadow-panel",
      ].join(" ")}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4 lg:h-full lg:flex-col lg:items-stretch">
        <fieldset disabled={optionsDisabled} className="min-w-0 sm:flex-1 lg:flex-1 lg:overflow-y-auto">
          <legend className="sr-only">{label}</legend>
          <h2 className="mb-5 hidden text-prose-h2 tracking-[-0.5px] text-ink lg:block">Options</h2>
          {options}
        </fieldset>
        <div className="flex flex-col gap-2 sm:min-w-[200px] lg:min-w-0">
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
 * Same box as the primary button, so swapping them moves nothing. The progress itself is Mint
 * Paper's 3px mint line fixed to the top of the viewport.
 */
export const ProcessingBar = forwardRef<HTMLDivElement, { label: string; value: number }>(function ProcessingBar({ label, value }, ref) {
  const pct = Math.round(value * 100);
  return (
    <div ref={ref} tabIndex={-1} className="flex h-[51px] w-full flex-col justify-center rounded-lg outline-none" data-testid="processing">
      <span className="text-button text-ink tabular-nums">{copy.progress(label, pct)}</span>
      <ProgressBar label={label} value={pct} valueText={`${pct}%`} fixed />
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
