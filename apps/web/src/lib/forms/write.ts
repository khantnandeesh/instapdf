/**
 * Writes the form model into a document (AC-231 to AC-239, AC-247). Runs inside the editor's
 * download build, after pages are ordered and objects drawn: `applyForms(doc, out, pages, state, original)`.
 *
 * - Fields from the file that the user removed are deleted with all their widgets.
 * - Fields from the file are changed only where the model differs from what was read, so untouched
 *   fields keep their appearance byte for byte (AC-231).
 * - New fields are created with pdf-lib; signature fields are built by hand with a visible
 *   "Sign here" appearance (AC-237).
 * - Each changed field gets fresh appearance streams in a font that covers its text (AC-232).
 * - Widget boxes come from the page frame; on turned pages `MK /R` turns the text upright (AC-238).
 * - `/Annots`, `/Tabs` and `/Fields` follow the tab order (AC-239).
 */
import {
  PDFArray,
  PDFCheckBox,
  PDFDict,
  PDFDropdown,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFOptionList,
  PDFRadioGroup,
  PDFRef,
  PDFString,
  PDFTextField,
  PDFWidgetAnnotation,
  layoutMultilineText,
  StandardFonts,
  TextAlignment,
  degrees,
  rgb,
  type PDFDocument,
  type PDFField,
  type PDFFont,
  type PDFObject,
  type PDFPage,
} from "@cantoo/pdf-lib";
import { pageTurn, toPdfRect, type PdfRect } from "./frame";
import { bestSlice, needsNoGlyph } from "./coverage";
import { clipToMaxLen } from "./model";
import { renamedTo } from "./names";
import { kindOf, refKey, widgetRefs } from "./read";
import type { FormField, FormPage, FormState, Widget } from "./types";

const N = (s: string) => PDFName.of(s);

/**
 * Font files for text that Helvetica (WinAnsi) cannot show. `forms` is Noto Sans with Latin,
 * Latin Extended, Greek, Cyrillic and Vietnamese in one font (public/fonts/forms), since a field
 * has one font; the Noto slices Merge uses cover other scripts.
 */
export type FormFonts = {
  manifest: () => Promise<{ fonts: { file: string; ranges: [number, number][] }[] }>;
  load: (file: string) => Promise<Uint8Array>;
  forms?: () => Promise<Uint8Array>;
};

type FontKit = Parameters<PDFDocument["registerFontkit"]>[0];

export type ApplyOptions = { fonts?: FormFonts; fontkit?: FontKit | (() => Promise<FontKit>) };

export type ApplyReport = {
  created: number;
  changed: number;
  deleted: number;
  /** Characters no available font could draw (written as "?"). */
  missingGlyphs: string[];
};

const hexToRgb = (hex: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1], 16) : 0;
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};
const comps = (hex: string) => {
  const c = hexToRgb(hex);
  return [c.red, c.green, c.blue];
};
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const ALIGN = { left: TextAlignment.Left, center: TextAlignment.Center, right: TextAlignment.Right } as const;

/** Picks fonts per field: Helvetica when it can encode the text, else the first Noto slice that covers it. */
class Fonts {
  private helv: PDFFont | null = null;
  private embedded = new Map<string, Promise<PDFFont>>();
  private manifest: { file: string; ranges: [number, number][] }[] | null = null;
  private kitReady = false;
  readonly missing = new Set<string>();
  private drNames = new Map<PDFFont, string>();
  constructor(
    private doc: PDFDocument,
    private opts: ApplyOptions,
  ) {}

  helvetica(): PDFFont {
    if (!this.helv) this.helv = this.doc.embedStandardFont(StandardFonts.Helvetica);
    return this.helv;
  }

  private charsets = new Map<PDFFont, Set<number>>();
  /** True when the font has a glyph for every character. pdf-lib's encodeText writes "?" for a
   * character Helvetica lacks instead of throwing, so the character set is checked. */
  private covers(font: PDFFont, text: string): boolean {
    let set = this.charsets.get(font);
    if (!set) this.charsets.set(font, (set = new Set(font.getCharacterSet())));
    for (const ch of text) if (!needsNoGlyph(ch) && !set.has(ch.codePointAt(0)!)) return false;
    return true;
  }

  /** The text with characters the font lacks replaced by "?", each noted in `missing`. */
  private cleaner(font: PDFFont): (s: string) => string {
    return (s) =>
      [...s]
        .map((ch) => {
          if (this.covers(font, ch)) return ch;
          this.missing.add(ch);
          return "?";
        })
        .join("");
  }

  /** The font for a field's text, and the text with characters no font covers replaced by "?". */
  async pick(text: string): Promise<{ font: PDFFont; clean: (s: string) => string }> {
    const helv = this.helvetica();
    if (this.covers(helv, text)) return { font: helv, clean: (s) => s };
    const candidates: PDFFont[] = [];
    if (this.opts.fonts?.forms) {
      const forms = await this.embed("forms", () => this.opts.fonts!.forms!());
      if (this.covers(forms, text)) return { font: forms, clean: (s) => s };
      candidates.push(forms);
    }
    if (this.opts.fonts) {
      if (!this.manifest) this.manifest = (await this.opts.fonts.manifest()).fonts;
      // The slice that covers the most of the text, for scripts the forms font lacks.
      const best = bestSlice(text, this.manifest);
      if (best) candidates.push(await this.embed(best.file, () => this.opts.fonts!.load(best.file)));
    }
    // The font that draws the most characters; the rest are written as "?" and reported.
    const chars = [...text];
    let font = helv;
    let most = chars.filter((ch) => this.covers(helv, ch)).length;
    for (const c of candidates) {
      const n = chars.filter((ch) => this.covers(c, ch)).length;
      if (n > most) {
        font = c;
        most = n;
      }
    }
    return { font, clean: this.cleaner(font) };
  }

