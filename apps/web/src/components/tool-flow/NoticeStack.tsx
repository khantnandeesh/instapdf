"use client";
import { useState } from "react";
import { Notice, type NoticeTone } from "../ui/Notice";

export type FlowNotice = { id: string; tone: NoticeTone; title: string; items?: string[] };

/**
 * Floating notices above the dock (never in the document flow, so they never
 * move content). Newest first, three visible, the rest behind "+N more".
 * Errors never auto-dismiss.
 */
export function NoticeStack({ notices, onDismiss }: { notices: FlowNotice[]; onDismiss: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const ordered = [...notices].reverse();
  const visible = expanded ? ordered : ordered.slice(0, 3);
  const hidden = ordered.length - visible.length;
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--ip-dock-actual,var(--ip-dock-h))+12px)] z-30 flex justify-center px-4 lg:bottom-6 lg:justify-start lg:px-8 xl:left-[max(0px,calc((100vw-1280px)/2))]"
      onKeyDown={(e) => {
        if (e.key === "Escape" && expanded) setExpanded(false);
      }}
    >
      <div className="pointer-events-auto flex max-h-[60dvh] w-[min(480px,calc(100vw-32px))] flex-col gap-2 overflow-y-auto">
        {visible.map((n) => (
          <div key={n.id} className="ip-settle shadow-lg">
            <Notice tone={n.tone} title={n.title} onDismiss={() => onDismiss(n.id)}>
              {n.items && n.items.length > 0 && <NoticeItems items={n.items} />}
            </Notice>
          </div>
        ))}
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="self-start rounded-md bg-surface-raised px-3 py-2 text-sm font-medium text-primary shadow-md"
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
        <button type="button" className="mt-1 font-medium text-primary underline" onClick={() => setOpen(true)}>
          Show {items.length - 3} more
        </button>
      )}
    </>
  );
}
