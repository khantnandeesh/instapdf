"use client";
import "../ui/dialog.css";
import "./tool-flow.css";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "../ui/Button";
import { ActionSlot } from "./ActionSlot";

// The options sheet (below 1024px) and the More options popover (from 1024px) open only on a tap: lazy
// chunks (ToolFlow prefetches them on intent).
const Dialog = dynamic(() => import("../ui/Dialog").then((m) => m.Dialog), { ssr: false });
const Popover = dynamic(() => import("../ui/Popover").then((m) => m.Popover), { ssr: false });

/**
 * Options and the action slot (F25 §3). One element, two places:
 *
 * - `layout="row"` (from 1024px, a file is in): the right part of the sticky top row, after the h1:
 *   the tool's compact one-row options after a 1px divider, More options, Undo│Redo, then the action
 *   slot (status + primary, the pill, the error, Download) right-aligned in a box that never resizes.
 * - `layout="bar"` (below 1024px): today's strawberry-cream dock fixed to the bottom (F4/F5 P-3 rows).
 *   While fixed, its measured height goes to --ip-dock-actual so the pages and the footer stay clear.
 * - `layout="side"`: a settings tool's row (§4): the options live in the side panel, so the row holds
 *   only the slot.
 *
 * Options style themselves with the `dock-side:` / `dock-bar:` variants (globals.css): `dock-bar:` covers
 * both the row and the bar, so every compact form renders unchanged in both.
 */
