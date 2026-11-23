/**
 * Form fields in a merged document (spec F3 §3f "Form field modes"). Works on
 * the output document after its pages were copied: widgets on the output
 * pages lead to their fields, which become the new AcroForm. Flattening
 * happens on each source before copying (see merge.ts).
 */
import { PDFArray, PDFBool, PDFDict, PDFHexString, PDFName, PDFRef, PDFString, type PDFContext, type PDFDocument, type PDFObject, type PDFPage } from "@cantoo/pdf-lib";

export type FormMode = "remove" | "merge" | "rename" | "flatten";

const N = (s: string) => PDFName.of(s);
const WIDGET = N("Widget");
/** Keys that belong to the field (terminal field dictionary), not to the widget annotation. */
const FIELD_KEYS = ["FT", "T", "TU", "TM", "Ff", "V", "DV", "DA", "Q", "DS", "RV", "Opt", "TI", "I", "MaxLen", "Kids"];
/** Field keys a child inherits from its ancestors. */
const INHERITABLE = ["FT", "Ff", "V", "DV", "DA", "Q", "Opt", "MaxLen"];

const textOf = (o: PDFObject | undefined) => (o instanceof PDFString || o instanceof PDFHexString ? o.decodeText() : undefined);
const isWidget = (d: PDFDict) => d.lookup(N("Subtype")) === WIDGET;

function annotEntries(page: PDFPage): { array: PDFArray; items: { ref?: PDFRef; dict: PDFDict }[] } | null {
  const array = page.node.lookup(N("Annots"));
  if (!(array instanceof PDFArray)) return null;
  const items: { ref?: PDFRef; dict: PDFDict }[] = [];
  for (let i = 0; i < array.size(); i++) {
    const raw = array.get(i);
    const dict = array.lookup(i);
    if (dict instanceof PDFDict) items.push({ ref: raw instanceof PDFRef ? raw : undefined, dict });
  }
  return { array, items };
}

/** Removes every widget annotation from the page (Remove mode, and leftovers after Flatten). */
export function removeWidgets(page: PDFPage): void {
  const entries = annotEntries(page);
  if (!entries) return;
  const keep = entries.items.filter((e) => !isWidget(e.dict));
  if (keep.length === entries.items.length) return;
  const ctx = page.doc.context;
  page.node.set(N("Annots"), ctx.obj(keep.map((e) => e.ref ?? e.dict)));
}

/** Full field name of a widget/field: partial names of the field and its ancestors, joined by ".". */
function fullName(ctx: PDFContext, dict: PDFDict): string {
  const parts: string[] = [];
  let node: PDFDict | undefined = dict;
  for (let hop = 0; node && hop < 32; hop++) {
    const t = textOf(node.lookup(N("T")));
    if (t !== undefined) parts.unshift(t);
    const parent: PDFObject | undefined = node.get(N("Parent"));
    const next: PDFObject | undefined = parent instanceof PDFRef ? ctx.lookup(parent) : parent;
    node = next instanceof PDFDict ? next : undefined;
  }
  return parts.join(".");
}

/**
 * A duplicated page shares its annotations with the first copy. Gives it its
 * own copies, so the copy's widgets become separate fields (renamed or merged
 * like a second file's fields would be).
 */
export function detachAnnotations(page: PDFPage): void {
  const entries = annotEntries(page);
  if (!entries) return;
  const ctx = page.doc.context;
  const refs = entries.items.map(({ dict }) => {
    const clone = dict.clone(ctx);
    clone.set(N("P"), page.ref);
    if (isWidget(dict) && dict.get(N("Parent"))) {
      // Turn the copy into a standalone terminal field carrying the inherited values.
      for (const key of INHERITABLE) {
        if (clone.get(N(key))) continue;
        let node = dict.lookup(N("Parent"));
        for (let hop = 0; node instanceof PDFDict && hop < 32; hop++) {
          const v = node.get(N(key));
          if (v) {
            clone.set(N(key), v);
            break;
          }
          node = node.lookup(N("Parent"));
        }
      }
      clone.set(N("T"), PDFHexString.fromText(fullName(ctx, dict)));
      clone.delete(N("Parent"));
    }
    return ctx.register(clone);
  });
  page.node.set(N("Annots"), ctx.obj(refs));
}

type Root = { ref: PDFRef; dict: PDFDict };