  private async embed(key: string, load: () => Promise<Uint8Array>): Promise<PDFFont> {
    let p = this.embedded.get(key);
    if (!p) {
      p = (async () => {
        if (!this.kitReady) {
          const kit = typeof this.opts.fontkit === "function" ? await (this.opts.fontkit as () => Promise<FontKit>)() : this.opts.fontkit;
          if (!kit) throw new Error("A fontkit is needed to embed form fonts");
          this.doc.registerFontkit(kit);
          this.kitReady = true;
        }
        // A subset: only the glyphs the appearances use, so the file stays small.
        return this.doc.embedFont(await load(), { subset: true });
      })();
      this.embedded.set(key, p);
    }
    return p;
  }

  /** The appearance streams name the font by its own name; /DR lists that name too. */
  ensureDr(font: PDFFont) {
    this.drName(font);
    const dr = this.doc.getForm().acroForm.dict.lookup(N("DR"), PDFDict);
    const fontsDict = dr.lookup(N("Font"), PDFDict);
    if (!fontsDict.get(N(font.name))) fontsDict.set(N(font.name), font.ref);
  }

  /** The font's resource name in the AcroForm /DR, adding it there if needed. */
  drName(font: PDFFont): string {
    let name = this.drNames.get(font);
    if (name) return name;
    const form = this.doc.getForm();
    const acro = form.acroForm.dict;
    let dr = acro.lookup(N("DR"));
    if (!(dr instanceof PDFDict)) {
      dr = this.doc.context.obj({});
      acro.set(N("DR"), dr as PDFDict);
    }
    let fontsDict = (dr as PDFDict).lookup(N("Font"));
    if (!(fontsDict instanceof PDFDict)) {
      fontsDict = this.doc.context.obj({});
      (dr as PDFDict).set(N("Font"), fontsDict as PDFDict);
    }
    if (font === this.helv) {
      // Reuse /Helv when the file has it, so DA strings stay as viewers expect.
      name = "Helv";
      if (!(fontsDict as PDFDict).get(N(name))) (fontsDict as PDFDict).set(N(name), font.ref);
    } else {
      let i = 1;
      while ((fontsDict as PDFDict).get(N(`BerryF${i}`))) i++;
      name = `BerryF${i}`;
      (fontsDict as PDFDict).set(N(name), font.ref);
    }
    this.drNames.set(font, name);
    return name;
  }
}

/** Builds a DA string for a field's style and font. */
function daString(fontName: string, f: FormField): string {
  const c = hexToRgb(f.style.color);
  return `/${fontName} ${f.style.fontSize || 0} Tf ${c.red.toFixed(3)} ${c.green.toFixed(3)} ${c.blue.toFixed(3)} rg`;
}

function setTooltip(field: PDFField, tooltip: string) {
  if (tooltip) field.acroField.dict.set(N("TU"), PDFHexString.fromText(tooltip));
  else field.acroField.dict.delete(N("TU"));
}

function setFlags(field: PDFField, f: FormField) {
  if (f.required) field.enableRequired();
  else field.disableRequired();
  if (f.readOnly) field.enableReadOnly();
  else field.disableReadOnly();
}

/** Puts one widget's box, page link, turn and colours in place. */
function placeWidget(doc: PDFDocument, field: PDFField, index: number, w: Widget, f: FormField, page: PDFPage, entry: FormPage) {
  const widget = field.acroField.getWidgets()[index];
  if (!widget) return;
  const r = toPdfRect(entry, w);
  widget.setRectangle({ x: r[0], y: r[1], width: r[2] - r[0], height: r[3] - r[1] });
  widget.setP(page.ref);
  const mk = widget.getOrCreateAppearanceCharacteristics();
  mk.setRotation(pageTurn(entry));
  if (f.style.border) mk.setBorderColor(comps(f.style.border));
  else mk.dict.delete(N("BC"));
  if (f.style.background) mk.setBackgroundColor(comps(f.style.background));
  else mk.dict.delete(N("BG"));
  widget.getOrCreateBorderStyle().setWidth(f.style.border ? f.style.borderWidth : 0);
  void doc;
}

function addAnnotOnce(page: PDFPage, ref: PDFRef) {
  const annots = page.node.Annots();
  if (annots) for (let i = 0; i < annots.size(); i++) if (annots.get(i) === ref) return;
  page.node.addAnnot(ref);
}

function removeAnnot(page: PDFPage, ref: PDFRef) {
  page.node.removeAnnot(ref);
}

