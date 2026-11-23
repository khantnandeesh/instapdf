"use client";
import { forwardRef, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Notice } from "../ui/Notice";
import { ProgressBar } from "../ui/ProgressBar";
import { copy } from "./copy";

/**
 * Options and the primary action. A sticky side column at >= 1024 px, a fixed
 * bottom bar below. Its measured height is written to --ip-dock-actual on the
 * document so `main` keeps the last row of tiles clear of it.
 */
/** True at >= 1024 px; null before the first client render (SSR shows the CSS fallback). */
function useDesktop(): boolean | null {
  const [desktop, setDesktop] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setDesktop(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return desktop;
}

export function ControlDock({
  label,
  optionsDisabled,
  options,
  status,
  footer,
  density = "compact",
  sheet,
}: {
  label: string;
  optionsDisabled: boolean;
  options: ReactNode;
  status: ReactNode;
  footer: ReactNode;
  /**
   * "full" (spec F1 U-4, F3 M-5): below 1024 px the dock shows an Options
   * button that opens the panel in a bottom sheet instead of inline options.
   */
  density?: "compact" | "full";
  sheet?: { title: string; badge?: string; footer: (close: () => void) => ReactNode };
}) {
  const desktop = useDesktop();
  const [sheetOpen, setSheetOpen] = useState(false);
  const optionsButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (desktop) setSheetOpen(false);
  }, [desktop]);
  const full = density === "full";
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
      // Below 1024 px: BerryPDF's strawberry-cream action tab fixed to the bottom (EditorToolbar).
      // From 1024 px: an app Panel (white, sand outline, 20px radius, soft pink shadow) in a sticky column.
      className={[
        "fixed inset-x-0 bottom-0 z-20 rounded-t-[18px] bg-sand shadow-menu",
        "px-[15px] pt-3 pb-[calc(14px+env(safe-area-inset-bottom))]",
        "lg:sticky lg:top-[calc(var(--ip-header-h)+24px)] lg:z-auto lg:flex lg:h-[calc(100dvh-var(--ip-header-h)-48px)] lg:max-h-[640px] lg:flex-col lg:rounded-panel lg:border-[1.5px] lg:border-panel-border lg:bg-surface-raised lg:p-7 lg:shadow-card",
      ].join(" ")}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4 lg:h-full lg:flex-col lg:items-stretch">
        {(!full || desktop !== false) &&
          (full ? (
            // The scrolling panel stays keyboard-reachable while every control in it is disabled (axe scrollable-region-focusable).
            <div tabIndex={optionsDisabled ? 0 : undefined} className="min-w-0 rounded-lg focus-visible:outline-focus max-lg:hidden lg:flex-1 lg:overflow-y-auto">
              <fieldset disabled={optionsDisabled} className="min-w-0">
                <legend className="sr-only">{label}</legend>
                <h2 className="mb-5 hidden font-display text-[22px] leading-[1.2] font-semibold text-ink-black lg:block">Options</h2>
                {options}
              </fieldset>
            </div>
          ) : (
            <fieldset disabled={optionsDisabled} className="min-w-0 sm:flex-1 lg:flex-1 lg:overflow-y-auto">
              <legend className="sr-only">{label}</legend>
              <h2 className="mb-5 hidden font-display text-[22px] leading-[1.2] font-semibold text-ink-black lg:block">Options</h2>
              {options}
            </fieldset>
          ))}
        {full && desktop !== true && (
          <Button
            ref={optionsButton}
            variant="secondary"
            className="sm:flex-1 lg:hidden"
            aria-haspopup="dialog"
            aria-expanded={sheetOpen}
            aria-label={sheet?.badge ? `Options, ${sheet.badge}` : "Options"}
            onClick={() => setSheetOpen(true)}
            data-testid="options-button"
            iconStart={
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
                <circle cx="16" cy="7" r="2" fill="currentColor" fillOpacity={0.2} />
                <circle cx="10" cy="17" r="2" fill="currentColor" fillOpacity={0.2} />
              </svg>
            }
          >
            Options
            <span className="inline-flex min-w-[84px] justify-start" aria-hidden="true">
              {sheet?.badge && <span className="mp-tag mp-tag--sm">{sheet.badge}</span>}
            </span>
          </Button>
        )}
        <div className="flex flex-col gap-2 sm:min-w-[200px] lg:min-w-0">
          <div className="max-lg:sr-only">{status}</div>
          {footer}
        </div>
      </div>
      {full && sheet && desktop === false && (
        <Dialog
          open={sheetOpen}
          variant="sheet"
          title={sheet.title}
          onClose={() => setSheetOpen(false)}
          onCloseButton={() => setSheetOpen(false)}
          returnFocusRef={optionsButton}
          footer={sheet.footer(() => setSheetOpen(false))}
        >
          <fieldset disabled={optionsDisabled} className="min-w-0" data-testid="options-sheet">
            <legend className="sr-only">{label}</legend>
            {options}
          </fieldset>
        </Dialog>
      )}
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
 * Same box as the primary button, so swapping them moves nothing: the "Merging… 42%" line over
 * BerryPDF's JamProgress (the progressbar). `phaseLabel` (e.g. "Preparing fonts…") replaces the
 * percentage with the indeterminate jam.
 */
export const ProcessingBar = forwardRef<HTMLDivElement, { label: string; value: number; phaseLabel?: string }>(function ProcessingBar({ label, value, phaseLabel }, ref) {
  const pct = Math.round(value * 100);
  return (
    <div ref={ref} tabIndex={-1} className="flex h-[56px] w-full flex-col justify-center gap-1.5 rounded-lg outline-none" data-testid="processing">
      <span className="font-display text-[17px] leading-5 font-semibold text-ink tabular-nums">{phaseLabel ?? copy.progress(label, pct)}</span>
      {phaseLabel ? <ProgressBar label={phaseLabel} /> : <ProgressBar label={label} value={pct} valueText={`${pct}%`} />}
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
