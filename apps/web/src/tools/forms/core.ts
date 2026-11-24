"use client";
/**
 * The part of forms the editor needs before any field shows (F16 E3): reading the file's form,
 * recording changes, and the field keys. The field UI (EditorForms) is a separate chunk, loaded
 * only when the file has fields or the Form tool is picked (see ./lazy).
 */
import * as H from "@/lib/editor/history";
import { readFormsInWorker } from "@/lib/editor/build-client";
import { clampDelta, pageSize } from "@/lib/editor/model";
import { deleteField, duplicateField, missingRequired, setWidgetBox } from "@/lib/forms/model";
import { nextTabStop } from "@/lib/forms/taborder";
import type { FormState } from "@/lib/forms/types";
import type { Controller } from "@/tools/editor/controller";
import type { EditorState, FormsUi } from "@/tools/editor/store";

export const formsOf = (s: EditorState) => H.current(s.history).forms;

/** Reads the file's form in the download worker, once pdf.js says there is one (no pdf-lib in the editor chunk). */
export async function loadForms(ctl: Controller, bytes: Uint8Array, password?: string): Promise<void> {
  try {
    // pdf.js answers null when there is no form, else the fields by name (a Map in pdf.js 5+).
    const fields: unknown = await ctl.rt.pdf.getFieldObjects().catch(() => null);
    if (!fields || !(fields instanceof Map ? fields.size : Object.keys(fields).length)) return;
    // The fields will show: fetch their UI chunk while the form is read.
    void import("./EditorForms").catch(() => undefined);
    const { forms, xfa } = await readFormsInWorker(bytes.slice(), password);
    if (!forms.fields.length && !xfa) return;
    // Every state without a form gets the file's. Nothing can add fields before this point (the
    // Form tool and Detect wait for `ready`), so no state has a form the file's would be missing from.
    ctl.store.set((s) => ({
      history: { ...s.history, states: s.history.states.map((st) => (st.forms ? st : { ...st, forms })) },
      forms: { ...s.forms, original: forms, xfa },
    }));
    if (xfa) ctl.toast({ text: "This form also has an XFA version. Fields that only exist there can’t be filled here.", tone: "info" });
  } finally {
    setUi(ctl, { ready: true });
  }
}

/** False (and says why) while the file's form is still being read. */
export function formReady(ctl: Controller): boolean {
  if (ctl.store.get().forms.ready) return true;
  ctl.announce("Reading this file’s form fields. Try again in a moment.");
  return false;
}

/** Records a form change as one undoable step. */
export function applyForm(ctl: Controller, next: FormState, label: string, key?: string, page?: string) {
  const doc = ctl.state();
  if (next === doc.forms) return;
  ctl.apply({ ...doc, forms: next }, label, { key, page });
}

export const setUi = (ctl: Controller, patch: Partial<FormsUi>) => ctl.store.set((s) => ({ forms: { ...s.forms, ...patch } }));

/** After a download: required fields still empty turn the chip into a nudge (never a block). Returns how many. */
export function nudgeAfterDownload(ctl: Controller): number {
  const form = ctl.state().forms;
  const missing = form ? missingRequired(form).length : 0;
  setUi(ctl, { nudge: missing > 0 });
  return missing;
}

/** The control a field's element focuses, or null when it has none (read-only, inert). */
export const controlOf = (widgetId: string) => {
  const el = document.querySelector<HTMLElement>(`.bf-field[data-w="${widgetId}"]`);
  if (!el || el.querySelector("[inert]")) return null;
  return el.querySelector<HTMLElement>("input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]):not(.bf-badge)");
};

/**
 * Tab and Shift+Tab inside the fields follow the tab order across pages (AC-248), not the page's
 * DOM, so page buttons in between are skipped. Past the last (or first) field, Tab goes on as usual.
 */