export async function applyForms(doc: PDFDocument, out: PDFPage[], pages: FormPage[], state: FormState, original: FormState, opts: ApplyOptions = {}): Promise<ApplyReport> {
  const report: ApplyReport = { created: 0, changed: 0, deleted: 0, missingGlyphs: [] };
  const hasFields = state.fields.length > 0 || original.fields.length > 0;
  if (!hasFields) return report;
  const form = doc.getForm();
  const fonts = new Fonts(doc, opts);
  const pageOf = new Map(pages.map((p, i) => [p.id, { page: out[i], entry: p }]));
  const byRef = new Map(form.getFields().map((f) => [refKey(f.ref), f]));
  const origById = new Map(original.fields.map((f) => [f.id, f]));
  const keep = new Set(state.fields.map((f) => f.id));
  /** Widget model id → its ref in the output. */
  const widgetRef = new Map<string, PDFRef>();
  /** Fields whose appearance must be regenerated. */
  const dirty: { field: PDFField; model: FormField }[] = [];

  // 1. Fields the user deleted.
  for (const o of original.fields) {
    if (keep.has(o.id) || !o.ref) continue;
    const field = byRef.get(o.ref);
    if (!field) continue;
    for (const w of o.widgets) {
      const ref = w.ref ? refFromKey(doc, w.ref) : undefined;
      if (ref) for (const p of out) removeAnnot(p, ref);
    }
    try {
      form.removeField(field);
    } catch {
      // A field whose widgets were already unlinked: drop it from /Fields directly.
      form.acroForm.removeField(field.acroField);
    }
    report.deleted++;
  }

  // 2. Fields from the file: change only what differs.
  for (const f of state.fields) {
    if (!f.ref) continue;
    let field = byRef.get(f.ref);
    const o = origById.get(f.id);
    if (!field || !o) continue;
    let changed = false;
    let looks = false;
    let limits = false;

    // A field merged with its only widget gets a separate widget kid before widgets are added.
    if (f.widgets.some((w) => !w.ref) && !field.acroField.Kids()) field = splitMerged(doc, form, field);

    if (f.name !== o.name) {
      renameFileField(doc, form, field, renamedTo(o.name, f.name));
      changed = true;
    }
    if (f.tooltip !== o.tooltip) {
      setTooltip(field, f.tooltip);
      changed = true;
    }
    if (f.required !== o.required || f.readOnly !== o.readOnly) {
      if (kindOf(field) !== "button") setFlags(field, f);
      changed = true;
    }
    if (field instanceof PDFTextField) {
      if (f.multiline !== o.multiline) {
        if (f.multiline) field.enableMultiline();
        else field.disableMultiline();
        looks = true;
      }
      if (f.comb !== o.comb || f.maxLen !== o.maxLen) {
        // Written together with the value below, so a shorter limit never meets a longer value.
        limits = true;
        looks = true;
      }
      if (f.style.align !== o.style.align) {
        field.setAlignment(ALIGN[f.style.align]);
        looks = true;
      }
    }
    if ((field instanceof PDFDropdown || field instanceof PDFOptionList) && !same(f.options, o.options)) {
      field.setOptions(f.options);
      looks = true;
    }
    if (field instanceof PDFDropdown && f.editable !== o.editable) {
      if (f.editable) field.enableEditing();
      else field.disableEditing();
    }
    if (field instanceof PDFOptionList && f.multiSelect !== o.multiSelect) {
      if (f.multiSelect) field.enableMultiselect();
      else field.disableMultiselect();
    }
    if (!same(f.style, o.style)) looks = true;

    // Widgets: removed, moved, added.
    const refs = widgetRefs(field);
    const keepW = new Set(f.widgets.map((w) => w.id));
    for (const ow of o.widgets) {
      if (keepW.has(ow.id) || !ow.ref) continue;
      removeWidget(doc, field, ow.ref, out);
      changed = true;
    }
    const refsNow = widgetRefs(field).map((r) => (r ? refKey(r) : ""));
    for (const w of f.widgets) {
      const target = pageOf.get(w.page);
      if (!target) continue;
      if (w.ref) {
        const i = refsNow.indexOf(w.ref);
        const ow = o.widgets.find((x) => x.id === w.id);
        const ref = refs.find((r) => r && refKey(r) === w.ref);
        if (ref) widgetRef.set(w.id, ref);
        if (field instanceof PDFRadioGroup && i >= 0 && ow?.on != null && w.on != null && ow.on !== w.on) {
          renameRadioExport(field, i, w.on);
          looks = true;
        }
        if (i >= 0 && ow && (ow.x !== w.x || ow.y !== w.y || ow.w !== w.w || ow.h !== w.h || ow.page !== w.page || looks)) {
          placeWidget(doc, field, i, w, f, target.page, target.entry);
          if (ow.page !== w.page && ref) {
            for (const p of out) removeAnnot(p, ref);
            addAnnotOnce(target.page, ref);
          }
          looks = true;
        }
      } else {
        const ref = addWidget(doc, field, f, w, target.page, target.entry);
        if (ref) widgetRef.set(w.id, ref);
        looks = true;
      }
    }

    if (!same(f.value, o.value) || limits) {
      setFieldValue(field, f);
      looks = true;
    }
    if (looks || changed) report.changed++;
    if (looks) dirty.push({ field, model: f });
  }

  // 3. New fields.
  for (const f of state.fields) {
    if (f.ref) continue;
    const created = await createField(doc, f, pageOf, widgetRef, fonts);
    if (created) {
      dirty.push({ field: created, model: f });
      report.created++;
    }
  }

  // 4. Appearances, in a font that covers the text.
  for (const { field, model } of dirty) await refreshAppearance(doc, field, model, fonts, pageOf);

  // 5. Tab order: /Annots per page, /Tabs, /Fields.
  applyOrder(doc, out, pages, state, widgetRef, form);

  report.missingGlyphs = [...fonts.missing];
  return report;
}

function refFromKey(doc: PDFDocument, key: string): PDFRef | undefined {
  const [num, gen] = key.split(" ").map(Number);
  const ref = PDFRef.of(num, gen);
  return doc.context.lookup(ref) ? ref : undefined;
}

function removeWidget(doc: PDFDocument, field: PDFField, key: string, out: PDFPage[]) {
  const ref = refFromKey(doc, key);
  if (!ref) return;
  for (const p of out) removeAnnot(p, ref);
  const kids = field.acroField.Kids();
  if (!kids) return;
  for (let i = kids.size() - 1; i >= 0; i--) {
    const kid = kids.get(i);
    if (!(kid instanceof PDFRef) || refKey(kid) !== key) continue;
    kids.remove(i);
    // Buttons keep one export value per widget in /Opt: drop this widget's, so the others keep theirs.
    if (field instanceof PDFRadioGroup || field instanceof PDFCheckBox) {
      const opt = field.acroField.dict.lookup(N("Opt"));
      if (opt instanceof PDFArray && i < opt.size()) opt.remove(i);
    }
  }
}

/**
 * Text value, max length and comb, in an order that cannot fail: the limit is lifted, the value
 * written (cut to the limit), then the limit and comb set again. pdf-lib counts UTF-16 units.
 */
