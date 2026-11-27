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
  add,
  dimmed,
  bare,
  rowOptions,
  rowOptionsComplete,
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
  /** The bar only: a one-file tool's picker, moved out of its tools row on phones (screen fit, eval G-9). */
  add?: ReactNode;
  /** Working (spec §6): the options dim to 0.45 and go inert. */
  dimmed?: boolean;
  /** The result (spec §7): the row shows no options, only the slot. */
  bare?: boolean;
  /** The row only, from 1280 px: a compact control before More options (Merge's Contents page, §3.4). */
  rowOptions?: ReactNode;
  /** The row options are every option: from 1280 px the More options trigger would repeat them, so it goes. */
  rowOptionsComplete?: boolean;
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
  const showMore = !bare && (!!more || !!add);
  // The result in the bar (eval G-2, G-3): the parts that share the slot's row stay as invisible, inert
  // placeholders, so Download takes the primary's exact box and nothing in the bar moves (CLS 0). Rows the
  // slot does not share (the inline options) go; the bar's height change is not a shift (tool-flow.css
  // .ip-dock-anchor).
  const rawOptions = layout !== "side" && options != null && options !== false;
  const rawMore = !!more || !!add;
  const ghost = bar && !!bare && (rawMore || (!!start && !(rawOptions && !full)));
  const ghostOnly = ghost && !rawMore; // the slot shares the row only from 390 px (below, it has its own row)
  const gSheet = sheetMode || (ghost && rawOptions && full);
  const gStart = showStart || (ghost && !!start);
  const gMore = showMore || (ghost && rawMore);
  const ghostProps = bare ? { "aria-hidden": true as const, inert: true } : {};
  const ghostCls = bare ? ` invisible${ghostOnly ? " max-[389px]:hidden" : ""}` : "";
  useEffect(() => setSheetOpen(false), [layout]);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const root = document.documentElement;
    const measure = () => {
      // The bar is pinned by its fixed anchor (tool-flow.css .ip-dock-anchor); the row is in the flow.
      const fixed = el.dataset.ipDock === "bar";
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
  const optionsTrigger = gSheet && (
    <Button
      ref={optionsButton}
      variant={bar ? "secondary" : "soft"}
      // Beside Undo│Redo on a phone (390-639 px) the trigger is a 44 px icon, so options, Undo│Redo and the
      // primary share one row and the pages get the height (screen fit, eval G-9).
      className={
        (bar ? (start ? "relative min-w-0 flex-1 min-[390px]:max-sm:w-11 min-[390px]:max-sm:flex-none min-[390px]:max-sm:px-0" : "sm:flex-1") : "ip-more-trigger ip-dimmable h-11 shrink-0") +
        ghostCls
      }
      aria-haspopup="dialog"
      aria-expanded={sheetOpen}
      aria-label={`${bar ? "Options" : "More options"}${sheet?.badge ? `, ${sheet.badge}` : ""}`}
      onClick={() => setSheetOpen((o) => !o)}
      data-testid={bare ? undefined : "options-button"}
      {...dim}
      {...ghostProps}
      iconStart={
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
          <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
          <circle cx="16" cy="7" r="2" fill="currentColor" fillOpacity={0.2} />
          <circle cx="10" cy="17" r="2" fill="currentColor" fillOpacity={0.2} />
        </svg>
      }
    >
      {/* 1024-1279: icon only, its name in the tooltip (spec §3.1). */}
      <span className={bar ? (start ? "min-[390px]:max-sm:sr-only" : undefined) : "max-xl:sr-only"}>{bar ? "Options" : "More options"}</span>
      {bar ? (
        <span className={`inline-flex min-w-[84px] justify-start${start ? " min-[390px]:max-sm:hidden" : ""}`} aria-hidden="true">
          {sheet?.badge && <span className="mp-tag mp-tag--sm">{sheet.badge}</span>}
        </span>
      ) : null}
      {/* Icon only: a dot says some options changed (the count is in the button's name). */}
      {bar && start && sheet?.badge && <span aria-hidden="true" className="absolute top-1.5 right-1.5 hidden size-2.5 rounded-full bg-brand ring-2 ring-surface min-[390px]:max-sm:block" />}
      {!bar && sheet?.badge && (
        <span className="mp-tag mp-tag--sm max-xl:hidden" aria-hidden="true">
          {sheet.badge}
        </span>
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
      {/* The popover has no visible title: a heading level between the page's h1 and the groups' h3 (axe
          heading-order, eval G-11). The sheet's own title is its h2. */}
      {testId === "options-sheet-body" && <h2 className="sr-only">{sheet?.title ?? label}</h2>}
      {options}
    </fieldset>
  );

  if (!bar)
    return (
      <aside ref={ref} data-ip-dock="row" role="region" aria-label={label} className="ip-dock-row">
        {inline && fieldset("ip-dock-row__options ip-dimmable")}
        {sheetMode && rowOptions != null && (
          <fieldset disabled={optionsDisabled} className="ip-dock-row__options ip-dimmable max-xl:hidden" data-testid="dock-row-options" {...dim}>
            <legend className="sr-only">{label}</legend>
            {rowOptions}
          </fieldset>
        )}
        {sheetMode && (
          <span className={`relative ip-dock-row__options${rowOptionsComplete && rowOptions != null ? " xl:hidden" : ""}`}>
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
    // A zero-height anchor fixed to the bottom edge holds the bar, which a transform lifts by its own height:
    // nothing's top-left moves when the bar grows or shrinks (the options row leaving at the result), so
    // that is never a layout shift (eval G-2: CLS 0 through the swap; tool-flow.css).
    <div className="ip-dock-anchor">
      <aside
        ref={ref}
        data-ip-dock="bar"
        role="region"
        aria-label={label}
        // BerryPDF's strawberry-cream action tab at the bottom (EditorToolbar).
        className="ip-dock-bar rounded-t-[18px] bg-sand px-[15px] pt-3 pb-[calc(14px+env(safe-area-inset-bottom))] shadow-menu"
      >
        <div
          className={[
            "flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4",
            gMore || gStart ? "max-sm:flex-row max-sm:flex-wrap max-sm:items-center" : "",
            gMore ? "max-sm:[&>[data-testid=dock-options]]:basis-full" : "",
          ].join(" ")}
        >
          {inline && fieldset(["min-w-0 ip-dimmable", showStart ? "flex-1" : "sm:flex-1"].join(" "))}
          {optionsTrigger}
          {gStart && (
            <div className={`ip-dimmable flex shrink-0 items-center${ghostCls}`} data-testid={bare ? undefined : "dock-start"} {...dim} {...ghostProps}>
              {start}
            </div>
          )}
          {gMore && (
            <div className={`ip-dimmable flex shrink-0 items-center gap-2${ghostCls}`} data-testid={bare ? undefined : "dock-more"} {...dim} {...ghostProps}>
              {more}
              {add}
            </div>
          )}
          <div
            className={[
              "flex shrink-0 flex-col gap-2 sm:min-w-[200px]",
              // Below 640 px: beside More options or a lone Undo│Redo; under the options row when Undo│Redo shares it,
              // except from 390 px beside the icon-only options trigger and Undo│Redo. There the slot takes the rest of
              // the row from a zero basis, so the wider progress pill never wraps it to a new row (AC-632), and the
              // pill tightens to fit (layout.css, .ip-slot--beside).
              gMore || (gStart && !gSheet && !(ghost ? false : inline))
                ? "max-sm:min-w-0 max-sm:flex-1"
                : gStart
                  ? gSheet
                    ? "ip-slot--beside max-sm:basis-full min-[390px]:max-sm:min-w-0 min-[390px]:max-sm:basis-0 min-[390px]:max-sm:flex-1"
                    : "max-sm:basis-full"
                  : "",
              noOptions ? "sm:ms-auto" : "",
            ].join(" ")}
            data-testid="dock-footer"
            data-room={ghost ? (ghostOnly ? "390" : "all") : undefined}
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
    </div>
  );
}
