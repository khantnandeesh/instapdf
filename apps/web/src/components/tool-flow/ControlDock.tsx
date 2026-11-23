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
      className={[
        "fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface-raised shadow-md",
        "px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))] sm:px-6",
        "lg:sticky lg:top-[calc(var(--ip-header-h)+24px)] lg:z-auto lg:flex lg:h-[calc(100dvh-var(--ip-header-h)-48px)] lg:max-h-[640px] lg:flex-col lg:rounded-xl lg:border lg:p-5 lg:shadow-sm",
      ].join(" ")}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4 lg:h-full lg:flex-col lg:items-stretch">
        {(!full || desktop !== false) && (
          <fieldset disabled={optionsDisabled} className={full ? "min-w-0 max-lg:hidden lg:flex-1 lg:overflow-y-auto" : "min-w-0 sm:flex-1 lg:flex-1 lg:overflow-y-auto"}>
            <legend className="sr-only">{label}</legend>
            <h2 className="mb-3 hidden text-sm font-semibold text-fg-muted lg:block">Options</h2>
            {options}
          </fieldset>
        )}
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
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round">
                <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
                <circle cx="16" cy="7" r="2" />
                <circle cx="10" cy="17" r="2" />
              </svg>
            }
          >
            Options
            <span className="inline-flex min-w-[84px] justify-start" aria-hidden="true">
              {sheet?.badge && <span className="rounded-sm bg-primary-soft px-1.5 py-0.5 text-xs font-medium text-on-primary-soft">{sheet.badge}</span>}
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
    <p id={id} className="truncate text-sm text-fg-muted tabular-nums" data-testid="dock-status">
      {text}
      {extra ? ` · ${extra}` : ""}
    </p>
  );
}

/** Same box as the primary button (52 px), so swapping them moves nothing. */
/** `phaseLabel` (e.g. "Preparing fonts…") replaces the percentage with an indeterminate bar. */
export const ProcessingBar = forwardRef<HTMLDivElement, { label: string; value: number; phaseLabel?: string }>(function ProcessingBar({ label, value, phaseLabel }, ref) {
  const pct = Math.round(value * 100);
  return (
    <div ref={ref} tabIndex={-1} className="ip-settle flex h-[52px] w-full flex-col justify-center gap-2 rounded-md outline-none" data-testid="processing">
      <span className="text-sm font-medium tabular-nums">{phaseLabel ?? copy.progress(label, pct)}</span>
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
        <Button ref={ref} variant="primary" className="flex-1" onClick={onRetry}>
          Try again
        </Button>
        <Button variant="ghost" className="flex-1" onClick={onStartOver}>
          Start over
        </Button>
      </div>
    </div>
  );
});