function writeText(field: PDFTextField, f: FormField) {
  const max = f.maxLen != null && f.maxLen > 0 ? f.maxLen : null;
  const text = max == null ? String(f.value) : clipToMaxLen(String(f.value), max);
  field.disableCombing();
  field.removeMaxLength();
  field.setText(text || undefined);
  if (max != null) field.setMaxLength(max);
  if (f.comb && max != null) field.enableCombing();
}

/** Renames one radio button's export value: in /Opt when the field has one, else its appearance state names. */
function renameRadioExport(field: PDFRadioGroup, index: number, to: string) {
  const opt = field.acroField.dict.lookup(N("Opt"));
  if (opt instanceof PDFArray && index < opt.size()) {
    opt.set(index, PDFHexString.fromText(to));
    return;
  }
  const widget = field.acroField.getWidgets()[index];
  const from = widget?.getOnValue();
  if (!widget || !from) return;
  const next = N(to);
  const ap = widget.dict.lookup(N("AP"));
  if (ap instanceof PDFDict) {
    for (const k of ["N", "D", "R"]) {
      const sub = ap.lookup(N(k));
      if (!(sub instanceof PDFDict)) continue;
      const v = sub.get(from);
      if (v === undefined) continue;
      sub.delete(from);
      sub.set(next, v);
    }
  }
  if (widget.getAppearanceState() === from) widget.setAppearanceState(next);
  if (field.acroField.dict.get(N("V")) === from) field.acroField.dict.set(N("V"), next);
}

/** Field-level keys of a dictionary that is both a field and its widget. */
const FIELD_KEYS = ["FT", "T", "TU", "TM", "Ff", "V", "DV", "DA", "Q", "DS", "RV", "MaxLen", "Opt", "TI", "I", "Lock", "SV", "Parent"];

/**
 * A field merged with its only widget becomes a field with that widget as its one kid, so more
 * widgets can be added (pdf-lib would otherwise make the dictionary its own kid's parent).
 */
function splitMerged(doc: PDFDocument, form: ReturnType<PDFDocument["getForm"]>, field: PDFField): PDFField {
  const ctx = doc.context;
  const widgetRef = field.ref;
  const dict = field.acroField.dict;
  const fieldDict = obj(doc, {});
  for (const k of FIELD_KEYS) {
    const v = dict.get(N(k));
    if (v === undefined) continue;
    fieldDict.set(N(k), v);
    dict.delete(N(k));
  }
  // Field triggers are read from the field and annotation triggers from the widget: both keep them.
  const aa = dict.get(N("AA"));
  if (aa) fieldDict.set(N("AA"), aa);
  fieldDict.set(N("Kids"), ctx.obj([widgetRef]));
  const fieldRef = ctx.register(fieldDict);
  dict.set(N("Parent"), fieldRef);
  const parent = fieldDict.get(N("Parent"));
  const holder = parent instanceof PDFRef ? ctx.lookup(parent, PDFDict).lookup(N("Kids")) : form.acroForm.dict.lookup(N("Fields"));
  if (holder instanceof PDFArray) {
    for (let i = 0; i < holder.size(); i++) {
      const r = holder.get(i);
      if (r instanceof PDFRef && refKey(r) === refKey(widgetRef)) holder.set(i, fieldRef);
    }
  }
  return form.getFields().find((x) => refKey(x.ref) === refKey(fieldRef)) ?? field;
}

/** Attributes a kid may inherit from its parent; copied down when a field leaves its parent. */
const INHERITED = ["FT", "Ff", "V", "DV", "DA", "Q", "MaxLen", "Opt"];

/**
 * Renames a field from the file. Within the same parent only the last part changes; a new parent
 * part moves the field to the top level (see `renamedTo`). The full name never matches another field's.
 */
function renameFileField(doc: PDFDocument, form: ReturnType<PDFDocument["getForm"]>, field: PDFField, name: string) {
  const cut = (s: string): [string, string] => {
    const i = s.lastIndexOf(".");
    return i < 0 ? ["", s] : [s.slice(0, i), s.slice(i + 1)];
  };
  const [curPrefix] = cut(field.getName());
  const [prefix, partial] = cut(name);
  const parentName = prefix === curPrefix ? curPrefix : "";
  if (prefix !== curPrefix) detach(doc, form, field);
  const base = prefix === curPrefix ? partial : name.replace(/\./g, "_");
  const taken = new Set(form.getFields().filter((x) => refKey(x.ref) !== refKey(field.ref)).map((x) => x.getName()));
  const full = (p: string) => (parentName ? `${parentName}.${p}` : p);
  let p = base;
  for (let n = 2; taken.has(full(p)); n++) p = `${base}_${n}`;
  field.acroField.setPartialName(p);
}

/** Moves a field to the top level, keeping what it inherited; a parent left with no kids goes too. */
function detach(doc: PDFDocument, form: ReturnType<PDFDocument["getForm"]>, field: PDFField) {
  const dict = field.acroField.dict;
  const parentRef = dict.get(N("Parent"));
  if (!(parentRef instanceof PDFRef)) return;
  for (const k of INHERITED) {
    if (dict.has(N(k))) continue;
    const v = field.acroField.getInheritableAttribute(N(k));
    if (v !== undefined) dict.set(N(k), v);
  }
  dict.delete(N("Parent"));
  dropFrom(doc, form, parentRef, field.ref);
  form.acroForm.addField(field.ref);
}

