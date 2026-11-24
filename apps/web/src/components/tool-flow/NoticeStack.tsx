"use client";
import { useEffect, useRef, useState } from "react";
import { Notice } from "../ui/Notice";
import type { FlowNoticeInput } from "./types";

export type FlowNotice = FlowNoticeInput;

/**
 * Floating notices (never in the document flow, so they never move content), as BerryPDF
 * Alerts: top center, dropping in from above. Newest first, three visible, the rest behind
 * "+N more". Errors never auto-dismiss.
 */
export function NoticeStack({ notices, onDismiss }: { notices: FlowNotice[]; onDismiss: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const ordered = [...notices].reverse();
  const visible = expanded ? ordered : ordered.slice(0, 3);
  const hidden = ordered.length - visible.length;
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-3 z-30 flex justify-center px-4"
      onKeyDown={(e) => {
        if (e.key === "Escape" && expanded) setExpanded(false);
      }}
    >
      <div className="pointer-events-auto flex max-h-[60dvh] w-[min(520px,calc(100vw-32px))] flex-col items-stretch gap-2 overflow-y-auto">
        {visible.map((n) => (
          <TimedNotice key={n.id} notice={n} onDismiss={() => onDismiss(n.id)} />
        ))}
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="mp-btn mp-btn--outline mp-btn--sm self-center shadow-menu"
          >
            +{hidden} more
          </button>
        )}
      </div>
    </div>
  );
}

function NoticeItems({ items }: { items: string[] }) {
  const [open, setOpen] = useState(false);
  const shown = open ? items : items.slice(0, 3);
  return (
    <>
      <ul className="mt-1 space-y-1">
        {shown.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
      {items.length > 3 && !open && (
        <button type="button" className="mt-1 font-bold underline" onClick={() => setOpen(true)}>
          Show {items.length - 3} more
        </button>
      )}
    </>
  );
}

/**
 * One notice. With `timeoutMs` it dismisses itself, but the timer pauses
 * while the pointer is over it or focus is inside it (WCAG 2.2.1).
 */
function TimedNotice({ notice: n, onDismiss }: { notice: FlowNotice; onDismiss: () => void }) {
  const [paused, setPaused] = useState(false);
  const left = useRef(n.timeoutMs ?? 0);
  const expire = useRef(n.onExpire);
  expire.current = n.onExpire;
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  useEffect(() => {
    if (!n.timeoutMs || paused) return;
    const started = Date.now();
    const t = setTimeout(() => {
      expire.current?.();
      dismiss.current();
    }, left.current);
    return () => {
      clearTimeout(t);
      left.current -= Date.now() - started;
    };
  }, [n.timeoutMs, paused]);
  return (
    <div
      data-testid="notice"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPaused(false);
      }}
    >
      <Notice tone={n.tone} look="alert" title={n.title} onDismiss={onDismiss} action={n.action}>
        {n.body && <p>{n.body}</p>}
        {n.items && n.items.length > 0 && <NoticeItems items={n.items} />}
      </Notice>
    </div>
  );
}
