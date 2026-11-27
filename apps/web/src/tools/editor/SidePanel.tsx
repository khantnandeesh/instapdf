"use client";
/**
 * Pages, Objects and History (U-E2 side panel ≥ 1024, Pages sheet < 1024).
 * - Pages: thumbnails (AC-8), the current one ringed; click goes to the page; ⋯ has the page
 *   actions; drag (or Alt+↑/↓) reorders (AC-80).
 * - Objects: every added object per page with its accessible name (AC-89).
 * - History: each change with its type, page and time; any set can be reverted at once (AC-73).
 */
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { MenuButton } from "@/components/ui/Menu";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import * as H from "@/lib/editor/history";
import { objectLabel, totalRotation, type PageEntry } from "@/lib/editor/model";
import { displaySize } from "@/lib/editor/geometry";
import { TabOrderTab } from "@/tools/forms/lazy";
import { TabOrderIcon } from "@/tools/forms/icons";
import { pageActions } from "./Chrome";
import { useCtl } from "./context";
import { HistoryBold, ListBold, MoreBold, PagesBold } from "./icons";
import { release, renderPage, swapCanvas } from "./render";
import { shallowArray, useStore } from "./store";

const THUMB_W = 100;

export function SidePanel({ onGo, onPicked, sheet }: { onGo: (i: number) => void; onPicked?: () => void; sheet?: boolean }) {
  const ctl = useCtl();
  const hasForm = useStore(ctl.store, (s) => !!H.current(s.history).forms?.fields.length);
  const picked = useStore(ctl.store, (s) => s.panelTab);
  const tab = picked === "fields" && !hasForm ? "pages" : picked;
  const all = [
    { id: "pages", label: "Pages", icon: <PagesBold size={16} /> },
    { id: "objects", label: "Objects", icon: <ListBold size={16} /> },
    { id: "fields", label: "Tab order", icon: <TabOrderIcon size={16} /> },
    { id: "history", label: "History", icon: <HistoryBold size={16} /> },
  ] as const;
  // Tab order shows once the file has fields (U-F6); phones get it as a sheet from the Form tool.
  const tabs = all.filter((t) => t.id !== "fields" || (hasForm && !sheet));
  return (
    <div className={cx("ed-side", sheet && "ed-side--sheet")}>
      <div role="tablist" aria-label="Panel" className="ed-tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`ed-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`ed-tabpanel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            title={t.label}
            className={cx("ed-tab", tab === t.id && "ed-tab--on")}
            onClick={() => ctl.store.set({ panelTab: t.id })}
            onKeyDown={(e) => {
              const i = tabs.findIndex((x) => x.id === tab);
              const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
              if (!d) return;
              e.preventDefault();
              const next = tabs[(i + d + tabs.length) % tabs.length];
              ctl.store.set({ panelTab: next.id });
              document.getElementById(`ed-tab-${next.id}`)?.focus();
            }}
          >
            {t.icon}
            <span className={cx(!sheet && "sr-only")}>{t.label}</span>
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`ed-tabpanel-${tab}`} aria-labelledby={`ed-tab-${tab}`} className="ed-side__body ed-scroll" data-ip-scroll={sheet ? undefined : "rail"}>
        {tab === "pages" && <Thumbs onGo={(i) => (onGo(i), onPicked?.())} sheet={sheet} />}
        {tab === "objects" && <Objects onPicked={onPicked} />}
        {tab === "history" && <HistoryList />}
        {tab === "fields" && <TabOrderTab />}
      </div>
    </div>
  );
}

