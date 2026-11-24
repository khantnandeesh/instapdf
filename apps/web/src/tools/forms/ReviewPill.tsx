"use client";
/** Detect fields: progress while it runs, then the review pill (U-F5, AC-250). */
import { memo } from "react";
import "./forms.css";

export type DetectStatus =
  | { phase: "idle" }
  | { phase: "running"; done: number; total: number }
  | { phase: "review"; count: number; pages: number; index: number }
  | { phase: "none" };

export type ReviewPillProps = {
  status: DetectStatus;
  onCancel: () => void;
  onPrev: () => void;
  onNext: () => void;
  onAcceptAll: () => void;
  onDiscard: () => void;
};

export const ReviewPill = memo(function ReviewPill({ status, onCancel, onPrev, onNext, onAcceptAll, onDiscard }: ReviewPillProps) {
  if (status.phase === "idle") return null;
  return (
    <div className="bf-pill" role="status" aria-live="polite">
      {status.phase === "running" && (
        <>
          <span className="bf-ring" style={{ ["--p" as string]: `${Math.round((status.done / Math.max(1, status.total)) * 100)}%` }} aria-hidden />
          <span className="bf-pill-text">
            Page {Math.min(status.total, status.done + 1)} of {status.total}
          </span>
          <button type="button" className="bf-pill-btn" onClick={onCancel} aria-label="Stop detecting">
            <svg viewBox="0 0 16 16" aria-hidden><path d="M4 4l8 8M12 4l-8 8" /></svg>
          </button>
        </>
      )}
      {status.phase === "review" && (
        <>
          <button type="button" className="bf-pill-btn" onClick={onPrev} aria-label="Previous field">
            <svg viewBox="0 0 16 16" aria-hidden><path d="M10 3L5 8l5 5" /></svg>
          </button>
          <span className="bf-pill-text">
            {status.count} {status.count === 1 ? "field" : "fields"} on {status.pages} {status.pages === 1 ? "page" : "pages"}
          </span>
          <button type="button" className="bf-pill-btn" onClick={onNext} aria-label="Next field">
            <svg viewBox="0 0 16 16" aria-hidden><path d="M6 3l5 5-5 5" /></svg>
          </button>
          <button type="button" className="bf-pill-soft" onClick={onDiscard}>
            Discard
          </button>
          <button type="button" className="bf-pill-main" onClick={onAcceptAll}>
            Add all
          </button>
        </>
      )}
      {status.phase === "none" && <span className="bf-pill-text">No new fields found</span>}
    </div>
  );
});