function dropFrom(doc: PDFDocument, form: ReturnType<PDFDocument["getForm"]>, holderRef: PDFRef | undefined, ref: PDFRef) {
  const holder = holderRef ? doc.context.lookup(holderRef) : undefined;
  const arr = holder instanceof PDFDict ? holder.lookup(N("Kids")) : form.acroForm.dict.lookup(N("Fields"));
  if (!(arr instanceof PDFArray)) return;
  for (let i = arr.size() - 1; i >= 0; i--) {
    const r = arr.get(i);
    if (r instanceof PDFRef && refKey(r) === refKey(ref)) arr.remove(i);
  }
  if (holderRef && holder instanceof PDFDict && arr.size() === 0) {
    const up = holder.get(N("Parent"));
    dropFrom(doc, form, up instanceof PDFRef ? up : undefined, holderRef);
  }
}

function setFieldValue(field: PDFField, f: FormField) {
  if (field instanceof PDFTextField) {
    writeText(field, f);
  } else if (field instanceof PDFCheckBox) {
    if (f.value) field.check();
    else field.uncheck();
  } else if (field instanceof PDFRadioGroup) {
    if (f.value) field.select(String(f.value));
    else field.clear();
  } else if (field instanceof PDFDropdown) {
    // select(value, merge): never merge, a dropdown holds one value (own text on editable ones).
    if (f.value) field.select(String(f.value));
    else field.clear();
  } else if (field instanceof PDFOptionList) {
    const v = Array.isArray(f.value) ? f.value : f.value ? [f.value] : [];
    if (v.length) field.select(v);
    else field.clear();
  }
}

/** Adds a widget for a field that already exists (repeat on all pages, an added radio button). */
function addWidget(doc: PDFDocument, field: PDFField, f: FormField, w: Widget, page: PDFPage, entry: FormPage): PDFRef | undefined {
  const r = toPdfRect(entry, w);
  const base = { x: r[0], y: r[1], width: r[2] - r[0], height: r[3] - r[1], rotate: degrees(pageTurn(entry)), borderWidth: 0 };
  if (field instanceof PDFRadioGroup) field.addOptionToPage(w.on ?? "Choice", page, base);
  else if (field instanceof PDFTextField || field instanceof PDFCheckBox || field instanceof PDFDropdown || field instanceof PDFOptionList) field.addToPage(page, base);
  else return addSignatureWidget(doc, field, f, w, page, entry);
  const refs = widgetRefs(field);
  const ref = refs[refs.length - 1];
  const i = field.acroField.getWidgets().length - 1;
  placeWidget(doc, field, i, w, f, page, entry);
  return ref;
}

async function createField(
  doc: PDFDocument,
  f: FormField,
  pageOf: Map<string, { page: PDFPage; entry: FormPage }>,
  widgetRef: Map<string, PDFRef>,
  fonts: Fonts,
): Promise<PDFField | null> {
  const form = doc.getForm();
  const placed = f.widgets.filter((w) => pageOf.has(w.page));
  if (!placed.length) return null;
  const name = freeName(doc, f.name);
  let field: PDFField;
  switch (f.kind) {
    case "text": {
      const t = form.createTextField(name);
      if (f.multiline) t.enableMultiline();
      // Max length and comb are set with the value (`writeText`).
      t.setAlignment(ALIGN[f.style.align]);
      field = t;
      break;
    }
    case "checkbox":
      field = form.createCheckBox(name);
      break;
    case "radio":
      field = form.createRadioGroup(name);
      break;
    case "dropdown": {
      const d = form.createDropdown(name);
      d.setOptions(f.options);
      if (f.editable) d.enableEditing();
      field = d;
      break;
    }
    case "list": {
      const l = form.createOptionList(name);
      l.setOptions(f.options);
      if (f.multiSelect) l.enableMultiselect();
      field = l;
      break;
    }
    case "signature":
      return createSignature(doc, f, name, pageOf, widgetRef);
    default:
      return null;
  }
  setTooltip(field, f.tooltip);
  if (f.kind !== "radio" && f.kind !== "checkbox") {
    const { font } = await fonts.pick(textForFont(f));
    field.acroField.setDefaultAppearance(daString(fonts.drName(font), f));
  }
  for (const w of placed) {
    const { page, entry } = pageOf.get(w.page)!;
    const ref = addWidget(doc, field, f, w, page, entry);
    if (ref) widgetRef.set(w.id, ref);
  }
  setFlags(field, f);
  setFieldValue(field, f);
  setDefault(doc, field, f);
  return field;
}

/** A name not used by any field in the document (the model's names are unique, the file's may not be). */
function freeName(doc: PDFDocument, name: string): string {
  const taken = new Set(doc.getForm().getFields().map((f) => f.getName()));
  if (!taken.has(name)) return name;
  for (let n = 2; ; n++) if (!taken.has(`${name}_${n}`)) return `${name}_${n}`;
}

function setDefault(doc: PDFDocument, field: PDFField, f: FormField) {
  const dv = f.defaultValue;
  if (Array.isArray(dv) ? !dv.length : !dv) return;
  if (f.kind === "checkbox" || f.kind === "radio") field.acroField.dict.set(N("DV"), N(String(dv)));
  else if (Array.isArray(dv)) field.acroField.dict.set(N("DV"), doc.context.obj(dv.map((v) => PDFHexString.fromText(v))));
  else field.acroField.dict.set(N("DV"), PDFHexString.fromText(dv));
}

const textForFont = (f: FormField) => [...(Array.isArray(f.value) ? f.value : [f.value]), ...(f.kind === "dropdown" || f.kind === "list" ? f.options : [])].join("");

/** A widget's border width: /BS /W, else the legacy /Border array's third number, else 1. */
function borderWidthOf(widget: PDFWidgetAnnotation): number {
  const bs = widget.getBorderStyle();
  if (bs) return bs.getWidth() ?? 1;
  const legacy = widget.dict.lookup(N("Border"));
  if (legacy instanceof PDFArray && legacy.size() >= 3) {
    const w = legacy.lookup(2);
    if (w instanceof PDFNumber) return w.asNumber();
  }
  return 1;
}