/** Top-level fields reached from the widgets on `pages`, in page order, each once. */
function rootFields(ctx: PDFContext, pages: PDFPage[]): Root[] {
  const roots: Root[] = [];
  const seen = new Set<PDFDict>();
  for (const page of pages) {
    const entries = annotEntries(page);
    if (!entries) continue;
    for (const { ref, dict } of entries.items) {
      if (!isWidget(dict)) continue;
      let node: Root | undefined = ref ? { ref, dict } : undefined;
      for (let hop = 0; node && hop < 32; hop++) {
        const parent = node.dict.get(N("Parent"));
        if (!(parent instanceof PDFRef)) break;
        const pd = ctx.lookup(parent);
        if (!(pd instanceof PDFDict)) break;
        node = { ref: parent, dict: pd };
      }
      if (node && !seen.has(node.dict)) {
        seen.add(node.dict);
        roots.push(node);
      }
    }
  }
  return roots;
}

/** Splits a merged field/widget dictionary into a parent field with the widget as its only kid. */
function splitField(ctx: PDFContext, root: Root): Root {
  if (!isWidget(root.dict)) return root;
  const field = ctx.obj({}) as PDFDict;
  for (const key of FIELD_KEYS) {
    const v = root.dict.get(N(key));
    if (v) {
      field.set(N(key), v);
      root.dict.delete(N(key));
    }
  }
  const ref = ctx.register(field);
  field.set(N("Kids"), ctx.obj([root.ref]));
  root.dict.set(N("Parent"), ref);
  return { ref, dict: field };
}

/**
 * Builds the output AcroForm for "merge" (same full name = one field, the
 * first file's value) or "rename" (a later duplicate becomes name_2, name_3…).
 * `sourceForms` are the sources' AcroForm dictionaries already copied into
 * the output (for /DR and /DA).
 */
export function buildAcroForm(doc: PDFDocument, pages: PDFPage[], mode: "merge" | "rename", sourceForms: PDFDict[]): void {
  const ctx = doc.context;
  const roots = rootFields(ctx, pages);
  if (!roots.length) return;
  const fields: Root[] = [];
  if (mode === "rename") {
    const used = new Set<string>();
    for (const root of roots) {
      const name = textOf(root.dict.lookup(N("T")));
      if (name !== undefined) {
        let final = name;
        for (let n = 2; used.has(final); n++) final = `${name}_${n}`;
        if (final !== name) root.dict.set(N("T"), PDFHexString.fromText(final));
        used.add(final);
      }
      fields.push(root);
    }
  } else {
    const byName = new Map<string, number>();
    for (const root of roots) {
      const name = textOf(root.dict.lookup(N("T")));
      const at = name === undefined ? undefined : byName.get(name);
      if (at === undefined) {
        if (name !== undefined) byName.set(name, fields.length);
        fields.push(root);
        continue;
      }
      const target = splitField(ctx, fields[at]);
      fields[at] = target;
      const kids = target.dict.lookup(N("Kids"), PDFArray);
      const moved: Root[] = isWidget(root.dict) ? [root] : [];
      if (!moved.length) {
        const ownKids = root.dict.lookup(N("Kids"));
        if (ownKids instanceof PDFArray) {
          for (let i = 0; i < ownKids.size(); i++) {
            const r = ownKids.get(i);
            const d = ownKids.lookup(i);
            if (r instanceof PDFRef && d instanceof PDFDict) moved.push({ ref: r, dict: d });
          }
        }
      }
      for (const kid of moved) {
        if (kid === root) for (const key of FIELD_KEYS) kid.dict.delete(N(key));
        kid.dict.set(N("Parent"), target.ref);
        kids.push(kid.ref);
      }
    }
  }
  const form = ctx.obj({}) as PDFDict;
  form.set(N("Fields"), ctx.obj(fields.map((f) => f.ref)));
  const dr = ctx.obj({}) as PDFDict;
  for (const src of sourceForms) {
    const srcDr = src.lookup(N("DR"));
    if (!(srcDr instanceof PDFDict)) continue;
    for (const [key, value] of srcDr.entries()) {
      const sub = srcDr.lookup(key);
      if (sub instanceof PDFDict) {
        const into = dr.lookup(key) instanceof PDFDict ? (dr.lookup(key) as PDFDict) : (ctx.obj({}) as PDFDict);
        for (const [k, v] of sub.entries()) if (!into.get(k)) into.set(k, v);
        dr.set(key, into);
      } else if (!dr.get(key)) dr.set(key, value);
    }
  }
  if (dr.entries().length) form.set(N("DR"), dr);
  const da = sourceForms.map((f) => f.get(N("DA"))).find(Boolean);
  if (da) form.set(N("DA"), da);
  // Merged fields share one value but keep each widget's old appearance; ask viewers to redraw.
  if (mode === "merge") form.set(N("NeedAppearances"), PDFBool.True);
  doc.catalog.set(N("AcroForm"), ctx.register(form));
}
