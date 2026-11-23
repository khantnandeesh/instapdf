/**
 * Form fields in a merged document (spec F3 §3f "Form field modes"). Works on
 * the output document after its pages were copied: widgets on the output
 * pages lead to their fields, which become the new AcroForm. Flattening
 * happens on each source before copying (see merge.ts).
 */
import { PDFArray, PDFBool, PDFDict, PDFHexString, PDFName, PDFRef, PDFStream, PDFString, type PDFContext, type PDFDocument, type PDFObject, type PDFPage } from "@cantoo/pdf-lib";

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

/** Kid entries of a field, split into child fields (have /T) and widgets. */
function kidsOf(d: PDFDict): { fields: Root[]; widgets: Root[] } {
  const out = { fields: [] as Root[], widgets: [] as Root[] };
  const kids = d.lookup(N("Kids"));
  if (!(kids instanceof PDFArray)) return out;
  for (let i = 0; i < kids.size(); i++) {
    const r = kids.get(i);
    const k = kids.lookup(i);
    if (!(r instanceof PDFRef) || !(k instanceof PDFDict)) continue;
    (k.get(N("T")) ? out.fields : out.widgets).push({ ref: r, dict: k });
  }
  return out;
}

/** A field that holds a value (no child fields): a merged field/widget, or a field whose kids are widgets. */
const isTerminal = (d: PDFDict) => isWidget(d) || kidsOf(d).fields.length === 0;

/** /FT of a field, inherited from its ancestors when not set on it. */
function fieldType(d: PDFDict): string | undefined {
  let node: PDFDict | undefined = d;
  for (let hop = 0; node && hop < 32; hop++) {
    const ft = node.lookup(N("FT"));
    if (ft instanceof PDFName) return ft.decodeText();
    const parent: PDFObject | undefined = node.lookup(N("Parent"));
    node = parent instanceof PDFDict ? parent : undefined;
  }
  return undefined;
}

/** Where a field is listed: the AcroForm's field list, or a parent field's /Kids. */
type Container = { names: () => Set<string>; replace: (old: PDFRef, now: PDFRef) => void; add: (f: Root) => void; parent: PDFRef | null };

function listContainer(list: Root[]): Container {
  return {
    names: () => new Set(list.map((f) => textOf(f.dict.lookup(N("T"))) ?? "")),
    replace: (old, now) => {
      const i = list.findIndex((f) => f.ref === old);
      if (i >= 0) list[i] = { ref: now, dict: list[i].dict.context.lookup(now) as PDFDict };
    },
    add: (f) => {
      f.dict.delete(N("Parent"));
      list.push(f);
    },
    parent: null,
  };
}

function kidsContainer(ctx: PDFContext, parent: Root): Container {
  const kids = () => {
    let k = parent.dict.lookup(N("Kids"));
    if (!(k instanceof PDFArray)) {
      k = ctx.obj([]) as PDFArray;
      parent.dict.set(N("Kids"), k);
    }
    return k as PDFArray;
  };
  return {
    names: () => new Set(kidsOf(parent.dict).fields.map((f) => textOf(f.dict.lookup(N("T"))) ?? "")),
    replace: (old, now) => {
      const k = kids();
      for (let i = 0; i < k.size(); i++) if (k.get(i) === old) k.set(i, now);
    },
    add: (f) => {
      f.dict.set(N("Parent"), parent.ref);
      kids().push(f.ref);
    },
    parent: parent.ref,
  };
}

/** Splits a merged field/widget dictionary into a field with the widget as its only kid. */
function splitField(ctx: PDFContext, f: Root, where: Container): Root {
  if (!isWidget(f.dict)) return f;
  const field = ctx.obj({}) as PDFDict;
  for (const key of FIELD_KEYS) {
    const v = f.dict.get(N(key));
    if (v) {
      field.set(N(key), v);
      f.dict.delete(N(key));
    }
  }
  if (where.parent) field.set(N("Parent"), where.parent);
  const ref = ctx.register(field);
  field.set(N("Kids"), ctx.obj([f.ref]));
  f.dict.set(N("Parent"), ref);
  where.replace(f.ref, ref);
  return { ref, dict: field };
}

/** Gives `f` a partial name not used in `where` (name_2, name_3…) and lists it there. */
function addRenamed(f: Root, where: Container) {
  const name = textOf(f.dict.lookup(N("T")));
  if (name !== undefined) {
    const used = where.names();
    let final = name;
    for (let n = 2; used.has(final); n++) final = `${name}_${n}`;
    if (final !== name) f.dict.set(N("T"), PDFHexString.fromText(final));
  }
  where.add(f);
}

/**
 * Merge mode: joins `dup` into `target` (same partial name). Terminal fields
 * join only when their type matches (one value, several widgets); child
 * fields of non-terminal fields join by partial name, recursively. Anything
 * else is kept as its own field under a new name.
 */
