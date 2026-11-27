"use client";
import "./layout.css";
import { forwardRef, type ReactNode, type Ref } from "react";
import { cx } from "../ui/cx";
import { CheckIcon, ErrorIcon } from "../ui/icons";
import type { PillProgress } from "./announce";
import { slotCopy } from "./slot-copy";

/**
 * The action slot (F25 §3, §6): the one place the action lives on every tool and in every state. A box
 * that never changes size (340 × 48 from 1280px, 300 × 48 from 1024px, the dock row below 1024px, the
 * editor's 220px): at rest the status and the berry primary; while working the progress pill; on an error
 * the short danger line and "Try again"; on the result Download. `kind` sizes it.
 */
export function ActionSlot({ kind = "tool", children, className }: { kind?: "tool" | "editor"; children: ReactNode; className?: string }) {
  return (
    <div className={cx("ip-slot", kind === "editor" && "ip-slot--editor", className)} data-testid="action-slot">
      {children}
    </div>
  );
}

/** At rest: the status line (one line, its full text as a tooltip) before the primary. */
export function SlotStatus({ id, text, extra }: { id: string; text: string; extra?: string }) {
  const full = extra ? `${text} · ${extra}` : text;
  return (
    <p id={id} className="ip-slot__status" title={full} data-testid="dock-status">
      {full}
    </p>
  );
}

export type PillState = PillProgress & {
  /** "Deleting", "Merging", "Downloading"… from the registry (`progressLabel`). */
  verb: string;
  /** Overrides the label ("Preparing fonts…"): the bar glides. */
  note?: string;
};

/**
 * The progress pill (F25 §6): a ring spinner (the queue position in its place while waiting in line;
 * a leaf tick when done), "Deleting… 42%", an optional second line for the server phases, Cancel, and a
 * 6px jam bar along the bottom edge. A `role="group"` named after the action, holding the progressbar.
 * It takes focus when a run starts; Tab reaches Cancel; Escape on it cancels.
 */
export const ProgressPill = forwardRef(function ProgressPill(
  { state, action, onCancel }: { state: PillState; action: string; onCancel?: () => void },
  ref: Ref<HTMLDivElement>,
) {
  const { phase, fraction, position, etaSeconds, verb, note } = state;
  const pct = typeof fraction === "number" ? Math.max(0, Math.min(100, Math.round(fraction * 100))) : null;
  const determinate = pct !== null && !note && phase !== "queue";
  const minutes = typeof etaSeconds === "number" && etaSeconds > 0 ? Math.max(1, Math.round(etaSeconds / 60)) : undefined;
  const label =
    phase === "done"
      ? slotCopy.done
      : phase === "queue"
        ? slotCopy.inLine
        : note ?? (phase === "upload" ? slotCopy.progress(slotCopy.uploading, pct ?? 0) : pct === null ? `${verb}…` : slotCopy.progress(verb, pct));
  const second = phase === "upload" ? slotCopy.keepTabOpen : phase === "queue" ? (minutes ? slotCopy.queueEta(minutes) : slotCopy.keepTabOpen) : null;
  const valueText = phase === "queue" && position ? slotCopy.queueText(position, minutes) : determinate ? `${pct}%` : undefined;
  return (
    <div
      ref={ref}
      role="group"
      aria-label={slotCopy.pillGroup(action)}
      tabIndex={-1}
      className="ip-pill"
      data-testid="processing"
      data-progress={phase}
      onKeyDown={(e) => {
        if (e.key === "Escape" && onCancel && phase !== "done") {
          e.preventDefault();
          e.stopPropagation();
          onCancel();
        }
      }}
    >
      <span className="ip-pill__lead" aria-hidden="true">
        {phase === "done" ? (
          <span className="ip-pill__tick">
            <CheckIcon size={14} />
          </span>
        ) : phase === "queue" && position ? (
          <span className="ip-pill__pos" data-testid="queue-position">
            #{position}
          </span>
        ) : (
          <span className="ip-pill__spin" data-testid="pill-spinner" />
        )}
      </span>
      <span className="ip-pill__text">
        {/* A new node per text: Chrome counts an in-place text change in a clipped line as a layout shift. */}
        <span key={label} className="ip-pill__label">
          {label}
        </span>
        {second && <span className="ip-pill__second">{second}</span>}
      </span>
      {/* At done Cancel keeps its box, hidden, so "Done" doesn't reflow the pill (no layout shift). */}
      {onCancel &&
        (phase !== "done" ? (
          <button type="button" className="ip-pill__cancel" onClick={onCancel} data-testid="cancel">
            <span className="ip-pill__cancel-text">{slotCopy.cancel}</span>
            {/* A phone's tight slot (layout.css, .ip-slot--beside): an × with the word kept as its name. */}
            <svg className="ip-pill__cancel-x" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        ) : (
          <span className="ip-pill__cancel invisible" aria-hidden="true">
            <span className="ip-pill__cancel-text">{slotCopy.cancel}</span>
          </span>
        ))}
      {phase !== "done" && (
        <span
          role="progressbar"
          aria-label={note ?? (phase === "upload" ? slotCopy.uploading : verb)}
          aria-valuemin={determinate ? 0 : undefined}
          aria-valuemax={determinate ? 100 : undefined}
          aria-valuenow={determinate ? pct! : undefined}
          aria-valuetext={valueText}
          className={cx("ip-pill__bar", !determinate && "ip-pill__bar--glide")}
          data-testid="pill-bar"
        >
          {/* The fill's scale is set after hydration through the CSSOM (never in server HTML). */}
          <i style={determinate ? { transform: `scaleX(${pct! / 100})` } : undefined} />
        </span>
      )}
    </div>
  );
});

/**
 * An error in the slot (F25 §6 "Errors"): a 20px danger icon and a short line (its full text is in
 * NoticeStack), the fixing tool when one is ready, and "Try again" in the primary's place.
 */
export const SlotError = forwardRef(function SlotError(
  { line, onRetry, fix }: { line: string; onRetry: () => void; fix?: { label: string; onClick: () => void } },
  ref: Ref<HTMLButtonElement>,
) {
  return (
    <div className="ip-slot__error" data-testid="process-error">
      <ErrorIcon size={20} className="shrink-0 text-danger" />
      <p className="ip-slot__errline" title={line}>
        {line}
      </p>
      {fix && (
        <button type="button" className="mp-btn mp-btn--line shrink-0" onClick={fix.onClick} data-testid="process-fix">
          {fix.label}
        </button>
      )}
      <button ref={ref} type="button" className="mp-btn ip-slot__main shrink-0" onClick={onRetry}>
        {slotCopy.tryAgain}
      </button>
    </div>
  );
});

/** The first sentence of an error, when it is short enough for the slot; otherwise the generic line. */
export function shortError(message: string): string {
  const first = message.split(/(?<=\.)\s/)[0] ?? "";
  return first && first.length <= 30 ? first : slotCopy.errorShort;
}