/** The largest size at which every option of a list fits its box (pdf-lib's 1.2 line spacing). */
function listFit(f: FormField, font: PDFFont, widget: PDFWidgetAnnotation, bw: number): number {
  const r = widget.getRectangle();
  const inner = Math.max(1, r.height - 2 * (bw + 1));
  return inner / Math.max(1, f.options.length) / (1.2 * font.heightAtSize(1));
}

/**
 * The size an "Auto" (0 Tf) field is drawn at: 12 pt, or smaller until the text fits the box
 * (wrapped lines for multi-line fields, one cell for combs, every option for lists). The DA keeps
 * 0 so other viewers size it themselves (G-3).
 */
function autoSize(f: FormField, font: PDFFont, widget: PDFWidgetAnnotation, bw: number): number {
  const r = widget.getRectangle();
  const rot = ((widget.getAppearanceCharacteristics()?.getRotation() ?? 0) % 180 + 180) % 180;
  const [w, h] = rot === 90 ? [r.height, r.width] : [r.width, r.height];
  const pad = bw + 1;
  const bounds = { x: pad, y: pad, width: Math.max(1, w - 2 * pad), height: Math.max(1, h - 2 * pad) };
  const text = Array.isArray(f.value) ? "" : String(f.value);
  const fits = (size: number): boolean => {
    if (f.kind === "list") return f.options.length * 1.2 * font.heightAtSize(size) <= bounds.height;
    if (f.kind === "text" && f.multiline) {
      const { lines, lineHeight } = layoutMultilineText(text || " ", { alignment: TextAlignment.Left, fontSize: size, font, bounds });
      return lines.length * lineHeight <= bounds.height + 0.01;
    }
    if (font.heightAtSize(size, { descender: true }) > bounds.height) return false;
    if (f.kind === "text" && f.comb && f.maxLen) return font.widthOfTextAtSize("W", size) <= bounds.width / f.maxLen;
    return !text || font.widthOfTextAtSize(text, size) <= bounds.width - 2;
  };
  // Fitting only gets easier as the size drops: binary-search the half-point steps from 4 to 12,
  // so a long multi-line value is laid out about 4 times, not 16.
  let lo = 8; // 4 pt, in half points: always used when nothing larger fits
  let hi = 24;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (fits(mid / 2)) lo = mid;
    else hi = mid - 1;
  }
  return lo / 2;
}

async function refreshAppearance(doc: PDFDocument, field: PDFField, f: FormField, fonts: Fonts, pageOf: Map<string, { page: PDFPage; entry: FormPage }>) {
  const widgets = field.acroField.getWidgets();
  // Legacy /Border widths become /BS, which the appearance builder reads (G-6).
  for (const w of widgets) {
    if (w.getBorderStyle() || !(w.dict.lookup(N("Border")) instanceof PDFArray)) continue;
    const width = borderWidthOf(w); // before /BS exists: once it does, it is what borderWidthOf reads
    w.getOrCreateBorderStyle().setWidth(width);
  }
  if (field instanceof PDFCheckBox || field instanceof PDFRadioGroup) {
    field.defaultUpdateAppearances();
    // Buttons have no variable text: drop the placeholder DA pdf-lib writes (G-3).
    for (const d of new Set([field.acroField.dict, ...widgets.map((w) => w.dict)])) {
      const da = d.lookup(N("DA"));
      if (da && String(da).includes("dummy__noop")) d.delete(N("DA"));
    }
    return;
  }
  if (f.kind === "signature") {
    // Hand-made appearance (AC-237).
    f.widgets.forEach((w, i) => {
      const target = pageOf.get(w.page);
      if (widgets[i] && target) widgets[i].setNormalAppearance(signatureAppearance(doc, toPdfRect(target.entry, w), pageTurn(target.entry), fonts.helvetica(), f));
    });
    return;
  }
  if (!(field instanceof PDFTextField || field instanceof PDFDropdown || field instanceof PDFOptionList)) return;
  const { font, clean } = await fonts.pick(textForFont(f));
  // Characters no font can draw are written as "?" (and reported), never as a blank box.
  // The value itself (V) stays as typed; only the appearance shows "?".
  let keepV: ReturnType<PDFDict["get"]> | undefined;
  let keepOpts: { opt: ReturnType<PDFDict["get"]>; v: ReturnType<PDFDict["get"]>; i: ReturnType<PDFDict["get"]> } | undefined;
  if (field instanceof PDFTextField) {
    const v = field.getText();
    if (v && clean(v) !== v) {
      keepV = field.acroField.dict.get(N("V"));
      field.setText(clean(v));
    }
  } else {
    // Options and the value are drawn cleaned too, then the field's own Opt, V and I are put back.
    // Written straight into the dictionary: pdf-lib's select() would refuse a stored export code
    // or turn on editing or multi-select to fit the value.
    const d = field.acroField.dict;
    const ctx = doc.context;
    const textOf = (o: PDFObject | undefined) => (o instanceof PDFString || o instanceof PDFHexString ? o.decodeText() : null);
    let changed = false;
    const cleanObj = (o: PDFObject | undefined): PDFObject => {
      const t = textOf(o);
      if (t === null) return o ?? PDFHexString.fromText("");
      const c = clean(t);
      if (c === t) return o!;
      changed = true;
      return PDFHexString.fromText(c);
    };
    const opt = d.lookup(N("Opt"));
    const exportCodes = new Set<string>();
    const cleanedOpt =
      opt instanceof PDFArray
        ? opt.asArray().map((o) => {
            const e = o instanceof PDFRef ? ctx.lookup(o) : o;
            if (e instanceof PDFArray && e.size() >= 2) {
              const code = e.lookup(0);
              const t = textOf(code);
              if (t !== null) exportCodes.add(t);
              return ctx.obj([code ?? PDFHexString.fromText(""), cleanObj(e.lookup(1))]);
            }
            return cleanObj(e);
          })
        : null;
    // The value: a stored export code stays; text (an option's own text, or an editable
    // dropdown's typed text) is drawn cleaned.
    const cleanValue = (o: PDFObject | undefined) => {
      const t = textOf(o);
      return t !== null && exportCodes.has(t) ? o! : cleanObj(o);
    };
    const v = d.lookup(N("V"));
    const cleanedV = v instanceof PDFArray ? ctx.obj(v.asArray().map((x) => cleanValue(x instanceof PDFRef ? ctx.lookup(x) : x))) : v ? cleanValue(v) : undefined;
    if (changed) {
      keepOpts = { opt: d.get(N("Opt")), v: d.get(N("V")), i: d.get(N("I")) };
      if (cleanedOpt) d.set(N("Opt"), ctx.obj(cleanedOpt));
      if (cleanedV) d.set(N("V"), cleanedV);
    }
  }
  const name = fonts.drName(font);
  const da = daString(name, f);
  const fit = field instanceof PDFOptionList ? Math.min(...widgets.map((w) => listFit(f, font, w, borderWidthOf(w)))) : Infinity;
  // A widget's own DA wins over the field's when drawing: drop them so the field's style rules.
  for (const w of widgets) if (w.dict !== field.acroField.dict) w.dict.delete(N("DA"));
  if (f.style.fontSize > 0 && f.style.fontSize <= fit) {
    field.acroField.setDefaultAppearance(da);
    field.updateAppearances(font);
  } else if (f.style.fontSize > 0) {
    // A list whose options don't all fit at its size is drawn smaller, so none is cut off (G-18).
    for (const w of widgets) if (w.dict !== field.acroField.dict) w.dict.delete(N("DA"));
    field.acroField.setDefaultAppearance(daString(name, { ...f, style: { ...f.style, fontSize: Math.max(4, Math.floor(fit * 10) / 10) } }));
    field.updateAppearances(font);
    field.acroField.setDefaultAppearance(da);
  } else {
    // Auto: drawn at a size that fits the smallest widget, the DA left at 0 Tf.
    for (const w of widgets) if (w.dict !== field.acroField.dict) w.dict.delete(N("DA"));
    const size = Math.min(12, ...widgets.map((w) => autoSize(f, font, w, borderWidthOf(w))));
    field.acroField.setDefaultAppearance(daString(name, { ...f, style: { ...f.style, fontSize: size } }));
    field.updateAppearances(font);
    field.acroField.setDefaultAppearance(da);
  }
  // pdf-lib writes a widget DA naming the font by its own name; the field's DA (in /DR) rules.
  for (const w of widgets) if (w.dict !== field.acroField.dict) w.dict.delete(N("DA"));
  field.acroField.setDefaultAppearance(da);
  fonts.ensureDr(font);
  if (keepV) field.acroField.dict.set(N("V"), keepV);
  if (keepOpts) {
    const d = field.acroField.dict;
    for (const [k, v] of [["Opt", keepOpts.opt], ["V", keepOpts.v], ["I", keepOpts.i]] as const) {
      if (v) d.set(N(k), v);
      else d.delete(N(k));
    }
  }
}

