"use client";
/**
 * Forms inside the editor (F16 E3, U-F1 to U-F8): the glue between the form model (lib/forms)
 * and the editor's store, history and pages. Fields live in `DocState.forms`, so undo, redo,
 * History, autosave and Download cover them like any other change.
 *
 * Mount points: `PageFields` inside each page's turning overlay, `FieldPopover` beside it,
 * `FormsChrome` once in the shell, `FormsToolOptions` in the tool-options slot, `FieldsChipSlot`
 * in the top bar and `TabOrderTab` in the side panel.
 */
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";
import * as H from "@/lib/editor/history";
import { readFormsInWorker } from "@/lib/editor/build-client";
import { addObjects, clampDelta, newId, pageSize, totalRotation, type EditorObject, type PageEntry } from "@/lib/editor/model";
import { nextEmptyWidget } from "@/lib/forms/edit";
import { addField, addFields, addRadioButton, createField, defaultSize, deleteField, deleteWidget, duplicateField, emptyForm, fieldOfWidget, missingRequired, setValue, setWidgetBox } from "@/lib/forms/model";
import { moveInOrder, pageOrder, restoreOriginal, sortByColumns, sortByRows } from "@/lib/forms/taborder";
import type { FormField, FormState, Proposal } from "@/lib/forms/types";
import type { Controller } from "@/tools/editor/controller";
import { useCtl } from "@/tools/editor/context";
import { shallowArray, useStore, type EditorState, type FormsUi } from "@/tools/editor/store";
import { FieldLayer } from "./FieldLayer";
import { FieldProps } from "./FieldProps";
import { FieldsChip, FormToolOptions } from "./FormToolOptions";
import { ReviewPill } from "./ReviewPill";
import { TabOrderPanel } from "./TabOrderPanel";
import "./forms.css";

const formsOf = (s: EditorState) => H.current(s.history).forms;
const NO_FIELDS: FormField[] = [];