function joinField(ctx: PDFContext, target: Root, dup: Root, where: Container) {
  const tTerm = isTerminal(target.dict);
  const dTerm = isTerminal(dup.dict);
  if (tTerm && dTerm) {
    if (fieldType(target.dict) !== fieldType(dup.dict)) return addRenamed(dup, where);
    const into = splitField(ctx, target, where);
    const kids = into.dict.lookup(N("Kids"), PDFArray);
    const moved = isWidget(dup.dict) ? [dup] : kidsOf(dup.dict).widgets;
    const ft = fieldType(into.dict);
    const value = into.dict.lookup(N("V"));
    for (const w of moved) {
      if (w === dup) for (const key of FIELD_KEYS) w.dict.delete(N(key));
      w.dict.set(N("Parent"), into.ref);
      // The widget now shows the shared (first file's) value: a text or choice widget drops its
      // stale appearance so viewers draw it again; a button shows the shared on/off state.
      if (ft === "Tx" || ft === "Ch") w.dict.delete(N("AP"));
      else if (ft === "Btn") w.dict.set(N("AS"), value instanceof PDFName ? value : N("Off"));
      kids.push(w.ref);
    }
    return;
  }
  if (!tTerm && !dTerm) {
    const inner = kidsContainer(ctx, target);
    for (const child of kidsOf(dup.dict).fields) {
      const name = textOf(child.dict.lookup(N("T")));
      const match = kidsOf(target.dict).fields.find((f) => textOf(f.dict.lookup(N("T"))) === name);
      if (match) joinField(ctx, match, child, inner);
      else inner.add(child);
    }
    return;
  }
  addRenamed(dup, where);
}

/**
 * Drops widgets (and then empty fields) that are not on an output page, so
 * a field copied with its parent does not list widgets of removed pages.
 * Returns false when nothing of the field is left.
 */
function prune(ctx: PDFContext, f: PDFDict, onPage: Set<PDFDict>, depth = 0): boolean {
  if (isWidget(f)) return onPage.has(f);
  const kids = f.lookup(N("Kids"));
  if (!(kids instanceof PDFArray) || depth > 32) return false;
  const keep = [];
  for (let i = 0; i < kids.size(); i++) {
    const k = kids.lookup(i);
    if (!(k instanceof PDFDict)) continue;
    const ok = k.get(N("T")) ? prune(ctx, k, onPage, depth + 1) : onPage.has(k);
    if (ok) keep.push(kids.get(i));
  }
  f.set(N("Kids"), ctx.obj(keep));
  return keep.length > 0;
}

/**
 * Builds the output AcroForm for "merge" (same full name and type = one
 * field, the first file's value) or "rename" (a later duplicate becomes
 * name_2, name_3…). `sourceForms` hold each source's /DR and /DA, already
 * copied into the output.
 */
export function buildAcroForm(doc: PDFDocument, pages: PDFPage[], mode: "merge" | "rename", sourceForms: PDFDict[]): void {
  const ctx = doc.context;
  const onPage = new Set<PDFDict>();
  for (const page of pages) for (const e of annotEntries(page)?.items ?? []) if (isWidget(e.dict)) onPage.add(e.dict);
  const roots = rootFields(ctx, pages).filter((r) => prune(ctx, r.dict, onPage));
  if (!roots.length) return;
  const fields: Root[] = [];
  const top = listContainer(fields);
  for (const root of roots) {
    const name = textOf(root.dict.lookup(N("T")));
    const match = name === undefined ? undefined : fields.find((f) => textOf(f.dict.lookup(N("T"))) === name);
    if (!match) {
      fields.push(root);
      continue;
    }
    if (mode === "rename") addRenamed(root, top);
    else joinField(ctx, match, root, top);
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
  // Ask viewers to draw appearances only when some widget has none (e.g. joined text fields).
  if ([...onPage].some((w) => !(w.lookup(N("AP")) instanceof PDFDict))) form.set(N("NeedAppearances"), PDFBool.True);
  doc.catalog.set(N("AcroForm"), ctx.register(form));
}

/** pdf-lib's private PDFForm methods used here (canary test in merge.test.ts). */
export const FORM_INTERNALS = ["findWidgetPage", "findWidgetAppearanceRef", "flattenWidgetOntoPage"] as const;
type FormInternals = {
  findWidgetPage: (w: unknown) => PDFPage | undefined;
  findWidgetAppearanceRef: (field: unknown, w: unknown) => PDFRef;
  flattenWidgetOntoPage: (page: PDFPage, w: unknown, ref: PDFRef) => void;
};

/**
 * Flattens each field whose every widget can be flattened, and keeps the
 * rest as fillable fields. pdf-lib's own flatten() logs a widget it cannot
 * flatten and then removes the field anyway, which loses typed values.
 * Returns the names of the fields that were kept.
 */
export function flattenFields(doc: PDFDocument): string[] {
  const form = doc.getForm();
  try {
    form.updateFieldAppearances();
  } catch {
    // Fields without a usable appearance are caught one by one below.
  }
  const internals = form as unknown as FormInternals;
  const kept: string[] = [];
  for (const field of form.getFields()) {
    // Check every widget before drawing any, so a field is never half drawn and still fillable.
    let plan: { w: unknown; page: PDFPage; ref: PDFRef }[];
    try {
      plan = field.acroField.getWidgets().map((w) => {
        const page = internals.findWidgetPage(w);
        const ref = internals.findWidgetAppearanceRef(field, w);
        if (!page || !(ref instanceof PDFRef) || !(doc.context.lookup(ref) instanceof PDFStream)) throw new Error("No appearance");
        return { w, page, ref };
      });
    } catch {
      kept.push(field.getName());
      continue;
    }
    try {
      for (const { w, page, ref } of plan) internals.flattenWidgetOntoPage(page, w, ref);
    } catch {
      // Something was drawn already: the drawn appearance wins, the field goes.
    }
    form.removeField(field);
  }
  return kept;
}