/** Signature field built by hand: pdf-lib has no signature creation. */
function createSignature(doc: PDFDocument, f: FormField, name: string, pageOf: Map<string, { page: PDFPage; entry: FormPage }>, widgetRef: Map<string, PDFRef>): PDFField | null {
  const ctx = doc.context;
  const form = doc.getForm();
  const placed = f.widgets.filter((w) => pageOf.has(w.page));
  const fieldDict = obj(doc, { FT: "Sig", T: PDFHexString.fromText(name), Kids: [] });
  if (f.tooltip) fieldDict.set(N("TU"), PDFHexString.fromText(f.tooltip));
  if (f.required) fieldDict.set(N("Ff"), PDFNumber.of(2));
  const fieldRef = ctx.register(fieldDict);
  for (const w of placed) {
    const { page, entry } = pageOf.get(w.page)!;
    widgetRef.set(w.id, sigWidget(doc, fieldRef, f, w, page, entry));
  }
  form.acroForm.addField(fieldRef);
  return form.getFields().find((x) => x.ref === fieldRef) ?? null;
}

const obj = (doc: PDFDocument, o: Record<string, unknown>) => doc.context.obj(o as never) as unknown as PDFDict;

/** One signature widget, a kid of `fieldRef`, on `page`. */
function sigWidget(doc: PDFDocument, fieldRef: PDFRef, f: FormField, w: Widget, page: PDFPage, entry: FormPage): PDFRef {
  const mk: Record<string, unknown> = { R: pageTurn(entry) };
  if (f.style.border) mk.BC = comps(f.style.border);
  if (f.style.background) mk.BG = comps(f.style.background);
  const widget = obj(doc, { Type: "Annot", Subtype: "Widget", Rect: toPdfRect(entry, w), F: 4, P: page.ref, Parent: fieldRef, MK: mk, BS: { W: 0 } });
  const ref = doc.context.register(widget);
  const field = doc.context.lookup(fieldRef, PDFDict);
  const kids = field.lookup(N("Kids"));
  if (kids instanceof PDFArray) kids.push(ref);
  else field.set(N("Kids"), doc.context.obj([ref]));
  addAnnotOnce(page, ref);
  return ref;
}

/** Adds a widget to an existing signature field (repeat on all pages). Fields merged with their only widget are left as they are. */
function addSignatureWidget(doc: PDFDocument, field: PDFField, f: FormField, w: Widget, page: PDFPage, entry: FormPage): PDFRef | undefined {
  if (!field.acroField.Kids()) return undefined;
  return sigWidget(doc, field.ref, f, w, page, entry);
}

/**
 * The signature field's look (AC-237): a dashed border and a "Sign here" label, drawn upright for
 * the reader on turned pages. It is the widget's normal appearance, so every viewer shows it.
 */