export function fieldTab(ctl: Controller, e: Pick<KeyboardEvent, "key" | "shiftKey" | "ctrlKey" | "metaKey" | "altKey" | "target" | "defaultPrevented">): boolean {
  if (e.key !== "Tab" || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return false;
  const t = e.target instanceof Element ? e.target : null;
  const from = t?.closest<HTMLElement>(".bf-field[data-w]")?.dataset.w;
  const form = ctl.state().forms;
  if (!from || !form) return false;
  const pages = H.current(ctl.store.get().history).pages.map((p) => p.id);
  const next = nextTabStop(form, pages, from, e.shiftKey, (id) => !!controlOf(id));
  const el = next ? controlOf(next) : null;
  if (!el) return false;
  el.focus({ preventScroll: true });
  revealField(el);
  return true;
}

/** The nearest ancestor that scrolls along an axis, else the page. */
function scrollerOf(el: HTMLElement, axis: "x" | "y"): HTMLElement {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = axis === "y" ? getComputedStyle(p).overflowY : getComputedStyle(p).overflowX;
    const more = axis === "y" ? p.scrollHeight > p.clientHeight : p.scrollWidth > p.clientWidth;
    if ((o === "auto" || o === "scroll") && more) return p;
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

/** The floating chrome a field must stay clear of (top bar, view pill, tool rail, phone fill bar). */
const CHROME = '[data-region="top"], [data-region="view"], [data-region="tools"], .bf-peek';

/**
 * Scrolls a field into the part of the visible screen the floating bars leave free: below the
 * top bar and the phone fill bar, above the view pill, beside the tool rail (G-21, G-25), on both
 * axes. A field already clear of them stays put. `skip` leaves one bar out of the sums. `fits` is
 * false when the free area is too short for the field (a phone keyboard taking most of the
 * screen); `moving` is true while a smooth scroll is still taking it there.
 */
export function revealField(el: HTMLElement, opts: { smooth?: boolean; skip?: Element | null } = {}): { fits: boolean; moving: boolean } {
  const gap = 12;
  const vv = window.visualViewport;
  let [left, top] = [vv?.offsetLeft ?? 0, vv?.offsetTop ?? 0];
  let [right, bottom] = [left + (vv?.width ?? window.innerWidth), top + (vv?.height ?? window.innerHeight)];
  const [cx, cy] = [(left + right) / 2, (top + bottom) / 2];
  for (const c of document.querySelectorAll<HTMLElement>(CHROME)) {
    if (c === opts.skip || getComputedStyle(c).visibility === "hidden") continue;
    const r = c.getBoundingClientRect();
    if (!r.width || !r.height || r.bottom <= top || r.top >= bottom || r.right <= left || r.left >= right) continue;
    if (r.width >= r.height) {
      if (r.top + r.height / 2 < cy) top = Math.max(top, r.bottom);
      else bottom = Math.min(bottom, r.top);
    } else if (r.left + r.width / 2 < cx) left = Math.max(left, r.right);
    else right = Math.min(right, r.left);
  }
  const r = el.getBoundingClientRect();
  const fits = r.height <= bottom - top - 2 * gap;
  // Centre it in the free area; along an axis where it is larger than the area, line up its start.
  const delta = (lo: number, hi: number, a: number, b: number) =>
    a >= lo + gap && b <= hi - gap ? 0 : b - a > hi - lo - 2 * gap ? a - (lo + gap) : (a + b) / 2 - (lo + hi) / 2;
  const dy = delta(top, bottom, r.top, r.bottom);
  const dx = delta(left, right, r.left, r.right);
  const behavior = opts.smooth !== false && !matchMedia("(prefers-reduced-motion: reduce)").matches ? "smooth" : "auto";
  // How far each scroller can really go: none at the very top of the file, for instance.
  const room = (sc: HTMLElement, d: number, axis: "x" | "y") => {
    const [pos, max] = axis === "y" ? [sc.scrollTop, sc.scrollHeight - sc.clientHeight] : [sc.scrollLeft, sc.scrollWidth - sc.clientWidth];
    return Math.max(0, Math.min(max, pos + d)) - pos;
  };
  const [sy, sx] = [scrollerOf(el, "y"), scrollerOf(el, "x")];
  const [my, mx] = [room(sy, dy, "y"), room(sx, dx, "x")];
  if (Math.abs(my) >= 1) sy.scrollBy({ top: my, behavior });
  if (Math.abs(mx) >= 1) sx.scrollBy({ left: mx, behavior });
  return { fits, moving: behavior === "smooth" && (Math.abs(my) >= 1 || Math.abs(mx) >= 1) };
}

/**
 * Keys for the selected field (Form tool): Delete removes it, Escape lets go, arrows nudge it by
 * 1 pt (10 with Shift), Ctrl/Cmd+D duplicates it. Returns true when handled.
 */
export function fieldKey(ctl: Controller, e: Pick<KeyboardEvent, "key" | "shiftKey" | "ctrlKey" | "metaKey" | "target" | "defaultPrevented">): boolean {
  const { key } = e;
  const sel = ctl.store.get().forms.selected;
  if (!sel || ctl.store.get().tool !== "form") return false;
  // Keys a control already used (tab order list, the properties popover, its buttons) are theirs.
  const t = e.target instanceof Element ? e.target : null;
  if (e.defaultPrevented || t?.closest(".bf-popover, .bf-taborder, [role=dialog], [role=menu]")) return false;
  if (key === "Escape") {
    setUi(ctl, { selected: null });
    return true;
  }
  if (key === "Delete" || key === "Backspace") {
    const form = ctl.state().forms;
    if (!form) return false;
    applyForm(ctl, deleteField(form, sel.field), "Delete field");
    setUi(ctl, { selected: null });
    return true;
  }
  const form = ctl.state().forms;
  const w = form?.fields.find((x) => x.id === sel.field)?.widgets.find((x) => x.id === sel.widget);
  if (!form || !w) return false;
  const step = e.shiftKey ? 10 : 1;
  const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[key];
  if (d) {
    const entry = H.current(ctl.store.get().history).pages.find((p) => p.id === w.page);
    const size = entry ? pageSize(entry) : { w: Infinity, h: Infinity };
    const [dx, dy] = clampDelta(w, d[0], d[1], size);
    applyForm(ctl, setWidgetBox(form, w.id, { x: w.x + dx, y: w.y + dy, w: w.w, h: w.h }), "Move field", `nudge:${w.id}`, w.page);
    return true;
  }
  if ((e.ctrlKey || e.metaKey) && key.toLowerCase() === "d") {
    const r = duplicateField(form, sel.field);
    if (!r.field) return false;
    applyForm(ctl, r.state, "Duplicate field", undefined, w.page);
    setUi(ctl, { selected: { field: r.field.id, widget: r.field.widgets[0].id } });
    return true;
  }
  return false;
}
