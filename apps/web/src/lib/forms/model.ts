/**
 * Pure operations on the form model (AC-233 to AC-236). Every function returns a new state.
 */
import type { Box } from "./frame";
import { uniqueName } from "./names";
import type { FieldKind, FieldStyle, FormField, FormPage, FormState, Widget } from "./types";

let counter = 0;
export function newId(prefix = "f"): string {
  counter = (counter + 1) % 1e9;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}`;
}

export const emptyForm = (): FormState => ({ fields: [], order: [], orderMode: "original", originalOrder: [] });

export const DEFAULT_STYLE: FieldStyle = { fontSize: 0, align: "left", color: "#000000", border: null, borderWidth: 1, background: null };

/** Kinds that hold a list of values. */
const isMulti = (f: Pick<FormField, "kind" | "multiSelect">) => f.kind === "list";

/** Default box size for a click (no drag) per kind, in points. */
export function defaultSize(kind: FieldKind, multiline = false): { w: number; h: number } {
  switch (kind) {
    case "checkbox":
    case "radio":
      return { w: 14, h: 14 };
    case "signature":
      return { w: 180, h: 40 };
    case "list":
      return { w: 140, h: 60 };
    default:
      return multiline ? { w: 200, h: 54 } : { w: 160, h: 20 };
  }
}

const BASE: Record<FieldKind, string> = {
  text: "text",
  checkbox: "checkbox",
  radio: "choice",
  dropdown: "dropdown",
  list: "list",
  signature: "signature",
  button: "button",
};

export type NewFieldInit = {
  kind: FieldKind;
  page: string;
  box: Box;
  name?: string;
  multiline?: boolean;
  options?: string[];
  origin?: FormField["origin"];
  tooltip?: string;
};

/** A new field with one widget. Radio groups start with one button; add more with `addRadioButton`. */
export function createField(state: FormState, init: NewFieldInit): FormField {
  const taken = state.fields.map((f) => f.name);
  const name = uniqueName(init.name || BASE[init.kind], taken);
  const multiline = init.kind === "text" && !!init.multiline;
  const options =
    init.options ?? (init.kind === "dropdown" || init.kind === "list" ? ["Option 1", "Option 2"] : init.kind === "radio" ? ["Choice1"] : []);
  const widget: Widget = { id: newId("w"), page: init.page, ...init.box };
  if (init.kind === "checkbox") widget.on = "Yes";
  if (init.kind === "radio") widget.on = options[0];
  const empty = isMulti({ kind: init.kind, multiSelect: false }) ? [] : "";
  return {
    id: newId("f"),
    kind: init.kind,
    name,
    tooltip: init.tooltip ?? "",
    widgets: [widget],
    value: empty,
    defaultValue: empty,
    required: false,
    readOnly: false,
    multiline,
    maxLen: null,
    comb: false,
    options,
    multiSelect: false,
    editable: false,
    style: { ...DEFAULT_STYLE, border: init.kind === "signature" ? "#5a5a5a" : null },
    origin: init.origin ?? "new",
  };
}

/** Adds a field to the end of the form (and its widgets to the end of the tab order). */
export function addField(state: FormState, field: FormField): FormState {
  return { ...state, fields: [...state.fields, field], order: [...state.order, ...field.widgets.map((w) => w.id)], orderMode: state.orderMode === "original" ? "original" : "custom" };
}

export function addFields(state: FormState, fields: FormField[]): FormState {
  return fields.reduce(addField, state);
}

export function updateField(state: FormState, id: string, patch: Partial<Omit<FormField, "id">>): FormState {
  return { ...state, fields: state.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)) };
}

/** Removes a field and all its widgets (AC-236). */
export function deleteField(state: FormState, id: string): FormState {
  const f = state.fields.find((x) => x.id === id);
  if (!f) return state;
  const gone = new Set(f.widgets.map((w) => w.id));
  return { ...state, fields: state.fields.filter((x) => x.id !== id), order: state.order.filter((w) => !gone.has(w)) };
}

/** Removes one widget; a field left with none is removed too. */
export function deleteWidget(state: FormState, widgetId: string): FormState {
  const f = state.fields.find((x) => x.widgets.some((w) => w.id === widgetId));
  if (!f) return state;
  if (f.widgets.length === 1) return deleteField(state, f.id);
  const widgets = f.widgets.filter((w) => w.id !== widgetId);
  const options = f.kind === "radio" ? [...new Set(widgets.map((w) => w.on!))] : f.options;
  const value = f.kind === "radio" && !options.includes(f.value as string) ? "" : f.value;
  return { ...updateField(state, f.id, { widgets, options, value }), order: state.order.filter((w) => w !== widgetId) };
}

/** Moves or resizes a widget (frame box). */
export function setWidgetBox(state: FormState, widgetId: string, box: Box): FormState {
  return {
    ...state,
    fields: state.fields.map((f) => (f.widgets.some((w) => w.id === widgetId) ? { ...f, widgets: f.widgets.map((w) => (w.id === widgetId ? { ...w, ...box } : w)) } : f)),
  };
}

/** Adds a button to a radio group, next to the last one (or at `box`), with a fresh export value. */
export function addRadioButton(state: FormState, fieldId: string, box?: Box & { page?: string }): FormState {
  const f = state.fields.find((x) => x.id === fieldId);
  if (!f || f.kind !== "radio") return state;
  const last = f.widgets[f.widgets.length - 1];
  const on = uniqueName(`Choice${f.widgets.length + 1}`, f.widgets.map((w) => w.on!));
  const w: Widget = { id: newId("w"), page: box?.page ?? last.page, x: box?.x ?? last.x, y: box?.y ?? last.y + last.h + 8, w: box?.w ?? last.w, h: box?.h ?? last.h, on };
  return { ...updateField(state, fieldId, { widgets: [...f.widgets, w], options: [...f.options, on] }), order: insertAfter(state.order, last.id, w.id) };
}

/** Renames a radio button's export value; the selection follows it. */
export function setRadioValue(state: FormState, widgetId: string, on: string): FormState {
  const f = state.fields.find((x) => x.widgets.some((w) => w.id === widgetId));
  if (!f || f.kind !== "radio" || !on) return state;
  const old = f.widgets.find((w) => w.id === widgetId)!.on!;
  const widgets = f.widgets.map((w) => (w.id === widgetId ? { ...w, on } : w));
  return updateField(state, f.id, {
    widgets,
    options: [...new Set(widgets.map((w) => w.on!))],
    value: f.value === old ? on : f.value,
    defaultValue: f.defaultValue === old ? on : f.defaultValue,
  });
}

const insertAfter = (order: string[], after: string, id: string) => {
  const i = order.indexOf(after);
  return i < 0 ? [...order, id] : [...order.slice(0, i + 1), id, ...order.slice(i + 1)];
};

/**
 * Duplicate (AC-58 for fields): a new field with a free name, one line below the original, or at
 * the same spot on `toPage`.
 */
export function duplicateField(state: FormState, id: string, toPage?: string): { state: FormState; field: FormField | null } {
  const f = state.fields.find((x) => x.id === id);
  if (!f) return { state, field: null };
  const dy = toPage ? 0 : Math.max(...f.widgets.map((w) => w.h)) + 6;
  const copy: FormField = {
    ...f,
    id: newId("f"),
    name: uniqueName(f.name.replace(/(_\d+)$/, ""), state.fields.map((x) => x.name)),
    origin: "new",
    ref: undefined,
    widgets: f.widgets.map((w) => ({ ...w, id: newId("w"), page: toPage ?? w.page, y: w.y + dy, ref: undefined, drawn: undefined })),
  };
  return { state: addField(state, copy), field: copy };
}

/**
 * "Repeat on all pages" (AC-235): one field with one widget per page, at the same frame position,
 * so a value typed once shows on every page. Pages that already have a widget of it are skipped.
 */
export function repeatOnAllPages(state: FormState, fieldId: string, pages: FormPage[]): FormState {
  const f = state.fields.find((x) => x.id === fieldId);
  if (!f || f.kind === "radio") return state;
  const src = f.widgets[0];
  const have = new Set(f.widgets.map((w) => w.page));
  const added: Widget[] = pages.filter((p) => !have.has(p.id)).map((p) => ({ ...src, id: newId("w"), page: p.id, ref: undefined, drawn: undefined }));
  if (!added.length) return state;
  return { ...updateField(state, fieldId, { widgets: [...f.widgets, ...added] }), order: [...state.order, ...added.map((w) => w.id)] };
}

export type SetValueResult = { state: FormState; error?: "read-only" | "too-long" | "not-an-option" };

/** Sets a field's value as the user fills it (AC-233). Read-only fields and over-long text are refused. */
export function setValue(state: FormState, id: string, value: string | string[]): SetValueResult {
  const f = state.fields.find((x) => x.id === id);
  if (!f) return { state };
  if (f.readOnly) return { state, error: "read-only" };
  let v = value;
  switch (f.kind) {
    case "text":
      v = String(value);
      if (!f.multiline) v = v.replace(/\r?\n/g, " ");
      // Counted in UTF-16 units, as PDF viewers and pdf-lib count MaxLen ("😀" is 2).
      if (f.maxLen != null && v.length > f.maxLen) return { state, error: "too-long" };
      break;
    case "dropdown":
      v = String(value);
      if (v && !f.editable && !f.options.includes(v)) return { state, error: "not-an-option" };
      break;
    case "list": {
      const arr = (Array.isArray(value) ? value : [value]).filter((x) => f.options.includes(x));
      v = f.multiSelect ? arr : arr.slice(0, 1);
      break;
    }
    case "checkbox": {
      const on = f.widgets[0]?.on ?? "Yes";
      v = value === "" || value === "Off" ? "" : on;
      break;
    }
    case "radio":
      v = String(value);
      if (v && !f.widgets.some((w) => w.on === v)) return { state, error: "not-an-option" };
      break;
    default:
      return { state };
  }
  return { state: updateField(state, id, { value: v }) };
}

/** `text` cut to at most `max` UTF-16 units, never splitting a character. */
export function clipToMaxLen(text: string, max: number): string {
  if (text.length <= max) return text;
  let out = "";
  for (const ch of text) {
    if (out.length + ch.length > max) break;
    out += ch;
  }
  return out;
}

/** Sets a text field's max length (null = none); a longer value is cut to fit, as viewers do. */
export function setMaxLen(state: FormState, id: string, maxLen: number | null): FormState {
  const f = state.fields.find((x) => x.id === id);
  if (!f || f.kind !== "text") return state;
  const max = maxLen != null && maxLen > 0 ? Math.floor(maxLen) : null;
  const clip = (v: string | string[]) => (max == null ? v : clipToMaxLen(String(v), max));
  return updateField(state, id, { maxLen: max, comb: max == null ? false : f.comb, value: clip(f.value), defaultValue: clip(f.defaultValue) });
}

/** True when a value is empty for its kind. */
export const isEmptyValue = (v: string | string[]) => (Array.isArray(v) ? v.length === 0 : v === "");

/** Required fields that are still empty (AC-233), in tab order. Shown inline; never blocks download. */
export function missingRequired(state: FormState): FormField[] {
  const rank = new Map(state.order.map((w, i) => [w, i]));
  const first = (f: FormField) => Math.min(...f.widgets.map((w) => rank.get(w.id) ?? Infinity));
  // A field the file hides everywhere can't be filled here, so it is never asked for.
  return state.fields.filter((f) => f.required && f.kind !== "signature" && f.kind !== "button" && isEmptyValue(f.value) && f.widgets.some((w) => !w.hidden)).sort((a, b) => first(a) - first(b));
}

/** Every widget on page `from` gets a twin on page `to` (a duplicated page), in the same field. */
export function duplicateWidgetsToPage(state: FormState, from: string, to: string): FormState {
  let order = state.order;
  let changed = false;
  const fields = state.fields.map((f) => {
    if (f.kind === "radio" || !f.widgets.some((w) => w.page === from)) return f;
    // Hidden widgets get no twin: the writer doesn't carry the file's flags onto new widgets.
    const twins = f.widgets.filter((w) => w.page === from && !w.hidden).map((w) => ({ ...w, id: newId("w"), page: to, ref: undefined }));
    if (!twins.length) return f;
    order = [...order, ...twins.map((w) => w.id)];
    changed = true;
    return { ...f, widgets: [...f.widgets, ...twins] };
  });
  return changed ? { ...state, fields, order } : state;
}

/** Widget → its field. */
export function fieldOfWidget(state: FormState, widgetId: string): FormField | undefined {
  return state.fields.find((f) => f.widgets.some((w) => w.id === widgetId));
}

/**
 * Keeps the model valid after page changes in the editor: widgets on pages that are gone are
 * removed (with their field when it has none left), and the order is cleaned.
 */
export function prunePages(state: FormState, pageIds: Iterable<string>): FormState {
  const keep = new Set(pageIds);
  let next = state;
  for (const f of state.fields) for (const w of f.widgets) if (!keep.has(w.page)) next = deleteWidget(next, w.id);
  return next;
}

/**
 * Undoes one recorded form change (`before` → `after`) inside the form as it is `now`, field by
 * field, so later changes that are kept stay (History "revert these", AC-73):
 * - a field the change added is removed;
 * - a field the change removed comes back (as it was before);
 * - a field the change edited goes back to its earlier version if nothing changed it since; if
 *   something did, it keeps that later version and only gets back the widgets the change took
 *   away (a deleted page's widgets, say).
 * Tab order: widgets that come back return after the widget they followed before.
 */
export function revertFormChange(now: FormState, before: FormState, after: FormState): FormState {
  const prev = new Map(before.fields.map((f) => [f.id, f]));
  const next = new Map(after.fields.map((f) => [f.id, f]));
  const fields: FormField[] = [];
  for (const f of now.fields) {
    const b = prev.get(f.id);
    const a = next.get(f.id);
    if (!b && a) continue; // added by the change
    if (!b || !a || a === b) fields.push(f);
    else if (f === a) fields.push(b);
    else {
      const have = new Set(f.widgets.map((w) => w.id));
      const lost = b.widgets.filter((w) => !have.has(w.id) && !a.widgets.some((x) => x.id === w.id));
      fields.push(lost.length ? { ...f, widgets: [...f.widgets, ...lost] } : f);
    }
  }
  const present = new Set(fields.map((f) => f.id));
  for (const [i, b] of before.fields.entries()) {
    if (next.has(b.id) || present.has(b.id)) continue; // removed by the change: put it back in place
    const at = fields.findIndex((f) => before.fields.findIndex((x) => x.id === f.id) > i);
    fields.splice(at < 0 ? fields.length : at, 0, b);
  }
  const widgets = new Set(fields.flatMap((f) => f.widgets.map((w) => w.id)));
  const order = now.order.filter((id) => widgets.has(id));
  for (const [i, id] of before.order.entries()) {
    if (!widgets.has(id) || order.includes(id)) continue;
    const prevId = before.order.slice(0, i).reverse().find((x) => order.includes(x));
    order.splice(prevId ? order.indexOf(prevId) + 1 : 0, 0, id);
  }
  for (const id of widgets) if (!order.includes(id)) order.push(id);
  return { ...now, fields, order, orderMode: order.join() === now.order.join() ? now.orderMode : "custom" };
}