function Thumbs({ onGo, sheet }: { onGo: (i: number) => void; sheet?: boolean }) {
  const ctl = useCtl();
  const pages = useStore(ctl.store, (s) => H.current(s.history).pages, shallowArray);
  const current = useStore(ctl.store, (s) => s.current);
  const list = useRef<HTMLUListElement>(null);
  const [drag, setDrag] = useState<{ id: string; over: number } | null>(null);

  // Keep the current page's thumbnail in view while the canvas scrolls (AC-80).
  useEffect(() => {
    const el = list.current?.querySelector<HTMLElement>(`[data-thumb="${current}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [current]);

  return (
    <ul ref={list} aria-label="Pages" className={cx("ed-thumbs", sheet && "ed-thumbs--grid")} data-testid="thumbs">
      {pages.map((p, i) => (
        <Thumb
          key={p.id}
          entry={p}
          index={i}
          total={pages.length}
          current={i === current}
          dropBefore={drag?.over === i && drag.id !== p.id}
          onGo={onGo}
          onDragStart={() => setDrag({ id: p.id, over: i })}
          onDragOver={() => setDrag((d) => (d ? { ...d, over: i } : d))}
          onDrop={() => {
            if (drag) ctl.movePage(drag.id, i > pages.findIndex((x) => x.id === drag.id) ? i : i);
            setDrag(null);
          }}
          onDragEnd={() => setDrag(null)}
        />
      ))}
    </ul>
  );
}

const Thumb = memo(function Thumb({
  entry,
  index,
  total,
  current,
  dropBefore,
  onGo,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  entry: PageEntry;
  index: number;
  total: number;
  current: boolean;
  dropBefore: boolean;
  onGo: (i: number) => void;
  onDragStart: () => void;
  onDragOver: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
}) {
  const ctl = useCtl();
  const holder = useRef<HTMLSpanElement>(null);
  const box = useRef<HTMLLIElement>(null);
  const [visible, setVisible] = useState(false);
  const pdfRev = useStore(ctl.store, (s) => s.pdfRev);
  const rev = useStore(ctl.store, useCallback((s) => (entry.src != null ? (s.rasterRev[entry.src] ?? 0) : 0), [entry.src]));
  const rotation = totalRotation(entry);
  const scale = THUMB_W / Math.max(1, displaySize(entry.view, rotation, 1).width);
  const size = displaySize(entry.view, rotation, scale);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    // Measured against the region that scrolls: the rail, or the phone sheet's body (the list
    // itself grows with its content).
    const root = el.closest<HTMLElement>("[data-ip-scroll]");
    // Near: draw. Far (several screens away): release the canvas (iOS memory).
    const near = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), { root, rootMargin: "300px 0px" });
    const far = new IntersectionObserver(([e]) => !e.isIntersecting && setVisible(false), { root, rootMargin: "1500px 0px" });
    near.observe(el);
    far.observe(el);
    return () => {
      near.disconnect();
      far.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!visible) {
      const el = holder.current;
      if (el?.firstChild) swapCanvas(el, null);
      return;
    }
    if (entry.src == null) return;
    const job = renderPage(ctl.rt.pdf, entry.src, scale, rotation, 1000 + index);
    void job.promise.then((c) => {
      if (c && c !== "failed" && holder.current) {
        c.className = "ed-thumb__canvas";
        swapCanvas(holder.current, c);
      } else if (c && c !== "failed") release(c);
    });
    return () => job.cancel();
  }, [visible, entry.src, scale, rotation, ctl, index, pdfRev, rev]);

  return (
    <li
      ref={box}
      className={cx("ed-thumb", current && "ed-thumb--current", dropBefore && "ed-thumb--drop")}
      data-thumb={index}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/x-berry-page", entry.id);
        onDragStart();
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("text/x-berry-page")) return;
        e.preventDefault();
        onDragOver();
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes("text/x-berry-page")) return;
        e.preventDefault();
        e.stopPropagation();
        onDrop();
      }}
      onDragEnd={onDragEnd}
    >
      <button
        type="button"
        aria-current={current ? "page" : undefined}
        aria-label={`Page ${index + 1} of ${total}`}
        aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
        className="ed-thumb__btn"
        onClick={() => onGo(index)}
        onKeyDown={(e) => {
          if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
            e.preventDefault();
            e.stopPropagation();
            ctl.movePage(entry.id, index + (e.key === "ArrowUp" ? -1 : 1));
          }
        }}
      >
        <span ref={holder} className="ed-thumb__img" style={{ width: size.width, height: size.height }} aria-hidden="true" data-thumb-img />
        <span className="ed-thumb__n" aria-hidden="true">
          {index + 1}
        </span>
      </button>
      <MenuButton label={`Page ${index + 1} actions`} items={pageActions(ctl, entry.id, total, index)} className="ed-thumb__more" placement="bottom-end">
        <MoreBold size={16} />
      </MenuButton>
    </li>
  );
});

function Objects({ onPicked }: { onPicked?: () => void }) {
  const ctl = useCtl();
  const doc = useStore(ctl.store, (s) => H.current(s.history));
  const selection = useStore(ctl.store, (s) => s.selection, shallowArray);
  const groups = doc.pages.map((p, i) => ({ p, i, objs: doc.objects.filter((o) => o.page === p.id) })).filter((g) => g.objs.length);
  if (!groups.length) return <p className="px-3 py-6 text-center text-sm text-muted">Nothing added yet</p>;
  return (
    <div className="flex flex-col gap-3" data-testid="object-list">
      {groups.map((g) => (
        <section key={g.p.id} aria-label={`Page ${g.i + 1}`}>
          <h3 className="px-2 pb-1 text-help font-semibold text-muted">Page {g.i + 1}</h3>
          <ul className="flex flex-col">
            {g.objs.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  className={cx("ed-objrow", selection.includes(o.id) && "ed-objrow--on")}
                  aria-current={selection.includes(o.id) || undefined}
                  onClick={() => {
                    ctl.select([o.id], true);
                    store_set_current(ctl, g.i);
                    ctl.revealPage?.(g.p.id, o.id);
                    onPicked?.();
                    setTimeout(() => (document.querySelector(`[data-obj-id="${o.id}"]`) as HTMLElement | null)?.focus({ preventScroll: true }), 350);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Delete" || e.key === "Backspace") {
                      e.preventDefault();
                      e.stopPropagation();
                      ctl.remove([o.id]);
                    }
                  }}
                >
                  {objectLabel(o)}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function store_set_current(ctl: ReturnType<typeof useCtl>, i: number) {
  ctl.store.set({ current: i });
}

function HistoryList() {
  const ctl = useCtl();
  const history = useStore(ctl.store, (s) => s.history);
  const [picked, setPicked] = useState<number[]>([]);
  const pages = H.current(history).pages;
  const applied = history.entries.slice(0, history.index).map((e, i) => ({ e, i })).reverse();
  if (!applied.length) return <p className="px-3 py-6 text-center text-sm text-muted">No changes yet</p>;
  const time = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const pageNo = (id?: string) => {
    const i = pages.findIndex((p) => p.id === id);
    return i >= 0 ? `p. ${i + 1}` : "";
  };
  return (
    <div className="flex flex-col gap-2" data-testid="history-list">
      <ul className="flex flex-col">
        {applied.map(({ e, i }) => (
          <li key={i}>
            <label className="ed-objrow cursor-pointer">
              <input type="checkbox" checked={picked.includes(i)} onChange={(ev) => setPicked((p) => (ev.target.checked ? [...p, i] : p.filter((x) => x !== i)))} />
              <span className="min-w-0 flex-1 truncate">{e.label}</span>
              <span className="shrink-0 text-help text-muted tabular-nums">
                {pageNo(e.page)} {time(e.at)}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <Button
        variant="soft"
        className="mx-2"
        disabled={!picked.length}
        onClick={() => {
          void ctl.revert(picked);
          setPicked([]);
        }}
      >
        Revert {picked.length || ""} selected
      </Button>
    </div>
  );
}
