"use client";
import { RedoIcon, UndoIcon } from "@/components/ui/page-tool-icons";
import { mergeCopy as c } from "./copy";

/**
 * Undo│Redo (spec F4/F5 P-3, P-8, I-10; F25 §3.4): 44 px icons with their names as tooltips, the same on
 * every tool and at every width (one standard control; Organize no longer adds text labels from 1280 px).
 */
export function HistoryButtons({ canUndo, canRedo, onUndo, onRedo }: { canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void }) {
  const cls = "mp-btn mp-btn--tool h-11 w-11 shrink-0 px-0";
  const label = "sr-only";
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
