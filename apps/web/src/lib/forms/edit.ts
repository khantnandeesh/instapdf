/**
 * Property edits behind the field properties popover (U-F4, AC-234 to AC-236). Pure, like model.ts:
 * each returns a new state, so the editor can put it on its undo history.
 */
import { setValue, updateField } from "./model";
import { checkName, renamedTo, type NameCheck } from "./names";
import type { FormField, FormState, Widget } from "./types";

const fieldOf = (state: FormState, id: string) => state.fields.find((f) => f.id === id);

/** A field from the file may keep a dotted name (it already sits in a parent); others may not. */
const mayUseDot = (f: FormField) => f.origin === "file" && f.name.includes(".");

/** Checks a name the user is typing for field `id` (AC-235). */
export function checkFieldName(state: FormState, id: string, name: string): NameCheck {
  const f = fieldOf(state, id);
  if (!f) return { ok: true };
  const others = state.fields.filter((x) => x.id !== id).map((x) => x.name);
  const check = checkName(name, others, { allowDot: mayUseDot(f) });
  if (!check.ok) return check;
  // A file field renamed out of its parent loses the parent part (see renamedTo): check that name too.
  const final = mayUseDot(f) ? renamedTo(f.name, name) : name.trim();
  return others.includes(final) ? checkName(final, others) : check;
}

/** Renames field `id` when the name passes `checkFieldName`; otherwise returns the state unchanged. */
export function renameField(state: FormState, id: string, name: string): { state: FormState; check: NameCheck } {
  const f = fieldOf(state, id);
  const check = checkFieldName(state, id, name);
  if (!f || !check.ok) return { state, check };
  const next = mayUseDot(f) ? renamedTo(f.name, name) : name.trim();
  return { state: next === f.name ? state : updateField(state, id, { name: next }), check };
}

/** A checkbox's export value ("Yes" by default). A checked box stays checked under the new value. */
export function setCheckboxOn(state: FormState, id: string, on: string): FormState {
  const f = fieldOf(state, id);
  const v = on.trim();
  if (!f || f.kind !== "checkbox" || !v || v === "Off") return state;
  const widgets = f.widgets.map((w) => ({ ...w, on: v }));
  return updateField(state, id, { widgets, value: f.value ? v : "", defaultValue: f.defaultValue ? v : "" });
}

/**
 * The options of a dropdown or list, from the editor's one-per-line box: blank lines and repeats go,
 * and a value or default that is no longer an option is cleared (an editable dropdown keeps its value).
 */
export function setOptions(state: FormState, id: string, lines: string[]): FormState {
  const f = fieldOf(state, id);
  if (!f || (f.kind !== "dropdown" && f.kind !== "list")) return state;
  const options = [...new Set(lines.map((l) => l.trim()).filter(Boolean))];
  const keep = (v: string | string[]) =>
    Array.isArray(v) ? v.filter((x) => options.includes(x)) : !v || options.includes(v) || (f.kind === "dropdown" && f.editable) ? v : "";
  return updateField(state, id, { options, value: keep(f.value), defaultValue: keep(f.defaultValue) });
}

/** The value after a form reset (`DV`): checked by default, selected by default, default text. */
export function setDefaultValue(state: FormState, id: string, value: string | string[]): FormState {
  const f = fieldOf(state, id);
  if (!f) return state;
  // The same rules as filling it in, without the read-only stop (a read-only field may have a default).
  const probe = setValue({ ...state, fields: state.fields.map((x) => (x.id === id ? { ...x, readOnly: false } : x)) }, id, value);
  if (probe.error) return state;
  const v = probe.state.fields.find((x) => x.id === id)!.value;
  return updateField(state, id, { defaultValue: v });
}

/**
 * True when a one-line text field is drawn taller than 2.5 lines of its text, so the popover offers
 * "Make multi-line" (U-F4). Auto size counts as 12 pt.
 */
export function suggestsMultiline(f: FormField, w: Widget | undefined = f.widgets[0]): boolean {
  if (f.kind !== "text" || f.multiline || f.comb || !w) return false;
  const size = f.style.fontSize || 12;
  return w.h > 2.5 * size * 1.15;
}

/** What the popover shows for a kind: the main row and what sits under "More" (U-F4 table). */
export type PropKey =
  | "name"
  | "required"
  | "size"
  | "color"
  | "tooltip"
  | "default"
  | "maxLen"
  | "comb"
  | "multiline"
  | "align"
  | "border"
  | "background"
  | "readOnly"
  | "repeat"
  | "duplicate"
  | "exportValue"
  | "buttonValue"
  | "addButton"
  | "options"
  | "editable"
  | "multiSelect";

export function propsFor(kind: FormField["kind"]): { main: PropKey[]; more: PropKey[] } {
  switch (kind) {
    case "text":
      return { main: ["name", "required", "size", "color"], more: ["tooltip", "default", "maxLen", "comb", "multiline", "readOnly", "align", "border", "background", "repeat", "duplicate"] };
    case "checkbox":
      return { main: ["name", "required"], more: ["exportValue", "default", "border", "background", "readOnly", "repeat", "duplicate"] };
    case "radio":
      return { main: ["name", "buttonValue", "addButton"], more: ["required", "default", "border", "background", "readOnly"] };
    case "dropdown":
      return { main: ["name", "options"], more: ["editable", "size", "color", "required", "readOnly", "tooltip", "duplicate"] };
    case "list":
      return { main: ["name", "options"], more: ["multiSelect", "size", "color", "required", "readOnly", "tooltip", "duplicate"] };
    case "signature":
      return { main: ["name", "required"], more: ["tooltip", "repeat", "duplicate"] };
    default:
      return { main: ["name"], more: ["tooltip", "readOnly"] };
  }
}
