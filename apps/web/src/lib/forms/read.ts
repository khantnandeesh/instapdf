/**
 * Reads the AcroForm of a document into the form model (AC-230). Every field kind is read, with
 * its full name, value, default, options, flags and each widget's page and box. Fields made of a
 * parent and kids come back as their terminal fields with full names ("address.street").
 */
import {
  PDFArray,
  PDFButton,
  PDFCheckBox,
  PDFDict,
  PDFDropdown,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFOptionList,
  PDFStream,
  PDFRadioGroup,
  PDFRef,
  PDFSignature,
  PDFString,
  PDFTextField,
  TextAlignment,
  type PDFDocument,
  type PDFField,
  type PDFObject,
  type PDFWidgetAnnotation,
} from "@cantoo/pdf-lib";
import { fromPdfRect, norm360, type PdfRect } from "./frame";
import { DEFAULT_STYLE, emptyForm } from "./model";
import type { Align, FieldKind, FieldStyle, FormPage, FormState, Widget } from "./types";

const N = (s: string) => PDFName.of(s);
export const refKey = (r: PDFRef) => `${r.objectNumber} ${r.generationNumber}`;
const textOf = (o: PDFObject | undefined) => (o instanceof PDFString || o instanceof PDFHexString ? o.decodeText() : undefined);

/** The pages of a document as the editor sees them: ids `p0`, `p1`…, visible box = crop ∩ media box. */
export function pagesOf(doc: PDFDocument): FormPage[] {
  return doc.getPages().map((page, i) => {
    const m = page.getMediaBox();
    const c = page.getCropBox();
    const x0 = Math.max(m.x, c.x);
    const y0 = Math.max(m.y, c.y);
    const x1 = Math.min(m.x + m.width, c.x + c.width);
    const y1 = Math.min(m.y + m.height, c.y + c.height);
    return { id: `p${i}`, view: [x0, y0, Math.max(x0, x1), Math.max(y0, y1)], baseRotate: norm360(page.getRotation().angle), rotate: 0 };
  });
}

export function kindOf(f: PDFField): FieldKind {
  if (f instanceof PDFTextField) return "text";
  if (f instanceof PDFCheckBox) return "checkbox";
  if (f instanceof PDFRadioGroup) return "radio";
  if (f instanceof PDFDropdown) return "dropdown";
  if (f instanceof PDFOptionList) return "list";
  if (f instanceof PDFSignature) return "signature";
  if (f instanceof PDFButton) return "button";
  return "text";
}

/** Refs of a field's widgets, in the same order as `acroField.getWidgets()`. */
export function widgetRefs(f: PDFField): (PDFRef | undefined)[] {
  const kids = f.acroField.Kids();
  if (!kids) return [f.ref];
  const out: (PDFRef | undefined)[] = [];
  for (let i = 0; i < kids.size(); i++) {
    const raw = kids.get(i);
    out.push(raw instanceof PDFRef ? raw : undefined);
  }
  return out;
}

/** Widget ref → page index, from every page's /Annots. */
export function widgetPages(doc: PDFDocument): Map<string, number> {
  const map = new Map<string, number>();
  doc.getPages().forEach((page, i) => {
    const annots = page.node.lookup(N("Annots"));
    if (!(annots instanceof PDFArray)) return;
    for (let k = 0; k < annots.size(); k++) {
      const raw = annots.get(k);
      if (raw instanceof PDFRef && !map.has(refKey(raw))) map.set(refKey(raw), i);
    }
  });
  return map;
}

const hex = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 255).toString(16).padStart(2, "0");
/** A PDF colour array (grey, RGB or CMYK, 0–1) → "#rrggbb"; empty or missing → null. */
export function colorToHex(c: number[] | undefined): string | null {
  if (!c || !c.length) return null;
  if (c.length === 1) return `#${hex(c[0])}${hex(c[0])}${hex(c[0])}`;
  if (c.length === 3) return `#${hex(c[0])}${hex(c[1])}${hex(c[2])}`;
  if (c.length === 4) {
    const k = 1 - c[3];
    return `#${hex((1 - c[0]) * k)}${hex((1 - c[1]) * k)}${hex((1 - c[2]) * k)}`;
  }
  return null;
}

