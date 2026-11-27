"use client";
import "./page-edit.css";
/** Merge's dialogs (spec F3 M-4). Loaded on first open (next/dynamic), never on page load. */
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { pageBoxStyle } from "@/components/tool-flow/page-box";
import { PageThumb } from "@/components/tool-flow/Thumbnail";
import { Button } from "@/components/ui/Button";
import { useLiveState } from "@/components/ui/live-state";
import { cx } from "@/components/ui/cx";
import { Dialog } from "@/components/ui/Dialog";
import { AlertIcon, CheckIcon } from "@/components/ui/icons";
import type { PageSize } from "@/lib/page-list";
import { editCopy as c } from "@/tools/merge/copy-edit";
import { gridColumns, navTarget } from "./grid-keys";

export type PickerLabels = {
  title: string;
  help: string;
  selectAll: string;
  selectNone: string;
  ofSelected: (n: number, total: number) => string;
  add: (n: number) => string;
  atLeastOne: string;
  cancel: string;
  tileName: (label: string, page: number) => string;
};

/** Picks pages of one file to insert (spec F3 §3d). Same selection model as the page grid. */
export function PagePickerDialog({
  open,
  fileId,
  letter,
  pages,
  fileName,
  where,
  labels: labelsIn,
  onConfirm,
  onCancel,
  announce,
  fallbackFocus,
  inUse,
}: {
  open: boolean;
  fileId: string;
  letter: string;
  pages: PageSize[];
  fileName: string;
  /** "after A3", "at the end"… */
  where: string;
  labels?: PickerLabels;
  onConfirm: (indexes: number[]) => void;
  onCancel: () => void;
  announce: (m: string) => void;
  fallbackFocus: () => HTMLElement | null;
  /**
   * Pages of this file already in the list (Organize's "From a loaded file", spec F4/F5 §3e): marked
   * "in use", not disabled, since a second copy is allowed.
   */
  inUse?: ReadonlySet<number>;
}) {
  const labels: PickerLabels = labelsIn ?? {
    title: c.pickerTitle(fileName),
    help: c.pickerHelp(where),
    selectAll: c.selectAll,
    selectNone: c.selectNone,
    ofSelected: c.ofSelected,
    add: c.addCount,
    atLeastOne: c.pickAtLeastOne,
    cancel: c.cancel,
    tileName: (label, page) => `${label}, page ${page} of ${fileName}`,
  };
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [anchor, setAnchor] = useState(0);
  const [active, setActive] = useState(0);
  const grid = useRef<HTMLDivElement>(null);
  const first = useRef<HTMLButtonElement>(null);
  const hintId = useId();
  useEffect(() => {
    if (open) {
      setSelected(new Set());
      setActive(0);
      setAnchor(0);
    }
  }, [open, fileId]);

  const range = (a: number, b: number) => new Set(Array.from({ length: Math.abs(b - a) + 1 }, (_, k) => Math.min(a, b) + k));
  const select = (i: number, how: { toggle: boolean; range: boolean }) => {
    setSelected((prev) => {
      if (how.range) return new Set([...(how.toggle ? prev : []), ...range(anchor, i)]);
      if (how.toggle) {
        const next = new Set(prev);
        if (next.has(i)) next.delete(i);
        else next.add(i);
        return next;
      }
      return new Set([i]);
    });
    if (!how.range) setAnchor(i);
  };
  const focus = (i: number) => {
    setActive(i);
    grid.current?.querySelectorAll<HTMLButtonElement>("[data-pick]")[i]?.focus();
  };
  function onKey(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const next = navTarget(e.key, i, pages.length, gridColumns(grid.current));
    if (next !== null) {
      e.preventDefault();
      if (e.shiftKey) select(next, { toggle: false, range: true });
      focus(next);
    } else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      select(i, { toggle: !e.shiftKey, range: e.shiftKey });
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
      e.preventDefault();
      setSelected(new Set(pages.map((_, k) => k)));
    }
  }

  const count = selected.size;
  return (
    <Dialog
      open={open}
      wide
      onClose={onCancel}
      title={labels.title}
      description={labels.help}
      initialFocusRef={first}
      fallbackFocus={fallbackFocus}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            {labels.cancel}
          </Button>
          <Button variant="primary" disabled={count === 0} aria-describedby={count === 0 ? hintId : undefined} onClick={() => onConfirm([...selected].sort((a, b) => a - b))} data-testid="picker-confirm">
            {labels.add(count)}
          </Button>
        </>
      }
    >
      <div className="flex h-11 flex-wrap items-center gap-2">
        <Button
          variant="soft"
          onClick={() => {
            setSelected(new Set(pages.map((_, k) => k)));
            announce(labels.ofSelected(pages.length, pages.length));
          }}
        >
          {labels.selectAll}
        </Button>
        <Button
          variant="plain"
          onClick={() => {
            setSelected(new Set());
            announce(labels.ofSelected(0, pages.length));
          }}
        >
          {labels.selectNone}
        </Button>
        <span className="ms-auto font-display text-[15px] font-semibold text-brand-strong tabular-nums">{labels.ofSelected(count, pages.length)}</span>
      </div>
      <p id={hintId} className={cx("text-help text-muted", count > 0 && "invisible")}>
        {labels.atLeastOne}
      </p>
      <div className="max-h-[min(50dvh,480px)] min-h-[132px] overflow-y-auto overscroll-contain rounded-tray border-[1.5px] border-sand bg-cream p-3" data-ip-scroll="overlay">
        <div ref={grid} role="list" className="mp-rise-tiles grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,144px)]" data-testid="picker-grid">
          {pages.map((size, i) => {
            const on = selected.has(i);
            const label = `${letter}${i + 1}`;
            const used = !!inUse?.has(i);
            return (
              <div key={i} role="listitem" className="ip-tile flex flex-col items-center gap-1.5" data-selected={on || undefined}>
                <div className="relative grid aspect-(--ip-tile-aspect) w-full place-items-center">
                  <span className="relative block overflow-hidden bg-paper shadow-paper" style={pageBoxStyle(size)}>
                    <PageThumb fileId={fileId} index={i} />
                  </span>
                  <button
                    ref={i === 0 ? first : undefined}
                    type="button"
                    data-pick=""
                    tabIndex={i === active ? 0 : -1}
                    aria-pressed={on}
                    aria-label={used ? `${labels.tileName(label, i + 1)}, ${c.inUse.toLowerCase()}` : labels.tileName(label, i + 1)}
                    data-in-use={used || undefined}
                    onFocus={() => setActive(i)}
                    onClick={(e) => {
                      if (e.detail === 0) return;
                      select(i, { toggle: e.ctrlKey || e.metaKey, range: e.shiftKey });
                    }}
                    onKeyDown={(e) => onKey(e, i)}
                    className="absolute inset-0 rounded-[10px] focus-visible:outline-offset-1"
                    data-testid="picker-tile"
                  />
                  {used && (
                    <span aria-hidden="true" className="pointer-events-none absolute top-1 left-1 rounded-pill bg-surface-raised px-2 py-0.5 font-display text-help font-semibold text-muted shadow-menu" data-testid="in-use">
                      {c.inUse}
                    </span>
                  )}
                  <span
                    aria-hidden="true"
                    onClick={() => select(i, { toggle: true, range: false })}
                    className="absolute -top-1.5 -right-1.5 grid size-7 cursor-pointer place-items-center"
                  >
                    {on ? (
                      <span className="mp-tick-in grid size-[22px] place-items-center rounded-full bg-leaf text-white ring-2 ring-white">
                        <CheckIcon size={14} />
                      </span>
                    ) : (
                      <span className="size-[22px] rounded-full border-[1.5px] border-field-line bg-surface-raised shadow-menu" />
                    )}
                  </span>
                </div>
                <span aria-hidden="true" className="ip-tile__n tabular-nums">
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </Dialog>
  );
}

export type MoveLabels = { title: string; now: string; field: string; error: string; cancel: string; move: string };

/** "Move to position" (spec F3 §3c, AC-24): invalid input keeps the dialog open and moves nothing. */
export function MoveToPositionDialog({
  open,
  current,
  total,
  subject,
  labels: labelsIn,
  onMove,
  onCancel,
  fallbackFocus,
}: {
  open: boolean;
  current: number;
  total: number;
  subject: string;
  labels?: MoveLabels;
  onMove: (position: number) => void;
  onCancel: () => void;
  fallbackFocus: () => HTMLElement | null;
}) {
  const labels: MoveLabels = labelsIn ?? { title: c.moveTitle(subject), now: c.moveNow(current, total), field: c.moveField(total), error: c.moveError(total), cancel: c.cancel, move: c.move };
  const input = useRef<HTMLInputElement>(null);
  // Live (eval G-3): Move and Enter read the number as typed, even before React shows it.
  const [value, setValue, valueLive] = useLiveState(String(current));
  const [invalid, setInvalid] = useState(false);
  const [shake, setShake] = useState(0);
  const errorId = useId();
  const fieldId = useId();
  useEffect(() => {
    if (!open) return;
    setValue(String(current));
    setInvalid(false);
    requestAnimationFrame(() => input.current?.select());
  }, [open, current, setValue]);
  const submit = () => {
    const typed = valueLive.current;
    const n = /^\s*\d+\s*$/.test(typed) ? Number(typed) : NaN;
    if (!Number.isInteger(n) || n < 1 || n > total) {
      setInvalid(true);
      setShake((k) => k + 1);
      input.current?.focus();
      input.current?.select();
      return;
    }
    onMove(n);
  };
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={labels.title}
      description={labels.now}
      initialFocusRef={input}
      fallbackFocus={fallbackFocus}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            {labels.cancel}
          </Button>
          <Button variant="primary" onClick={submit} data-testid="move-confirm">
            {labels.move}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex flex-col gap-1.5"
      >
        <label htmlFor={fieldId} className="text-sm font-semibold text-ink">
          {labels.field}
        </label>
        <input
          key={shake}
          ref={input}
          id={fieldId}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          enterKeyHint="done"
          value={value}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
          onChange={(e) => {
            setValue(e.target.value);
            setInvalid(false);
          }}
          className={cx(
            "ip-field h-11 px-3.5 tabular-nums",
            invalid && shake > 0 && "ip-shake",
          )}
          data-testid="move-input"
        />
        <p id={errorId} role={invalid ? "alert" : undefined} className={cx("flex min-h-5 items-center gap-1 text-sm font-semibold text-danger", !invalid && "invisible")}>
          <AlertIcon size={16} />
          {labels.error}
        </p>
      </form>
    </Dialog>
  );
}

export type ConfirmLabels = { title: string; body: string; cancel: string; onlyThis: string; all: string };

/** Remove one page while others are selected (spec F3 §3c, AC-26). "Only this page" has focus. */
export function RemoveSelectedDialog({
  open,
  pageLabel,
  count,
  labels: labelsIn,
  onOnlyThis,
  onAll,
  onCancel,
  fallbackFocus,
}: {
  open: boolean;
  pageLabel: string;
  count: number;
  labels?: ConfirmLabels;
  onOnlyThis: () => void;
  onAll: () => void;
  onCancel: () => void;
  fallbackFocus: () => HTMLElement | null;
}) {
  const labels: ConfirmLabels = labelsIn ?? { title: c.confirmTitle, body: c.confirmBody(pageLabel, count), cancel: c.cancel, onlyThis: c.onlyThis, all: c.removeAll(count) };
  const only = useRef<HTMLButtonElement>(null);
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={labels.title}
      description={labels.body}
      initialFocusRef={only}
      fallbackFocus={fallbackFocus}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            {labels.cancel}
          </Button>
          <Button ref={only} variant="secondary" onClick={onOnlyThis}>
            {labels.onlyThis}
          </Button>
          <Button variant="primary" onClick={onAll}>
            {labels.all}
          </Button>
        </>
      }
    />
  );
}
