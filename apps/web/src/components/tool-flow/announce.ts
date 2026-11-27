import { slotCopy } from "./slot-copy";

/**
 * What the action pill says to screen readers while a job runs (F25 §6 "Screen readers"), as a pure
 * function so the throttle is unit-tested: every phase change; progress at most once per 10s and only
 * when it crosses the 25 / 50 / 75% marks; the queue position at most once per 30s, plus the moment it
 * reaches 1. "Done", errors and "Cancelled" are said by the flow itself, never throttled.
 */
export type PillPhase = "upload" | "queue" | "work" | "done";

export type PillProgress = {
  phase: PillPhase;
  /** 0..1 when known (upload, work); absent when the server sends no fraction. */
  fraction?: number;
  /** Queue position (1 = next). */
  position?: number;
  /** The server's estimate of the wait, when it sends one. */
  etaSeconds?: number;
};

export type AnnounceMemo = {
  phase?: PillPhase;
  /** The highest progress mark said in this phase (0, 25, 50 or 75). */
  mark: number;
  progressAt: number;
  queueAt: number;
  position?: number;
};

export type Announcement = { kind: "phase" } | { kind: "progress"; percent: number } | { kind: "queue"; position: number };

export const PROGRESS_EVERY_MS = 10_000;
export const QUEUE_EVERY_MS = 30_000;
const MARKS = [25, 50, 75];

export const freshMemo = (): AnnounceMemo => ({ mark: 0, progressAt: -Infinity, queueAt: -Infinity });

export function throttleAnnouncement(memo: AnnounceMemo, p: PillProgress, now: number): { say: Announcement | null; memo: AnnounceMemo } {
  if (p.phase !== memo.phase) {
    return { say: { kind: "phase" }, memo: { phase: p.phase, mark: 0, progressAt: now, queueAt: now, position: p.position } };
  }
  if (p.phase === "queue" && typeof p.position === "number" && p.position !== memo.position) {
    if (p.position === 1 || now - memo.queueAt >= QUEUE_EVERY_MS) return { say: { kind: "queue", position: p.position }, memo: { ...memo, queueAt: now, position: p.position } };
    return { say: null, memo };
  }
  if ((p.phase === "upload" || p.phase === "work") && typeof p.fraction === "number") {
    const percent = Math.floor(p.fraction * 100);
    const crossed = MARKS.filter((m) => m > memo.mark && percent >= m).pop();
    if (crossed && now - memo.progressAt >= PROGRESS_EVERY_MS) return { say: { kind: "progress", percent: crossed }, memo: { ...memo, mark: crossed, progressAt: now } };
  }
  return { say: null, memo };
}

/**
 * The words for one progress report, or null when the throttle says nothing now. `memo` null is a new
 * run (its first phase, work, is said by the flow itself as the run starts). `verb` is the tool's
 * progress label ("Deleting").
 */
export function announcementFor(memo: AnnounceMemo | null, p: PillProgress, now: number, verb: string): { text: string | null; memo: AnnounceMemo } {
  const { say, memo: next } = throttleAnnouncement(memo ?? { ...freshMemo(), phase: "work" }, p, now);
  let text: string | null = null;
  if (say?.kind === "queue") text = slotCopy.queueText(say.position);
  else if (say?.kind === "progress") text = `${p.phase === "upload" ? slotCopy.uploading : verb} ${say.percent}%`;
  else if (say && p.phase === "upload") text = slotCopy.uploading;
  else if (say && p.phase === "queue") text = p.position ? slotCopy.queueText(p.position) : slotCopy.inLine;
  else if (say && p.phase === "work") text = verb;
  return { text, memo: next };
}