/** Font size and colour from a DA string ("/Helv 12 Tf 0 0 1 rg"). */
export function parseDA(da: string | undefined): { fontSize: number; color: string } {
  const out = { fontSize: 0, color: "#000000" };
  if (!da) return out;
  const tf = /(-?[\d.]+)\s+Tf/.exec(da);
  if (tf) out.fontSize = Math.max(0, parseFloat(tf[1]) || 0);
  const rg = /(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+rg/.exec(da);
  const g = /(-?[\d.]+)\s+g(?:\s|$)/.exec(da);
  const k = /(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+k/.exec(da);
  if (rg) out.color = colorToHex([+rg[1], +rg[2], +rg[3]])!;
  else if (k) out.color = colorToHex([+k[1], +k[2], +k[3], +k[4]])!;
  else if (g) out.color = colorToHex([+g[1]])!;
  return out;
}

/** Width from the old /Border [h v width] array, when the widget has no /BS. */
function legacyBorderWidth(w: PDFWidgetAnnotation | undefined): number | undefined {
  const b = w?.dict.lookup(N("Border"));
  const width = b instanceof PDFArray ? b.lookup(2) : undefined;
  return width instanceof PDFNumber ? width.asNumber() : undefined;
}

function styleOf(f: PDFField, w: PDFWidgetAnnotation | undefined): FieldStyle {
  const da = parseDA(f.acroField.getDefaultAppearance() ?? undefined);
  const mk = w?.getAppearanceCharacteristics();
  const bs = w?.getBorderStyle();
  const q = f instanceof PDFTextField ? f.getAlignment() : TextAlignment.Left;
  const align: Align = q === TextAlignment.Center ? "center" : q === TextAlignment.Right ? "right" : "left";
  return {
    ...DEFAULT_STYLE,
    fontSize: da.fontSize,
    color: da.color,
    align,
    border: colorToHex(mk?.getBorderColor()),
    borderWidth: bs?.getWidth() ?? legacyBorderWidth(w) ?? 1,
    background: colorToHex(mk?.getBackgroundColor()),
  };
}

function defaultValueOf(f: PDFField): string | string[] {
  const dv = f.acroField.dict.lookup(N("DV"));
  if (dv instanceof PDFName) return dv.decodeText() === "Off" ? "" : dv.decodeText();
  if (dv instanceof PDFArray) {
    const vals: string[] = [];
    for (let i = 0; i < dv.size(); i++) {
      const t = textOf(dv.lookup(i));
      if (t !== undefined) vals.push(t);
    }
    return vals;
  }
  const t = textOf(dv);
  if (f instanceof PDFOptionList) return t ? [t] : [];
  return t ?? "";
}

/** Reads every field. `pages` are the document's pages in source order (see `pagesOf`). */
export function readForm(doc: PDFDocument, pages: FormPage[] = pagesOf(doc)): FormState {
  const state = emptyForm();
  const acro = doc.catalog.lookup(N("AcroForm"));
  if (!(acro instanceof PDFDict)) return state;
  // pdf-lib's getForm() removes XFA (unless the file was loaded with preserveXFA), so XFA is noted
  // first. An XFA-only form has no AcroForm fields to read: getForm() is not called, so the XFA
  // stays in the output unless the user adds fields. A hybrid form loses its XFA copy, so viewers
  // that prefer XFA show the AcroForm values the user filled in.
  xfaSeen.set(doc, acro.get(N("XFA")) != null);
  const listed = acro.lookup(N("Fields"));
  if (!(listed instanceof PDFArray) || listed.size() === 0) return state;
  const form = doc.getForm();
  const onPage = widgetPages(doc);
  const pageIndexOrder: { id: string; page: number; annotIndex: number }[] = [];
  const annotIndex = annotPositions(doc);

  for (const f of form.getFields()) {
    const kind = kindOf(f);
    const refs = widgetRefs(f);
    const ws = f.acroField.getWidgets();
    const radioValues = f instanceof PDFRadioGroup ? f.getOptions() : [];
    const widgets: Widget[] = [];
    ws.forEach((w, i) => {
      const ref = refs[i];
      let pi = ref ? onPage.get(refKey(ref)) : undefined;
      if (pi == null) {
        const p = w.P();
        if (p) pi = doc.getPages().findIndex((pg) => pg.ref === p);
      }
      if (pi == null || pi < 0 || !pages[pi]) return;
      const r = w.getRectangle();
      const box = fromPdfRect(pages[pi], [r.x, r.y, r.x + r.width, r.y + r.height] as PdfRect);
      const id = ref ? `w${refKey(ref).replace(" ", "_")}` : `w${f.ref.objectNumber}_${i}`;
      const widget: Widget = { id, page: pages[pi].id, ...box, ref: ref ? refKey(ref) : undefined };
      if (kind === "radio") widget.on = radioValues[i] ?? w.getOnValue()?.decodeText();
      if (kind === "checkbox") widget.on = w.getOnValue()?.decodeText() ?? "Yes";
      // Annotation flags: Hidden (2) or NoView (32) widgets stay hidden in the editor, as viewers do.
      const flags = w.dict.lookup(N("F"));
      if (flags instanceof PDFNumber && flags.asNumber() & (2 | 32)) widget.hidden = true;
      const ap = w.dict.lookup(N("AP"));
      if (kind === "signature" && ap instanceof PDFDict && ap.lookup(N("N")) instanceof PDFStream) widget.drawn = true;
      widgets.push(widget);
      pageIndexOrder.push({ id, page: pi, annotIndex: ref ? (annotIndex.get(refKey(ref)) ?? 1e6) : 1e6 });
    });

    let value: string | string[] = "";
    let options: string[] = [];
    let multiline = false;
    let maxLen: number | null = null;
    let comb = false;
    let multiSelect = false;
    let editable = false;
    if (f instanceof PDFTextField) {
      value = f.getText() ?? "";
      multiline = f.isMultiline();
      maxLen = f.getMaxLength() ?? null;
      comb = f.isCombed();
    } else if (f instanceof PDFCheckBox) {
      value = f.isChecked() ? (widgets[0]?.on ?? "Yes") : "";
    } else if (f instanceof PDFRadioGroup) {
      value = f.getSelected() ?? "";
      options = radioValues;
    } else if (f instanceof PDFDropdown) {
      value = f.getSelected()[0] ?? "";
      options = f.getOptions();
      editable = f.isEditable();
    } else if (f instanceof PDFOptionList) {
      value = f.getSelected();
      options = f.getOptions();
      multiSelect = f.isMultiselect();
    }
    if (kind === "checkbox" && typeof value === "string" && value === "Off") value = "";

    state.fields.push({
      id: `f${f.ref.objectNumber}_${f.ref.generationNumber}`,
      kind,
      name: f.getName(),
      tooltip: textOf(f.acroField.dict.lookup(N("TU"))) ?? "",
      widgets,
      value,
      defaultValue: defaultValueOf(f),
      required: f.isRequired(),
      readOnly: f.isReadOnly() || kind === "button",
      multiline,
      maxLen,
      comb,
      options,
      multiSelect,
      editable,
      style: styleOf(f, ws[0]),
      origin: "file",
      ref: refKey(f.ref),
    });
  }
  // The file's own order: page by page, each page's widgets in /Annots order.
  state.order = pageIndexOrder.sort((a, b) => a.page - b.page || a.annotIndex - b.annotIndex).map((x) => x.id);
  state.originalOrder = [...state.order];
  return state;
}

function annotPositions(doc: PDFDocument): Map<string, number> {
  const map = new Map<string, number>();
  for (const page of doc.getPages()) {
    const annots = page.node.lookup(N("Annots"));
    if (!(annots instanceof PDFArray)) continue;
    for (let k = 0; k < annots.size(); k++) {
      const raw = annots.get(k);
      if (raw instanceof PDFRef) map.set(refKey(raw), k);
    }
  }
  return map;
}

/** Loads a file (decrypting it with `password` when needed) and reads its form, for the editor. */
export async function readFormFromBytes(bytes: Uint8Array, password?: string): Promise<{ form: FormState; xfa: boolean }> {
  const { PDFDocument: Doc } = await import("@cantoo/pdf-lib");
  const probe = await Doc.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const doc = probe.isEncrypted ? await Doc.load(bytes, { password: password ?? "", updateMetadata: false }) : probe;
  const xfa = hasXfa(doc);
  return { form: readForm(doc, pagesOf(doc)), xfa };
}

/** True when the document has an XFA form (shown as a banner: fill what the AcroForm part allows). */
export function hasXfa(doc: PDFDocument): boolean {
  if (xfaSeen.get(doc)) return true;
  const acro = doc.catalog.lookup(N("AcroForm"));
  return acro instanceof PDFDict && acro.get(N("XFA")) != null;
}

/** Whether a document had XFA when its form was read (getForm() may have removed it since). */
const xfaSeen = new WeakMap<PDFDocument, boolean>();