/** Reads the file's form in the download worker, once pdf.js says there is one (no pdf-lib in the editor chunk). */
export async function loadForms(ctl: Controller, bytes: Uint8Array, password?: string): Promise<void> {
  try {
    // pdf.js answers null when there is no form, else the fields by name (a Map in pdf.js 5+).
    const fields: unknown = await ctl.rt.pdf.getFieldObjects().catch(() => null);
    if (!fields || !(fields instanceof Map ? fields.size : Object.keys(fields).length)) return;
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
function formReady(ctl: Controller): boolean {
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

const setUi = (ctl: Controller, patch: Partial<FormsUi>) => ctl.store.set((s) => ({ forms: { ...s.forms, ...patch } }));

// ---- on each page --------------------------------------------------------------------------

export const PageFields = memo(function PageFields({ entry, scale }: { entry: PageEntry; scale: number }) {
  const ctl = useCtl();
  const { store } = ctl;
  const fields = useStore(store, (s) => formsOf(s)?.fields ?? NO_FIELDS);
  const tool = useStore(store, (s) => s.tool);
  const readOnly = useStore(store, (s) => s.readOnly);
  const selected = useStore(store, (s) => s.forms.selected?.widget ?? null);
  const proposals = useStore(store, (s) => s.forms.proposals, shallowArray);
  const tabOrder = useStore(store, (s) => s.forms.tabOrder);
  const order = useStore(store, (s) => formsOf(s)?.order ?? null);
  const pageList = useStore(store, (s) => H.current(s.history).pages, shallowArray);
  const draw = useStore(store, (s) => s.forms.draw);
  const edit = tool === "form" && !readOnly;
  const turn = totalRotation(entry);
  const { w: pw, h: ph } = pageSize(entry);
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

  const shown = useMemo(() => (readOnly ? fields.map((f) => (f.readOnly ? f : { ...f, readOnly: true })) : fields), [fields, readOnly]);

  // Tab order numbers on the fields while the panel is open (U-F6).
  const badges = useMemo(() => {
    if (!tabOrder || !order) return null;
    const form = formsOf(store.get());
    if (!form) return null;
    const m = new Map<string, number>();
    let n = 0;
    for (const p of pageList) for (const id of pageOrder(form, p.id)) m.set(id, ++n);
    return m;
  }, [tabOrder, order, pageList, store]);

  if (!fields.length && !proposals.length && !edit) return null;

  const create = (x0: number, y0: number, x1: number, y1: number, shift: boolean) => {
    if (!formReady(ctl)) return;
    const state = formsOf(store.get()) ?? emptyForm();
    const kind = draw === "multiline" ? "text" : draw;
    const dragged = Math.abs(x1 - x0) * scale > 4 || Math.abs(y1 - y0) * scale > 4;
    const size = defaultSize(kind, draw === "multiline");
    const box = dragged
      ? { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.max(8, Math.abs(x1 - x0)), h: Math.max(8, Math.abs(y1 - y0)) }
      : { x: x0 - size.w / 2, y: y0 - size.h / 2, ...size };
    const [dx, dy] = clampDelta(box, 0, 0, { w: pw, h: ph });
    box.x += dx;
    box.y += dy;
    // Radio: clicks while a radio group is selected add buttons to it; Shift starts a new group.
    const sel = store.get().forms.selected;
    const group = sel && !shift ? state.fields.find((f) => f.id === sel.field && f.kind === "radio") : undefined;
    if (kind === "radio" && group) {
      const next = addRadioButton(state, group.id, { ...box, page: entry.id });
      const w = next.fields.find((f) => f.id === group.id)!.widgets.at(-1)!;
      applyForm(ctl, next, "Add radio button", undefined, entry.id);
      setUi(ctl, { selected: { field: group.id, widget: w.id } });
      return;
    }
    const f = createField(state, { kind, page: entry.id, box, multiline: draw === "multiline" });
    applyForm(ctl, addField(state, f), `Add ${kindLabel(f)}`, undefined, entry.id);
    setUi(ctl, { selected: { field: f.id, widget: f.widgets[0].id } });
    ctl.announce(`${kindLabel(f)} ${f.name} added`);
  };

  const local = (e: RPointerEvent<HTMLDivElement>) => [e.nativeEvent.offsetX / scale, e.nativeEvent.offsetY / scale] as const;

  return (
    <>
      {edit && (
        <div
          className="bf-draw"
          aria-hidden="true"
          onPointerDown={(e) => {
            if (e.button !== 0 && e.pointerType === "mouse") return;
            e.stopPropagation();
            e.currentTarget.setPointerCapture(e.pointerId);
            const [x, y] = local(e);
            setDrag({ x0: x, y0: y, x1: x, y1: y });
            setUi(ctl, { selected: null });
          }}
          onPointerMove={(e) => {
            if (!drag) return;
            const [x, y] = local(e);
            setDrag({ ...drag, x1: Math.max(0, Math.min(pw, x)), y1: Math.max(0, Math.min(ph, y)) });
          }}
          onPointerUp={(e) => {
            if (!drag) return;
            setDrag(null);
            create(drag.x0, drag.y0, drag.x1, drag.y1, e.shiftKey);
          }}
          onPointerCancel={() => setDrag(null)}
        />
      )}
      {drag && <span className="bf-drag" aria-hidden="true" style={{ left: Math.min(drag.x0, drag.x1) * scale, top: Math.min(drag.y0, drag.y1) * scale, width: Math.abs(drag.x1 - drag.x0) * scale, height: Math.abs(drag.y1 - drag.y0) * scale }} />}
      <FieldLayer
        pageId={entry.id}
        scale={scale}
        turn={turn}
        fields={shown}
        mode={edit ? "edit" : "fill"}
        selected={selected}
        proposals={proposals}
        badges={badges}
        onValue={(fieldId, value) => {
          const state = formsOf(store.get());
          if (!state) return;
          const r = setValue(state, fieldId, value);
          if (r.error === "too-long") return ctl.announce("That is longer than this field allows");
          if (!r.error) applyForm(ctl, r.state, "Fill in field", `fill:${fieldId}`, entry.id);
        }}
        onSelect={(widgetId) => {
          const state = formsOf(store.get());
          const f = state && fieldOfWidget(state, widgetId);
          if (f) setUi(ctl, { selected: { field: f.id, widget: widgetId } });
        }}
        onSign={(fieldId, widgetId) => {
          const f = formsOf(store.get())?.fields.find((x) => x.id === fieldId);
          const w = f?.widgets.find((x) => x.id === widgetId);
          if (!w || readOnly) return;
          setUi(ctl, { signFor: { field: fieldId, widget: widgetId } });
          ctl.openSign?.("signature");
        }}
        onAccept={(p) => {
          applyForm(ctl, addField(formsOf(store.get()) ?? emptyForm(), p.field), `Add ${kindLabel(p.field)}`, undefined, entry.id);
          dropProposal(ctl, p);
        }}
        onReject={(p) => dropProposal(ctl, p)}
        page={{ w: pw, h: ph }}
        onBox={(widgetId, b) => {
          const state = formsOf(store.get());
          if (state) applyForm(ctl, setWidgetBox(state, widgetId, b), "Move field", undefined, entry.id);
        }}
        onBadgeClick={(widgetId) => document.querySelector<HTMLElement>(`[data-tab-chip="${widgetId}"]`)?.focus()}
      />
    </>
  );
});

function dropProposal(ctl: Controller, p: Proposal) {
  const proposals = ctl.store.get().forms.proposals.filter((x) => x !== p);
  setUi(ctl, { proposals, detect: proposals.length ? { ...reviewOf(proposals), index: 0 } : { phase: "idle" } });
}

const reviewOf = (ps: Proposal[]) => ({ phase: "review" as const, count: ps.length, pages: new Set(ps.map((p) => p.field.widgets[0].page)).size, index: 0 });

const KIND_LABEL: Record<FormField["kind"], string> = { text: "text field", checkbox: "checkbox", radio: "radio button", dropdown: "dropdown", list: "list", signature: "signature field", button: "button" };
const kindLabel = (f: FormField) => (f.kind === "text" && f.multiline ? "multi-line text field" : KIND_LABEL[f.kind]);

/** The selected field's properties, under (or above) it on the page (U-F4). Kept inside the page's width. */
export const FieldPopover = memo(function FieldPopover({ entry, place, pageWidth, pageHeight }: { entry: PageEntry; place: (b: { x: number; y: number; w: number; h: number }) => { left: number; top: number; width: number; height: number }; pageWidth: number; pageHeight: number }) {
  const ctl = useCtl();
  const { store } = ctl;
  const sel = useStore(store, (s) => s.forms.selected);
  const form = useStore(store, formsOf);
  const pages = useStore(store, (s) => H.current(s.history).pages, shallowArray);
  const readOnly = useStore(store, (s) => s.readOnly);
  const tool = useStore(store, (s) => s.tool);
  const box = useRef<HTMLDivElement>(null);
  const f = sel && form?.fields.find((x) => x.id === sel.field);
  const w = f?.widgets.find((x) => x.id === sel!.widget);
  const r = w && w.page === entry.id ? place(w) : null;
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || !r) return;
    const { offsetWidth: bw, offsetHeight: bh } = el;
    const left = Math.max(0, Math.min(r.left, pageWidth - bw));
    const below = r.top + r.height + 8;
    const top = below + bh > pageHeight + 48 && r.top - 8 - bh >= 0 ? r.top - 8 - bh : below;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.visibility = "visible";
  });
  if (!sel || !form || !f || !w || !r || readOnly || tool !== "form") return null;
  return (
    <div ref={box} className="bf-popover" data-popover style={{ left: r.left, top: r.top + r.height + 8, visibility: "hidden" }} onPointerDown={(e) => e.stopPropagation()}>
      <FieldProps
        form={form}
        fieldId={f.id}
        widgetId={w.id}
        pages={pages}
        onChange={(next, label) => applyForm(ctl, next, label, label === "Rename field" ? undefined : `prop:${f.id}:${label}`, entry.id)}
        onClose={() => setUi(ctl, { selected: null })}
      />
    </div>
  );
});