export function ControlDock({
  label,
  layout,
  optionsDisabled,
  options,
  slot,
  density = "compact",
  sheet,
  start,
  more,
  dimmed,
  bare,
}: {
  label: string;
  layout: "row" | "bar" | "side";
  optionsDisabled: boolean;
  options: ReactNode;
  /** What the action slot holds now (status + primary, the pill, the error or Download). */
  slot: ReactNode;
  /**
   * "full" (spec F1 U-4, F3 M-5): many options. A More options trigger opens them: a popover in the row,
   * the bottom sheet in the bar (where its label stays "Options", with its badge).
   */
  density?: "compact" | "full";
  sheet?: { title: string; badge?: string; footer: (close: () => void) => ReactNode };
  /** Controls after the options and before the slot (F5 Undo│Redo, spec F4/F5 P-3). */
  start?: ReactNode;
  /** Page tools (spec F4/F5 UI P-3): their own More options trigger, after the options. */
  more?: ReactNode;
  /** Working (spec §6): the options dim to 0.45 and go inert. */
  dimmed?: boolean;
  /** The result (spec §7): the row shows no options, only the slot. */
  bare?: boolean;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const optionsButton = useRef<HTMLButtonElement>(null);
  const full = density === "full";
  const bar = layout === "bar";
  const hasOptions = !bare && layout !== "side" && options != null && options !== false;
  const inline = hasOptions && !full;
  const sheetMode = hasOptions && full;
  const noOptions = !inline && !sheetMode;
  const showStart = !bare && !!start;
  const showMore = !bare && !!more;
  useEffect(() => setSheetOpen(false), [layout]);
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
  const dim = dimmed ? { "data-dim": "", inert: true } : {};
  const optionsTrigger = sheetMode && (
    <Button
      ref={optionsButton}
      variant={bar ? "secondary" : "soft"}
      className={bar ? (start ? "min-w-0 flex-1" : "sm:flex-1") : "ip-more-trigger ip-dimmable h-11 shrink-0"}
      aria-haspopup="dialog"
      aria-expanded={sheetOpen}
      aria-label={`${bar ? "Options" : "More options"}${sheet?.badge ? `, ${sheet.badge}` : ""}`}
      onClick={() => setSheetOpen((o) => !o)}
      data-testid="options-button"
      {...dim}
      iconStart={
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
          <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
          <circle cx="16" cy="7" r="2" fill="currentColor" fillOpacity={0.2} />
          <circle cx="10" cy="17" r="2" fill="currentColor" fillOpacity={0.2} />
        </svg>
      }
    >
      {/* 1024-1279: icon only, its name in the tooltip (spec §3.1). */}
      <span className={bar ? undefined : "max-xl:sr-only"}>{bar ? "Options" : "More options"}</span>
      {bar ? (
        <span className="inline-flex min-w-[84px] justify-start" aria-hidden="true">
          {sheet?.badge && <span className="mp-tag mp-tag--sm">{sheet.badge}</span>}
        </span>
      ) : (
        sheet?.badge && (
          <span className="mp-tag mp-tag--sm max-xl:hidden" aria-hidden="true">
            {sheet.badge}
          </span>
        )
      )}
    </Button>
  );
  const fieldset = (cls: string) => (
    <fieldset disabled={optionsDisabled} className={cls} data-testid="dock-options" {...dim}>
      <legend className="sr-only">{label}</legend>
      {/* No visible title (minimal text); kept for heading navigation. */}
      <h2 className="sr-only">Options</h2>
      {options}
    </fieldset>
  );
  const sheetBody = (testId: string) => (
    <fieldset disabled={optionsDisabled} className="min-w-0" data-testid={testId}>
      <legend className="sr-only">{label}</legend>
      {options}
    </fieldset>
  );

  if (!bar)
    return (
      <aside ref={ref} data-ip-dock="row" role="region" aria-label={label} className="ip-dock-row">
        {inline && fieldset("ip-dock-row__options ip-dimmable")}
        {sheetMode && (
          <span className="relative ip-dock-row__options">
            {optionsTrigger}
            {sheet && (
              <Popover
                open={sheetOpen}
                onClose={() => setSheetOpen(false)}
                trigger={optionsButton}
                label={sheet.title}
                testId="options-popover"
                footer={sheet.footer(() => {
                  setSheetOpen(false);
                  optionsButton.current?.focus();
                })}
              >
                {sheetBody("options-sheet-body")}
              </Popover>
            )}
          </span>
        )}
        {showMore && (
          <div className="ip-dimmable flex shrink-0 items-center" data-testid="dock-more" {...dim}>
            {more}
          </div>
        )}
        {showStart && (
          <div className="ip-dimmable flex shrink-0 items-center" data-testid="dock-start" {...dim}>
            {start}
          </div>
        )}
        <ActionSlot>{slot}</ActionSlot>
      </aside>
    );

  return (
    <aside
      ref={ref}
      data-ip-dock="bar"
      role="region"
      aria-label={label}
      // BerryPDF's strawberry-cream action tab fixed to the bottom (EditorToolbar).
      className="fixed inset-x-0 bottom-0 z-20 rounded-t-[18px] bg-sand px-[15px] pt-3 pb-[calc(14px+env(safe-area-inset-bottom))] shadow-menu"
    >
      <div
        className={[
          "flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4",
          showMore || showStart ? "max-sm:flex-row max-sm:flex-wrap max-sm:items-center" : "",
          showMore ? "max-sm:[&>[data-testid=dock-options]]:basis-full" : "",
        ].join(" ")}
      >
        {inline && fieldset(["min-w-0 ip-dimmable", showStart ? "flex-1" : "sm:flex-1"].join(" "))}
        {optionsTrigger}
        {showStart && (
          <div className="ip-dimmable flex shrink-0 items-center" data-testid="dock-start" {...dim}>
            {start}
          </div>
        )}
        {showMore && (
          <div className="ip-dimmable flex shrink-0 items-center" data-testid="dock-more" {...dim}>
            {more}
          </div>
        )}
        <div
          className={[
            "flex shrink-0 flex-col gap-2 sm:min-w-[200px]",
            // Below 640 px: beside More options or a lone Undo│Redo; under the options row when Undo│Redo shares it.
            showMore || (showStart && noOptions) ? "max-sm:min-w-0 max-sm:flex-1" : showStart ? "max-sm:basis-full" : "",
            noOptions ? "sm:ms-auto" : "",
          ].join(" ")}
          data-testid="dock-footer"
        >
          <ActionSlot>{slot}</ActionSlot>
        </div>
      </div>
      {sheetMode && sheet && (
        <Dialog
          open={sheetOpen}
          variant="sheet"
          title={sheet.title}
          onClose={() => setSheetOpen(false)}
          onCloseButton={() => setSheetOpen(false)}
          returnFocusRef={optionsButton}
          footer={sheet.footer(() => setSheetOpen(false))}
        >
          {sheetBody("options-sheet")}
        </Dialog>
      )}
    </aside>
  );
}
