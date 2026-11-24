/**
 * Form field model (spec F16 AC-230 to AC-247). Pure data, no pdf-lib, so the editor chunk can use
 * it without loading the PDF writer.
 *
 * Coordinates match the editor model (`lib/editor/model.ts`): every widget lives on one page entry,
 * in that page's **frame**: points, origin at the top-left of the unrotated visible page box
 * (pdf.js `view`), x right, y down. The page's own turn is applied on screen by turning the overlay
 * and in the output by `/Rotate`; a widget's text is turned to match (`MK /R`), so it reads upright.
 */

/** The page fields need: the same shape as the editor's `PageEntry`. */
export type FormPage = {
  id: string;
  /** Visible box of the unrotated page: [x0, y0, x1, y1] in PDF user space. */
  view: [number, number, number, number];
  /** The source page's own /Rotate. */
  baseRotate: number;
  /** Quarter turns the user added. */
  rotate: number;
};

export type FieldKind = "text" | "checkbox" | "radio" | "dropdown" | "list" | "signature" | "button";

export type Align = "left" | "center" | "right";

/** One place a field shows: a widget annotation. */
export type Widget = {
  id: string;
  page: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Radio buttons: this button's export value. Checkboxes: the "on" value (usually "Yes"). */
  on?: string;
  /** Object number of the widget in the source file ("12 0"), for fields read from the file. */
  ref?: string;
  /** The file hides this widget (annotation flag Hidden or NoView): not shown, kept as it is. */
  hidden?: boolean;
};

export type FieldStyle = {
  /** Font size in points; 0 = auto (fit the box). */
  fontSize: number;
  align: Align;
  /** Text colour, "#rrggbb". */
  color: string;
  /** Border colour, or null for none. */
  border: string | null;
  borderWidth: number;
  /** Background colour, or null for none. */
  background: string | null;
};

export type FormField = {
  id: string;
  kind: FieldKind;
  /** Fully qualified name ("address.street"). */
  name: string;
  /** Tooltip / accessible name (`TU`). */
  tooltip: string;
  widgets: Widget[];
  /**
   * Current value. text/dropdown: string. list: selected options. checkbox: the on value or "" (off).
   * radio: the selected export value or "". signature/button: "".
   */
  value: string | string[];
  /** Value after a form reset (`DV`). Same shape as `value`. */
  defaultValue: string | string[];
  required: boolean;
  readOnly: boolean;
  /** text only */
  multiline: boolean;
  /** text only: max characters, or null. */
  maxLen: number | null;
  /** text only: spread the characters over `maxLen` equal boxes. */
  comb: boolean;
  /** dropdown, list (and radio export values, for reference). */
  options: string[];
  /** list only */
  multiSelect: boolean;
  /** dropdown only: the user may type a value that is not an option. */
  editable: boolean;
  style: FieldStyle;
  /** Where it came from: the file, a user draw, or Detect fields. */
  origin: "file" | "new" | "detected";
  /** Object number of the terminal field in the source file, for fields read from the file. */
  ref?: string;
};

export type FormState = {
  fields: FormField[];
  /** Widget ids in tab order. Each page uses the widgets on it, in this order. */
  order: string[];
  /** How the order was set, so the output can say `/Tabs /R` or `/C`. */
  orderMode: "original" | "rows" | "columns" | "custom";
  /** The order the file had (fields read from it), for "Restore original". New fields follow it. */
  originalOrder: string[];
};

/** A field Detect fields proposes. Same shape as a new field, plus why it was proposed. */
export type Proposal = {
  field: FormField;
  /** The label it was named from, if any. */
  label: string | null;
  /** 0–1 */
  confidence: number;
  /** What was found: "line", "underscores", "dots", "box", "comb", "square", "circle", "glyph". */
  source: string;
};
