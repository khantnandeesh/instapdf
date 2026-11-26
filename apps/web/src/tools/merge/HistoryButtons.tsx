"use client";
import { RedoIcon, UndoIcon } from "@/components/ui/page-tool-icons";
import { mergeCopy as c } from "./copy";

/** Undo│Redo in the bottom bar (spec F4/F5 P-3, P-8, I-10): labels from 1024 px, 44 px icons below. */
export function HistoryButtons({ canUndo, canRedo, onUndo, onRedo }: { canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void }) {
  const cls = "mp-btn mp-btn--tool h-11 shrink-0 gap-1.5 max-lg:w-11 max-lg:px-0";
  return (
    <div role="group" aria-label="History" className="mp-toolbar" data-testid="history">
      <button type="button" className={cls} aria-disabled={!canUndo || undefined} aria-keyshortcuts="Control+Z Meta+Z" title={c.undo} onClick={() => canUndo && onUndo()} data-testid="undo">
        <UndoIcon size={18} />
        <span className="max-lg:sr-only">{c.undo}</span>
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
        <span className="max-lg:sr-only">Redo</span>
      </button>
    </div>
  );
}
