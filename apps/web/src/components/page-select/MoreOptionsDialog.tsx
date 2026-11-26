"use client";
import "../ui/dialog.css";
import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Switch } from "../ui/Switch";
import { dialogCopy } from "./dialog-copy";

/** One output of Split, as the parts list shows it. */
export type PartRow = { key: string; n: number; name: string; range: string };

/** What the dialog holds per tool (spec F4/F5 UI P-4): Split all three, Extract the pattern and bookmarks, Delete bookmarks. */
export type MoreOptionsContent = {
  parts?: { rows: PartRow[]; onRename: (key: string, name: string) => void };
  pattern?: { value: string; onChange: (value: string) => void };
  bookmarks: { value: boolean; onChange: (value: boolean) => void };
};

/** Below 640 px the dialog is a bottom sheet. */
function usePhone(): boolean {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const on = () => setPhone(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return phone;
}

export function MoreOptionsDialog({ open, onClose, returnFocusRef, content }: { open: boolean; onClose: () => void; returnFocusRef: RefObject<HTMLElement | null>; content: MoreOptionsContent }) {
  const phone = usePhone();
  const id = useId();
  const tipId = `${id}-tip`;
  // Changes apply at once; Done, Escape and the backdrop only close it.
  return (
    <Dialog
      open={open}
      variant={phone ? "sheet" : "default"}
      className={phone ? undefined : "w-[min(440px,calc(100vw-32px))]"}
      title={dialogCopy.title}
      onClose={onClose}
      onCloseButton={onClose}
      closeOnBackdrop
      returnFocusRef={returnFocusRef}
      footer={
        <Button variant="primary" className={phone ? "flex-1" : undefined} onClick={onClose}>
          {dialogCopy.done}
        </Button>
      }
    >
      <div className="flex flex-col gap-5" data-testid="more-options-dialog">
        {content.parts && <PartsList rows={content.parts.rows} onRename={content.parts.onRename} />}
        {content.pattern && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-pattern`} className="text-sm font-semibold text-ink">
              {dialogCopy.namePattern}
            </label>
            <input
              id={`${id}-pattern`}
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={content.pattern.value}
              title={dialogCopy.namePatternTip}
              aria-describedby={tipId}
              onChange={(e) => content.pattern!.onChange(e.target.value)}
              className="ip-field h-11 w-full px-3.5 text-[15px]"
            />
            <span id={tipId} className="sr-only">
              {dialogCopy.namePatternTip}
            </span>
          </div>
        )}
        <Switch id={`${id}-bookmarks`} label={dialogCopy.removeBookmarks} checked={content.bookmarks.value} onChange={content.bookmarks.onChange} />
      </div>
    </Dialog>
  );
}

const ROW_H = 44;
const OVERSCAN = 8;
const VIRTUAL_FROM = 50;

/**
 * Split's outputs: number disc, name (a button that turns into a field: Enter saves, Escape
 * cancels without closing the dialog), ".pdf" and the page range. Above 50 rows only the rows in
 * view of the dialog's own scroller are drawn (no nested scroller).
 */
function PartsList({ rows, onRename }: { rows: PartRow[]; onRename: (key: string, name: string) => void }) {
  const list = useRef<HTMLOListElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  // A soft fade at an edge while there is more that way (tool-flow.css .ip-edge-fade), like the Page tools sheet.
  useLayoutEffect(() => {
    const s = scroller.current;
    if (!s) return;
    const edges = () => {
      s.toggleAttribute("data-more-up", s.scrollTop > 1);
      s.toggleAttribute("data-more-down", s.scrollTop + s.clientHeight < s.scrollHeight - 1);
    };
    edges();
    s.addEventListener("scroll", edges, { passive: true });
    const ro = new ResizeObserver(edges);
    ro.observe(s);
    return () => {
      s.removeEventListener("scroll", edges);
      ro.disconnect();
    };
  }, [rows.length]);
  const [win, setWin] = useState<[number, number]>([0, Math.min(rows.length, VIRTUAL_FROM)]);
  const virtual = rows.length > VIRTUAL_FROM;
  useLayoutEffect(() => {
    if (!virtual) return;
    const el = list.current;
    const scroller = el?.closest<HTMLElement>('[data-ip-scroll="overlay"]');
    if (!el || !scroller) return;
    const update = () => {
      const top = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
      const from = Math.max(0, Math.floor((scroller.scrollTop - top) / ROW_H) - OVERSCAN);
      const to = Math.min(rows.length, Math.ceil((scroller.scrollTop - top + scroller.clientHeight) / ROW_H) + OVERSCAN);
      setWin((w) => (w[0] === from && w[1] === to ? w : [from, Math.max(from, to)]));
    };
    update();
    scroller.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(scroller);
    return () => {
      scroller.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [virtual, rows.length]);
  const [from, to] = virtual ? win : [0, rows.length];
  return (
    <section aria-labelledby="ip-parts-title">
      <h3 id="ip-parts-title" className="mb-1.5 text-sm font-semibold text-ink">
        {dialogCopy.files} <span className="text-muted tabular-nums">{rows.length.toLocaleString("en")}</span>
      </h3>
      {/* About five rows, then the list scrolls inside, so the name pattern, bookmarks and Done stay in view.
          In the phone sheet the cap also follows the screen height (the sheet is --ip-sheet-max-h tall; its title
          row, footer, padding, Files heading, pattern and bookmarks take about 335px), so the sheet body never
          scrolls around the list: only the list scrolls (visual gate round 2). Two rows at least; an edge fades
          while there is more that way (round 3). */}
      <div
        ref={scroller}
        className="ip-edge-fade ip-parts-scroller overflow-y-auto overscroll-contain"
        data-ip-scroll="overlay"
        data-testid="parts-scroller"
      >
        <ol
          ref={list}
          className="relative"
          data-testid="parts-list"
          // The full height is kept so the scroll bar is true; only the rows in view are drawn.
          style={virtual ? { height: rows.length * ROW_H } : undefined}
        >
          {rows.slice(from, to).map((r, i) => (
            <PartRowItem key={r.key} row={r} onRename={onRename} top={virtual ? (from + i) * ROW_H : undefined} />
          ))}
        </ol>
      </div>
    </section>
  );
}

function stemOf(name: string) {
  return name.replace(/\.pdf$/i, "");
}

function PartRowItem({ row, onRename, top }: { row: PartRow; onRename: (key: string, name: string) => void; top?: number }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(stemOf(row.name));
  const field = useRef<HTMLInputElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const cancelled = useRef(false);
  useEffect(() => {
    if (editing) {
      field.current?.focus();
      field.current?.select();
    }
  }, [editing]);
  const finish = (save: boolean) => {
    setEditing(false);
    if (save) {
      const v = text.trim();
      if (v && v !== stemOf(row.name)) onRename(row.key, v);
    } else setText(stemOf(row.name));
    requestAnimationFrame(() => button.current?.focus());
  };
  return (
    <li
      className="flex h-11 items-center gap-2.5 text-[15px] tabular-nums"
      style={top !== undefined ? { position: "absolute", top, left: 0, right: 0 } : undefined}
      data-testid="part-row"
    >
      <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-soft font-display text-[13px] font-semibold text-brand-strong">
        {row.n}
      </span>
      <span className="flex min-w-0 flex-1 items-center">
        {editing ? (
          <input
            ref={field}
            value={text}
            aria-label={dialogCopy.rename(row.name)}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                finish(true);
              } else if (e.key === "Escape") {
                // Cancels the rename only: the dialog stays open.
                e.preventDefault();
                e.stopPropagation();
                cancelled.current = true;
                finish(false);
              }
            }}
            onBlur={() => {
              if (cancelled.current) cancelled.current = false;
              else if (editing) finish(true);
            }}
            className="ip-field h-9 min-w-0 flex-1 px-2 text-[15px]"
          />
        ) : (
          <button
            ref={button}
            type="button"
            className="min-w-0 truncate rounded-sm text-start text-ink underline-offset-4 hover:text-brand-strong hover:underline"
            title={row.name}
            aria-label={dialogCopy.rename(row.name)}
            onClick={() => setEditing(true)}
          >
            {stemOf(row.name)}
          </button>
        )}
        <span className="shrink-0 text-muted">.pdf</span>
      </span>
      <span className="shrink-0 text-sm text-muted">{row.range}</span>
    </li>
  );
}
