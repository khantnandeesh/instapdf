/**
 * Undo/redo history of editor states (AC-43, AC-73). Pure, unit tested.
 *
 * States are immutable snapshots (objects are shared between snapshots, so a step costs a few
 * pointers). Every entry names its change, the page it touched and when, for the tooltip, the
 * live region and the history panel. Reverting a set of entries is itself one undoable step.
 */
import type { DocState } from "./model";

export type Change = {
  /** Short description: "Add text", "Move signature", "Rotate page 2". */
  label: string;
  /** Page entry id the change happened on, if any. */
  page?: string;
  /** Object ids to reveal and flash after undo/redo. */
  targets?: string[];
  at: number;
  /** Merges consecutive changes with the same key (a burst of nudges, AC-88). */
  key?: string;
};

export type History = {
  /** states[i] is the state after entries[i - 1]; states[0] is the opened document. */
  states: DocState[];
  entries: Change[];
  /** Index into states of what is shown. */
  index: number;
};

export const MAX_STEPS = 500;
/** Changes with the same key within this window merge into one step. */
export const MERGE_MS = 1000;

export function createHistory(initial: DocState): History {
  return { states: [initial], entries: [], index: 0 };
}

export const current = (h: History) => h.states[h.index];
export const canUndo = (h: History) => h.index > 0;
export const canRedo = (h: History) => h.index < h.states.length - 1;
export const undoEntry = (h: History): Change | undefined => h.entries[h.index - 1];
export const redoEntry = (h: History): Change | undefined => h.entries[h.index];

/** Records a change. Drops any redo branch. Merges with the previous step when keys match and it is recent. */
export function commit(h: History, next: DocState, change: Change): History {
  if (next === current(h)) return h;
  const prev = h.entries[h.index - 1];
  if (change.key && prev?.key === change.key && change.at - prev.at <= MERGE_MS && h.index === h.states.length - 1) {
    const states = [...h.states.slice(0, h.index), next];
    const entries = [...h.entries.slice(0, h.index - 1), { ...prev, at: change.at }];
    return { states, entries, index: h.index };
  }
  let states = [...h.states.slice(0, h.index + 1), next];
  let entries = [...h.entries.slice(0, h.index), change];
  if (entries.length > MAX_STEPS) {
    const drop = entries.length - MAX_STEPS;
    states = states.slice(drop);
    entries = entries.slice(drop);
  }
  return { states, entries, index: states.length - 1 };
}

export function undo(h: History): History {
  return canUndo(h) ? { ...h, index: h.index - 1 } : h;
}

export function redo(h: History): History {
  return canRedo(h) ? { ...h, index: h.index + 1 } : h;
}

/** Replaces the shown state without recording a step (e.g. a text box's derived layout). */
export function replaceCurrent(h: History, next: DocState): History {
  const states = [...h.states];
  states[h.index] = next;
  return { ...h, states };
}

/**
 * Reverts the chosen applied entries (indexes into `entries`, all < index) at once, as one new
 * step. Object changes are reverted per object: each object touched by a reverted entry goes back
 * to how it was before the earliest reverted entry that touched it, unless a later kept entry
 * touched it too (then the later change wins and the object is left as it is). Page changes are
 * reverted the same way, per page.
 */
export function revertEntries(h: History, chosen: number[], at = Date.now()): History {
  const picks = [...new Set(chosen)].filter((i) => i >= 0 && i < h.index).sort((a, b) => a - b);
  if (!picks.length) return h;
  const now = current(h);
  const touched = (i: number) => diffIds(h.states[i], h.states[i + 1]);
  const keptLater = (id: string, after: number, kind: "objects" | "pages") => {
    for (let i = after + 1; i < h.index; i++) if (!picks.includes(i) && touched(i)[kind].has(id)) return true;
    return false;
  };
  let objects = [...now.objects];
  let pages = [...now.pages];
  const done = new Set<string>();
  for (const i of picks) {
    const before = h.states[i];
    const t = touched(i);
    for (const id of t.objects) {
      if (done.has(`o:${id}`) || keptLater(id, i, "objects")) continue;
      done.add(`o:${id}`);
      const old = before.objects.find((o) => o.id === id);
      const idx = objects.findIndex((o) => o.id === id);
      if (old && idx >= 0) objects[idx] = old;
      else if (old) objects.splice(Math.min(before.objects.indexOf(old), objects.length), 0, old);
      else if (idx >= 0) objects.splice(idx, 1);
    }
    for (const id of t.pages) {
      if (done.has(`p:${id}`) || keptLater(id, i, "pages")) continue;
      done.add(`p:${id}`);
      const old = before.pages.find((p) => p.id === id);
      const idx = pages.findIndex((p) => p.id === id);
      if (old && idx >= 0) pages[idx] = old;
      else if (old) pages.splice(Math.min(before.pages.indexOf(old), pages.length), 0, old);
      else if (idx >= 0) pages.splice(idx, 1);
    }
  }
  // Objects on pages that no longer exist go with them; a page never ends up empty of pages.
  if (!pages.length) pages = [...now.pages];
  const live = new Set(pages.map((p) => p.id));
  objects = objects.filter((o) => live.has(o.page));
  // Existing-text edits revert to the version before the earliest reverted text edit, if any.
  const engineEdits = picks.filter((i) => h.states[i].engine !== h.states[i + 1].engine);
  const engine = engineEdits.length ? h.states[engineEdits[0]].engine : now.engine;
  const next: DocState = { pages, objects, engine };
  return commit(h, next, { label: `Revert ${picks.length} change${picks.length === 1 ? "" : "s"}`, at });
}

/** Ids of the objects and pages that differ between two states. */
export function diffIds(a: DocState, b: DocState): { objects: Set<string>; pages: Set<string> } {
  const objects = new Set<string>();
  const pages = new Set<string>();
  const am = new Map(a.objects.map((o) => [o.id, o]));
  const bm = new Map(b.objects.map((o) => [o.id, o]));
  for (const [id, o] of am) if (bm.get(id) !== o) objects.add(id);
  for (const id of bm.keys()) if (!am.has(id)) objects.add(id);
  // A z-order change keeps the same object values but changes their order.
  const ao = a.objects.map((o) => o.id).filter((id) => bm.has(id));
  const bo = b.objects.map((o) => o.id).filter((id) => am.has(id));
  ao.forEach((id, i) => bo[i] !== id && objects.add(id));
  const ap = new Map(a.pages.map((p) => [p.id, p]));
  const bp = new Map(b.pages.map((p) => [p.id, p]));
  for (const [id, p] of ap) if (bp.get(id) !== p) pages.add(id);
  for (const id of bp.keys()) if (!ap.has(id)) pages.add(id);
  const ai = a.pages.map((p) => p.id).filter((id) => bp.has(id));
  const bi = b.pages.map((p) => p.id).filter((id) => ap.has(id));
  ai.forEach((id, i) => bi[i] !== id && pages.add(id));
  return { objects, pages };
}