function signatureAppearance(doc: PDFDocument, rect: PdfRect, turn: number, font: PDFFont, f: FormField): PDFRef {
  const w0 = rect[2] - rect[0];
  const h0 = rect[3] - rect[1];
  const sideways = turn === 90 || turn === 270;
  const w = sideways ? h0 : w0;
  const h = sideways ? w0 : h0;
  const border = f.style.border ? hexToRgb(f.style.border) : rgb(0.35, 0.35, 0.35);
  const label = "Sign here";
  const size = Math.max(4, Math.min(11, h * 0.4, (w - 8) / (font.widthOfTextAtSize(label, 1) || 1)));
  const tw = font.widthOfTextAtSize(label, size);
  const n = (x: number) => (Math.round(x * 1000) / 1000).toString();
  const ops = [
    f.style.background ? `q ${n(hexToRgb(f.style.background).red)} ${n(hexToRgb(f.style.background).green)} ${n(hexToRgb(f.style.background).blue)} rg 0 0 ${n(w)} ${n(h)} re f Q` : "",
    `q ${n(border.red)} ${n(border.green)} ${n(border.blue)} RG 0.75 w [3 2] 0 d 0.375 0.375 ${n(w - 0.75)} ${n(h - 0.75)} re S Q`,
    `BT /Helv ${n(size)} Tf 0.45 0.45 0.45 rg ${n(Math.max(4, (w - tw) / 2))} ${n((h - size * 0.7) / 2)} Td (${label}) Tj ET`,
  ].filter(Boolean);
  // Turn the drawing so it reads upright (same convention as MK /R).
  const matrix =
    turn === 90 ? [0, 1, -1, 0, h, 0] : turn === 180 ? [-1, 0, 0, -1, w, h] : turn === 270 ? [0, -1, 1, 0, 0, w] : [1, 0, 0, 1, 0, 0];
  const stream = doc.context.stream(ops.join("\n"), {
    Type: "XObject",
    Subtype: "Form",
    BBox: [0, 0, w, h],
    Matrix: matrix,
    Resources: { Font: { Helv: font.ref } },
  });
  return doc.context.register(stream);
}

/** `/Annots` order per page, `/Tabs`, and the AcroForm `/Fields` order follow the tab order (AC-239). */
function applyOrder(doc: PDFDocument, out: PDFPage[], pages: FormPage[], state: FormState, widgetRef: Map<string, PDFRef>, form: ReturnType<PDFDocument["getForm"]>) {
  const fieldOfWidget = new Map(state.fields.flatMap((f) => f.widgets.map((w) => [w.id, f] as const)));
  pages.forEach((entry, i) => {
    const page = out[i];
    const ids = state.order.filter((id) => fieldOfWidget.get(id)?.widgets.find((w) => w.id === id)?.page === entry.id);
    const wanted = ids.map((id) => widgetRef.get(id) ?? keyRef(doc, fieldOfWidget.get(id)!.widgets.find((w) => w.id === id)!.ref)).filter((r): r is PDFRef => !!r);
    const annots = page.node.Annots();
    if (annots && wanted.length) {
      // Only widgets that have a slot here are placed (a widget linked to the page by /P alone has none).
      const slots = new Set<string>();
      for (let a = 0; a < annots.size(); a++) {
        const raw = annots.get(a);
        if (raw instanceof PDFRef) slots.add(refKey(raw));
      }
      const placedHere = wanted.filter((r) => slots.has(refKey(r)));
      wanted.length = 0;
      wanted.push(...placedHere);
      const wantedSet = new Set(wanted.map(refKey));
      // Widget slots in /Annots get the widgets in tab order; other annotations keep their places.
      let k = 0;
      for (let a = 0; a < annots.size(); a++) {
        const raw = annots.get(a);
        if (raw instanceof PDFRef && wantedSet.has(refKey(raw))) annots.set(a, wanted[k++]);
      }
    }
    if (state.orderMode === "rows") page.node.set(N("Tabs"), N("R"));
    else if (state.orderMode === "columns") page.node.set(N("Tabs"), N("C"));
    else if (state.orderMode === "custom") page.node.delete(N("Tabs"));
  });

  // /Fields: top-level fields in the order of their first widget.
  const fieldsArr = form.acroForm.dict.lookup(N("Fields"));
  if (!(fieldsArr instanceof PDFArray)) return;
  const rank = new Map<string, number>();
  state.order.forEach((id, i) => {
    const ref = widgetRef.get(id) ?? keyRef(doc, fieldOfWidget.get(id)?.widgets.find((w) => w.id === id)?.ref);
    if (!ref) return;
    const top = topField(doc, ref);
    if (top && !rank.has(refKey(top))) rank.set(refKey(top), i);
  });
  const items: { raw: ReturnType<PDFArray["get"]>; r: number; i: number }[] = [];
  for (let i = 0; i < fieldsArr.size(); i++) {
    const raw = fieldsArr.get(i);
    items.push({ raw, r: raw instanceof PDFRef ? (rank.get(refKey(raw)) ?? 1e9) : 1e9, i });
  }
  items.sort((a, b) => a.r - b.r || a.i - b.i);
  items.forEach((it, i) => fieldsArr.set(i, it.raw));
}

const keyRef = (doc: PDFDocument, key: string | undefined) => (key ? refFromKey(doc, key) : undefined);

/** The top-level field a widget belongs to (follows /Parent). */
function topField(doc: PDFDocument, widget: PDFRef): PDFRef | undefined {
  let ref: PDFRef = widget;
  for (let hop = 0; hop < 32; hop++) {
    const dict = doc.context.lookup(ref);
    if (!(dict instanceof PDFDict)) return undefined;
    const parent = dict.get(N("Parent"));
    if (!(parent instanceof PDFRef)) return ref;
    ref = parent;
  }
  return ref;
}