// ---- shell-level -----------------------------------------------------------------------------

/** Detect fields' review pill, the phone tab-order sheet, and "sign into this field". */
export function FormsChrome({ wide }: { wide: boolean }) {
  const ctl = useCtl();
  const { store } = ctl;
  const detect = useStore(store, (s) => s.forms.detect);
  const tabOrder = useStore(store, (s) => s.forms.tabOrder);
  const abort = useRef<AbortController | null>(null);

  // A signature made for a signature field goes into the field's box.
  useEffect(
    () =>
      store.subscribe(() => {
        const s = store.get();
        const pl = s.placement;
        const want = s.forms.signFor;
        if (!pl || pl.kind !== "signature" || !want) return;
        // The field as it is now (it may have moved); gone: the signature is placed by hand as usual.
        const t = formsOf(s)?.fields.find((f) => f.id === want.field)?.widgets.find((x) => x.id === want.widget);
        setUi(ctl, { signFor: null });
        if (!t) return;
        let w = t.w;
        let h = w / pl.aspect;
        if (h > t.h) {
          h = t.h;
          w = h * pl.aspect;
        }
        const entry = H.current(s.history).pages.find((p) => p.id === t.page);
        const rot = entry ? (360 - totalRotation(entry)) % 360 : 0;
        store.set({ placement: null });
        // The signature takes the field's place in one step: a stamped signature under a "Sign here"
        // field would show the field on top in every viewer.
        const sig: EditorObject = { kind: "signature", id: newId(), page: t.page, x: t.x + (t.w - w) / 2, y: t.y + (t.h - h) / 2, w, h, rot, role: pl.role ?? "signature", sig: pl.sig!, color: pl.color ?? "#000000" };
        const doc = ctl.state();
        ctl.apply({ ...addObjects(doc, [sig]), forms: doc.forms && deleteWidget(doc.forms, t.id) }, "Sign in field", { page: t.page, targets: [sig.id], select: [sig.id] });
        ctl.setTool("select");
        ctl.announce("Signed in the field");
      }),
    [store, ctl],
  );

  // Starts Detect fields when asked (FormsToolOptions sets phase "running" with total 0).
  useEffect(() => {
    if (detect.phase !== "running" || detect.total !== 0) return;
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    /** This run is still the one the pill shows (not cancelled, not replaced by a newer run). */
    const live = () => !ctrl.signal.aborted && abort.current === ctrl;
    void (async () => {
      const s = store.get();
      const pages = H.current(s.history).pages;
      const work = pages.filter((p) => p.src != null);
      setUi(ctl, { detect: { phase: "running", done: 0, total: Math.max(1, work.length) } });
      try {
        const { detectInBrowser } = await import("@/lib/forms/detect/client");
        const r = await detectInBrowser(ctl.rt.pdf, {
          pages,
          form: formsOf(store.get()) ?? emptyForm(),
          signal: ctrl.signal,
          onProgress: (done, total) => live() && setUi(ctl, { detect: { phase: "running", done, total } }),
        });
        if (!live()) return;
        setUi(ctl, r.proposals.length ? { proposals: r.proposals, detect: reviewOf(r.proposals) } : { proposals: [], detect: { phase: "none" } });
        // Bring the first proposal into view (they may be pages away).
        const first = r.proposals[0]?.field.widgets[0];
        if (first) requestAnimationFrame(() => document.querySelector<HTMLElement>(`.bf-proposal[data-w="${first.id}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" }));
        ctl.announce(r.proposals.length ? `${r.proposals.length} fields found. Review them on the pages.` : "No new fields found");
        if (!r.proposals.length) setTimeout(() => store.get().forms.detect.phase === "none" && setUi(ctl, { detect: { phase: "idle" } }), 3000);
      } catch (e) {
        if (!live()) return;
        if ((e as Error).name !== "AbortError") ctl.toast({ text: "Detect fields stopped. Please try again.", tone: "danger" });
        setUi(ctl, { detect: { phase: "idle" } });
      }
    })();
  }, [detect, store, ctl]);

  // Leaving the editor stops a run.
  useEffect(() => () => abort.current?.abort(), []);

  const go = (step: 1 | -1) => {
    const s = store.get();
    if (s.forms.detect.phase !== "review") return;
    const ps = s.forms.proposals;
    const index = (s.forms.detect.index + step + ps.length) % ps.length;
    setUi(ctl, { detect: { ...s.forms.detect, index } });
    const w = ps[index]?.field.widgets[0];
    const el = w && document.querySelector<HTMLElement>(`.bf-proposal[data-w="${w.id}"]`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    el?.focus({ preventScroll: true });
  };

  return (
    <>
      {detect.phase !== "idle" && (
        <div className="bf-pill-dock">
          <ReviewPill
            status={detect}
            onCancel={() => {
              abort.current?.abort();
              setUi(ctl, { detect: { phase: "idle" } });
            }}
            onPrev={() => go(-1)}
            onNext={() => go(1)}
            onAcceptAll={() => {
              // Proposals on pages deleted since the run are left out.
              const ids = new Set(H.current(store.get().history).pages.map((p) => p.id));
              const ps = store.get().forms.proposals.filter((p) => p.field.widgets.every((w) => ids.has(w.page)));
              applyForm(ctl, addFields(formsOf(store.get()) ?? emptyForm(), ps.map((p) => p.field)), `Add ${ps.length} detected fields`);
              setUi(ctl, { proposals: [], detect: { phase: "idle" } });
              ctl.announce(`${ps.length} fields added`);
            }}
            onDiscard={() => setUi(ctl, { proposals: [], detect: { phase: "idle" } })}
          />
        </div>
      )}
      {!wide && (
        <Dialog open={tabOrder} onClose={() => setUi(ctl, { tabOrder: false })} title="Tab order" variant="sheet" onCloseButton={() => setUi(ctl, { tabOrder: false })}>
          {tabOrder && <TabOrderTab />}
        </Dialog>
      )}
    </>
  );
}

/** The Form tool's options (U-F2). */
export function FormsToolOptions() {
  const ctl = useCtl();
  const { store } = ctl;
  const draw = useStore(store, (s) => s.forms.draw);
  const detect = useStore(store, (s) => s.forms.detect.phase);
  const tabOrder = useStore(store, (s) => s.forms.tabOrder);
  const wide = useStore(store, (s) => s.wide);
  return (
    <FormToolOptions
      kind={draw}
      onKind={(k) => setUi(ctl, { draw: k })}
      detecting={detect === "running" || detect === "review"}
      onDetect={() => {
        if (detect === "running" || !formReady(ctl)) return;
        setUi(ctl, { detect: { phase: "running", done: 0, total: 0 }, proposals: [] });
      }}
      tabOrderOpen={tabOrder}
      onTabOrder={() => {
        const open = !tabOrder;
        setUi(ctl, { tabOrder: open });
        if (open && wide) store.set({ panel: true, panelTab: "fields" });
      }}
    />
  );
}

/** "12 fields" / "2 required empty" in the top bar (U-F1). */
export function FieldsChipSlot() {
  const ctl = useCtl();
  const { store } = ctl;
  const form = useStore(store, formsOf);
  const nudge = useStore(store, (s) => s.forms.nudge);
  const sel = useStore(store, (s) => s.forms.selected?.widget ?? null);
  // Phones keep the top bar for the file name; the nudge comes as a note after Download there.
  const wide = useStore(store, (s) => s.wide);
  const counts = useMemo(() => (form ? { count: form.fields.filter((f) => !f.readOnly && f.kind !== "button" && f.widgets.some((w) => !w.hidden)).length, required: missingRequired(form).length } : null), [form]);
  if (!form || !counts || !wide) return null;
  return (
    <FieldsChip
      count={counts.count}
      requiredEmpty={counts.required}
      nudge={nudge}
      onJump={() => {
        const w = nextEmptyWidget(form, sel ?? (document.activeElement?.closest<HTMLElement>("[data-w]")?.dataset.w ?? null), nudge);
        if (!w) return ctl.announce("Every field is filled in");
        const el = document.querySelector<HTMLElement>(`.bf-field[data-w="${w}"]`);
        el?.scrollIntoView({ block: "center", behavior: "smooth" });
        el?.querySelector<HTMLElement>("input, textarea, select, button")?.focus({ preventScroll: true });
      }}
    />
  );
}

/** Tab order list (side panel tab on wide screens, a sheet on phones). */
export function TabOrderTab() {
  const ctl = useCtl();
  const { store } = ctl;
  const form = useStore(store, formsOf);
  const pages = useStore(store, (s) => H.current(s.history).pages, shallowArray);
  if (!form || !form.fields.length) return <p className="bf-empty">No fields yet. Add some with the Form tool or Detect.</p>;
  return (
    <TabOrderPanel
      form={form}
      pages={pages}
      onRows={() => applyForm(ctl, sortByRows(form, pages), "Sort tab order by rows")}
      onColumns={() => applyForm(ctl, sortByColumns(form, pages), "Sort tab order by columns")}
      onOriginal={() => applyForm(ctl, restoreOriginal(form), "Restore tab order")}
      onMove={(id, to) => applyForm(ctl, moveInOrder(form, id, to, pages), "Change tab order", `tab:${id}`)}
      onFocusWidget={(id) => document.querySelector<HTMLElement>(`.bf-field[data-w="${id}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" })}
    />
  );
}

/** After a download: required fields still empty turn the chip into a nudge (never a block). Returns how many. */
export function nudgeAfterDownload(ctl: Controller): number {
  const form = ctl.state().forms;
  const missing = form ? missingRequired(form).length : 0;
  setUi(ctl, { nudge: missing > 0 });
  return missing;
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
