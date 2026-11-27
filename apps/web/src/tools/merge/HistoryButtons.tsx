"use client";
import { RedoIcon, UndoIcon } from "@/components/ui/page-tool-icons";
import { mergeCopy as c } from "./copy";

/**
 * Undo│Redo (spec F4/F5 P-3, P-8, I-10; F25 §3.4): 44 px icons with their names as tooltips; Organize
 * shows the labels from 1280 px (`labels="xl"`), Merge and Combine keep icons at every width.
 */
export function HistoryButtons({ canUndo, canRedo, onUndo, onRedo, labels }: { canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void; labels?: "xl" }) {
  const cls = `mp-btn mp-btn--tool h-11 shrink-0 gap-1.5 ${labels ? "max-xl:w-11 max-xl:px-0" : "w-11 px-0"}`;
  const label = labels ? "max-xl:sr-only" : "sr-only";
  return (
    <div role="group" aria-label="History" className="mp-toolbar shadow-none" data-testid="history">
      <button type="button" className={cls} aria-disabled={!canUndo || undefined} aria-keyshortcuts="Control+Z Meta+Z" title={c.undo} onClick={() => canUndo && onUndo()} data-testid="undo">
        <UndoIcon size={18} />
        <span className={label}>{c.undo}</span>
      </button>
      <button
        type="button"
        className={cls}
        aria-disabled={!canRedo || undefined}
        aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z Control+Y"
        title="Redo"
        onClick={() => canRedo && onRedo()}
        data-testid="redo"
      >
        <RedoIcon size={18} />
        <span className={label}>Redo</span>
      </button>
    </div>
  );
}
