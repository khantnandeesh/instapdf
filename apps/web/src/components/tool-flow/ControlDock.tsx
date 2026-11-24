"use client";
import "../ui/dialog.css";
import "./tool-flow.css";
import { forwardRef, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Notice } from "../ui/Notice";
import { ProgressBar } from "../ui/ProgressBar";
import { copy } from "./copy";

/**
 * Options and the primary action. The primary action never leaves the viewport.
 *
 * - `layout="side"` (the empty state): from 1024 px an app Panel at least --ip-work-h tall that
 *   grows with its options. It never scrolls inside itself (one scroller per screen: the page). When
 *   the options run past the fold, status + primary stick to the bottom of the screen (position:
 *   sticky) and the page scrolls to the rest; when they fit, they sit at the panel's bottom.
 * - `layout="bar"` (a file is loaded): one compact row fixed to the bottom, options on the left and
 *   status + primary on the right, so the pages get the rest of the screen (like the phone dock).
 *
 * Below 1024 px it is always the bottom bar. Options style themselves with the `dock-side:` /
 * `dock-bar:` variants (globals.css), which read data-ip-dock. While fixed, its measured height is
 * written to --ip-dock-actual on the document so the pages area and the footer stay clear of it.
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
  layout = "side",
  optionsDisabled,
  options,
  status,
  footer,
  density = "compact",
  sheet,
}: {
  label: string;
  layout?: "side" | "bar";
  optionsDisabled: boolean;
  options: ReactNode;
  status: ReactNode;
  footer: ReactNode;
  /**
   * "full" (spec F1 U-4, F3 M-5): many options. Inline only in the side panel from 1024 px;
   * in the bottom bar (and always below 1024 px) a compact Options button with its badge opens
   * them in a bottom sheet, beside the status and primary.
   */
  density?: "compact" | "full";
  sheet?: { title: string; badge?: string; footer: (close: () => void) => ReactNode };
}) {
  const desktop = useDesktop();
  const [sheetOpen, setSheetOpen] = useState(false);
  const optionsButton = useRef<HTMLButtonElement>(null);
  const full = density === "full";
  const side = layout === "side";
  // "full" density: inline options only in the side panel from 1024 px (the SSR render keeps them,
  // hidden below lg by CSS); everywhere else an Options button opens the same options in a sheet.
  const inline = !full || (side && desktop !== false);
  const sheetMode = full && (!side || desktop !== true);
  useEffect(() => {
    if (side && desktop) setSheetOpen(false);
  }, [desktop, side]);
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
  return (
    <aside
      ref={ref}
      data-ip-dock={layout}
      role="region"
      aria-label={label}
      // Bar: BerryPDF's strawberry-cream action tab fixed to the bottom (EditorToolbar).
      // Side (>= 1024 px): an app Panel (white, sand outline, 20px radius, soft pink shadow) that grows with its options.
      className={[
        "fixed inset-x-0 bottom-0 z-20 rounded-t-[18px] bg-sand shadow-menu",
        "px-[15px] pt-3 pb-[calc(14px+env(safe-area-inset-bottom))]",
        side
          ? "lg:static lg:z-auto lg:flex lg:min-h-(--ip-work-h) lg:flex-col lg:rounded-panel lg:border-[1.5px] lg:border-panel-border lg:bg-surface-raised lg:p-6 lg:shadow-card"
          : "mp-dock-bar lg:px-8 lg:pt-3 lg:pb-[calc(12px+env(safe-area-inset-bottom))]",
      ].join(" ")}
    >
      <div
        className={[
          "flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4",
          side ? "lg:flex-1 lg:flex-col lg:items-stretch" : "lg:mx-auto lg:max-w-[1216px] lg:gap-8",
        ].join(" ")}
      >
        {inline &&
          (full ? (
            // Side panel only (hidden below lg). Full height, no inner scroller (design rule "One scroller").
            <fieldset disabled={optionsDisabled} className="min-w-0 max-lg:hidden" data-testid="dock-options">
              <legend className="sr-only">{label}</legend>
              <h2 className="sr-only">Options</h2>
              {options}
            </fieldset>
          ) : (
            <fieldset
              disabled={optionsDisabled}
              className="min-w-0 sm:flex-1"
              data-testid="dock-options"
            >
              <legend className="sr-only">{label}</legend>
              {/* No visible title (minimal text); kept for heading navigation. */}
              <h2 className="sr-only">Options</h2>
              {options}
            </fieldset>
          ))}
        {sheetMode && (
          <Button
            ref={optionsButton}
            variant="secondary"
            className={side ? "sm:flex-1 lg:hidden" : "sm:flex-1 lg:flex-none"}
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
        {full && !side && <span aria-hidden="true" className="hidden lg:block lg:flex-1" />}
        <div
          className={[
            "flex shrink-0 flex-col gap-2 sm:min-w-[200px]",
            side
              ? // Side panel: pinned to the bottom of the screen while the options run past the fold (sticky, so
                // the page stays the only scroller), resting at the panel's bottom once they end. It covers the
                // panel's padding so options pass under it; a soft fade above it says there is more.
                "lg:sticky lg:bottom-0 lg:z-20 lg:-mx-6 lg:mt-auto lg:-mb-6 lg:min-w-0 lg:rounded-b-panel lg:bg-surface-raised lg:px-6 lg:pt-2 lg:pb-6 lg:before:pointer-events-none lg:before:absolute lg:before:inset-x-0 lg:before:-top-4 lg:before:h-4 lg:before:bg-linear-to-b lg:before:from-transparent lg:before:to-surface-raised"
              : "lg:flex-row lg:items-center lg:gap-5 lg:[&>*:last-child]:w-[260px] lg:[&>*:last-child]:shrink-0",
          ].join(" ")}
          data-testid="dock-footer"
        >
          {/* On the sand bar the status reads in ink (muted on sand is under 4.5:1), beside the primary. */}
          <div className={["max-lg:sr-only", side ? "" : "min-w-0 text-end [&_p]:text-ink"].join(" ")}>{status}</div>
          {footer}
        </div>
      </div>
      {sheetMode && sheet && (
        <Dialog
          open={sheetOpen}
          variant="sheet"
          // From 1024 px (bar layout) the sheet is a centred column rising from the bottom, not a full-width band.
          className="lg:mx-auto lg:w-[min(720px,calc(100vw-32px))]"
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
