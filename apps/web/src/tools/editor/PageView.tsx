"use client";
/* eslint-disable @next/next/no-img-element -- blob: and data: images made on this device; next/image can't load them */
/**
 * One page of the canvas: the pdf.js raster, the existing-text line layer, and the overlay with
 * the added objects, the selection frame, snap guides and every pointer gesture (U-E3, U-E4).
 *
 * The overlay is laid out in the page's unrotated frame (points × scale) and turned as a whole by
 * the page rotation, so objects stay on their spot when a page turns (AC-79). Gestures update a
 * draft in the store while the pointer moves and record one history step on release.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { cx } from "@/components/ui/cx";
import { constrain45, dragBox, handlesOf, canRotate, aspectLocked, hasBox, moveObject, newId, objectBounds, pageSize, rotationFor, totalRotation, clampDelta, clampedResize, clampPoint, keepOnPage, rotatedCorners, LINE_HEIGHT, type Box, type EditorObject, type Handle, type PageEntry, type Pt, type TextObj } from "@/lib/editor/model";
import { displaySize, rectToScreen, screenToFrame, toScreen, userRectToFrame } from "@/lib/editor/geometry";
import { selectWords, dominantHex, type FrameWord } from "@/lib/editor/markup";
import { snapMove, snapPoint } from "@/lib/editor/snap";
import { layoutText, textBoxSize } from "@/lib/editor/text-layout";
import { ensureFace, measurer } from "@/lib/editor/fonts-browser";
import * as H from "@/lib/editor/history";
import { useCtl } from "./context";
import { LineLayer } from "./LineLayer";
import { ObjectView, boxStyle } from "./ObjectView";
import { PropertiesPopover } from "./Properties";
import { lineAt } from "@/lib/editor/line-hit";
import { release, renderPage, swapCanvas } from "./render";
import { shallowArray, useStore, type EditorState } from "./store";
import { TOOL_NAMES, onPage, reflowText } from "./controller";

type Gesture =
  | { type: "move"; ids: string[]; start: Pt; origin: EditorObject[]; moved: boolean; pointer: number }
  | { type: "resize"; id: string; handle: Handle; origin: EditorObject; pointer: number }
  | { type: "rotate"; id: string; origin: EditorObject; pointer: number }
  | { type: "end"; id: string; which: "a" | "b"; origin: EditorObject; pointer: number }
  | { type: "create"; start: Pt; cur: Pt; pointer: number }
  | { type: "ink"; points: Pt[]; pointer: number }
  | { type: "mark"; start: Pt; cur: Pt; pointer: number }
  | { type: "marquee"; start: Pt; cur: Pt; pointer: number };

const PLACEHOLDER = "Text";
let penSeen = false;

const EMPTY: EditorObject[] = [];

export const PageView = memo(function PageView({ entry, index, total, scale, wide, root, firstOfSrc }: { entry: PageEntry; index: number; total: number; scale: number; wide: boolean; root: HTMLElement | null; firstOfSrc: boolean }) {
  const ctl = useCtl();
  const { store, rt } = ctl;
  const rotation = totalRotation(entry);
  const { w: pw, h: ph } = pageSize(entry);
  const disp = displaySize(entry.view, rotation, scale);
  const W = pw * scale;
  const H_ = ph * scale;

  const selObjects = useCallback((s: EditorState) => {
    const all = H.current(s.history).objects;
    const mine = all.filter((o) => o.page === entry.id);
    return mine.length ? mine : EMPTY;
  }, [entry.id]);
  const objects = useStore(store, selObjects, shallowArray);
  const selection = useStore(store, (s) => s.selection, shallowArray);
  const tool = useStore(store, (s) => s.tool);
  const draft = useStore(store, (s) => s.draft);
  const editing = useStore(store, (s) => s.editing);
  const guides = useStore(store, useCallback((s: EditorState) => (s.guides?.page === entry.id ? s.guides.guides : null), [entry.id]));
  const placement = useStore(store, (s) => s.placement);
  const hideAnnots = useStore(store, (s) => s.hideAnnots);
  const src = entry.src;
  const text = useStore(store, useCallback((s: EditorState) => (src != null ? s.texts[src] : undefined), [src]));
  const fresh = useStore(store, useCallback((s: EditorState) => (src != null ? !!s.fresh[src] : false), [src]));
  const rasterRev = useStore(store, useCallback((s: EditorState) => (src != null ? (s.rasterRev[src] ?? 0) : 0), [src]));
  const pdfRev = useStore(store, (s) => s.pdfRev);
  const lineEdit = useStore(store, useCallback((s: EditorState) => (src != null && s.lineEdit?.src === src && firstOfSrc ? s.lineEdit : null), [src, firstOfSrc]));
  const lineFlash = useStore(store, useCallback((s: EditorState) => (src != null && s.lineFlash?.src === src && firstOfSrc ? s.lineFlash : null), [src, firstOfSrc]));
  const flash = useStore(store, (s) => s.flash);
  const busy = useStore(store, (s) => s.busy);
  const engineReady = useStore(store, (s) => s.engineReady);
  const readout = useStore(store, (s) => s.readout);

  const wrap = useRef<HTMLDivElement>(null);
  const raster = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [drawn, setDrawn] = useState<"none" | "ok" | "failed">("none");
  const [retry, setRetry] = useState(0);
  const gesture = useRef<Gesture | null>(null);
  const touches = useRef(new Set<number>());

  // Visible ± about one screen: render; far away: release the canvas (U-E5).
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { root, rootMargin: "100% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [root]);

  // A line clicked before the engine was ready opens as soon as the engine has read the page.
  const pending = useStore(store, useCallback((s: EditorState) => (src != null && firstOfSrc && s.pendingLine?.src === src ? s.pendingLine : null), [src, firstOfSrc]));
  useEffect(() => {
    if (!pending || !engineReady) return;
    if (!fresh || !text) {
      if (src != null) void ctl.ensureText(src);
      return;
    }
    const i = lineAt(text.lines, pending.at[0], pending.at[1]);
    store.set({ pendingLine: null, ...(i >= 0 ? { lineEdit: { src: pending.src, line: i, text: text.lines[i].text }, selection: [] } : {}) });
    if (i < 0) ctl.announce("That text can’t be edited.");
  }, [pending, engineReady, fresh, text, src, ctl, store]);

  useEffect(() => {
    if (visible && src != null && !fresh) void ctl.ensureText(src);
  }, [visible, src, fresh, ctl, pdfRev, engineReady]);

  const drawnFor = useRef<string | null>(null);
  useEffect(() => {
    const holder = raster.current;
    if (!holder) return;
    if (!visible) {
      // Released when far off-screen; redrawn on the way back.
      const t = setTimeout(() => {
        if (holder.firstChild) swapCanvas(holder, null);
        drawnFor.current = null;
        setDrawn("none");
      }, 1500);
      return () => clearTimeout(t);
    }
    if (src == null) {
      setDrawn("ok");
      return;
    }
    const key = `${pdfRev}:${rasterRev}:${scale.toFixed(4)}:${rotation}:${retry}`;
    if (drawnFor.current === key) return;
    const job = renderPage(rt.pdf, src, scale, rotation, index);
    let live = true;
    void job.promise.then((canvas) => {
      if (!live) {
        if (canvas && canvas !== "failed") release(canvas);
        return;
      }
      if (canvas === "failed") return setDrawn("failed");
      if (!canvas) return;
      drawnFor.current = key;
      canvas.className = "ed-raster";
      swapCanvas(holder, canvas); // swap only when ready: no blank flash
      setDrawn("ok");
      ctl.startEngine(); // the first page is up: now the text engine may use the network
    });
    return () => {
      live = false;
      job.cancel();
    };
  }, [visible, src, rasterRev, pdfRev, scale, rotation, rt, index, retry, ctl]);

  // ---- coordinates ----
  const toFrame = useCallback(
    (clientX: number, clientY: number): Pt => {
      const r = raster.current!.getBoundingClientRect();
      const [fx, fy] = screenToFrame(clientX - r.left, clientY - r.top, W, H_, rotation);
      return [fx / scale, fy / scale];
    },
    [W, H_, rotation, scale],
  );

  const shown = useMemo(() => {
    const list = draft ? objects.map((o) => draft[o.id] ?? o) : objects;
    const extra = draft ? Object.values(draft).filter((o) => o.page === entry.id && !objects.some((x) => x.id === o.id)) : [];
    return extra.length ? [...list, ...extra] : list;
  }, [objects, draft, entry.id]);

  const words = useMemo<FrameWord[]>(() => (text ? text.lines.flatMap((l, li) => l.words.map((w) => ({ line: li, text: w.text, box: userRectToFrame(w.bbox, entry.view) }))) : []), [text, entry.view]);

  const setDraft = (objs: EditorObject[] | null) => store.set({ draft: objs ? Object.fromEntries(objs.map((o) => [o.id, o])) : null });
  const others = (ids: string[]) => objects.filter((o) => !ids.includes(o.id)).map(objectBounds);
  const threshold = 6 / scale;
  const pointsLabel = (b: Box) => `x ${Math.round(b.x)} y ${Math.round(b.y)} · ${Math.round(b.w)} × ${Math.round(b.h)} pt`;

  // ---- creation helpers ----
  const defaults = () => store.get().defaults;
  const finishTool = () => {
    const s = store.get();
    if (!s.locked && (s.tool === "text" || s.tool === "whiteout" || s.tool === "image" || s.tool === "sign")) store.set({ tool: "select" });
  };

  const nearbySize = (p: Pt): number => {
    const d = defaults().text.size;
    if (d) return d;
    if (!text) return 12;
    let best: { d: number; size: number } | null = null;
    for (const l of text.lines) {
      const b = userRectToFrame(l.bbox, entry.view);
      const dist = Math.hypot(Math.max(b.x - p[0], 0, p[0] - b.x - b.w), Math.max(b.y - p[1], 0, p[1] - b.y - b.h));
      if (dist <= 48 && (!best || dist < best.d)) best = { d: dist, size: l.size };
    }
    return best ? Math.max(4, Math.round(best.size * 2) / 2) : 12;
  };

  const sampleColor = (b: Box): string => {
    const canvas = raster.current?.querySelector("canvas");
    if (!canvas) return "#ffffff";
    try {
      const corners = [toScreen(entry.view[0] + b.x, entry.view[3] - b.y, entry.view, rotation, scale), toScreen(entry.view[0] + b.x + b.w, entry.view[3] - b.y - b.h, entry.view, rotation, scale)];
      const k = canvas.width / disp.width;
      const x0 = Math.max(0, Math.floor(Math.min(corners[0][0], corners[1][0]) * k));
      const y0 = Math.max(0, Math.floor(Math.min(corners[0][1], corners[1][1]) * k));
      const x1 = Math.min(canvas.width, Math.ceil(Math.max(corners[0][0], corners[1][0]) * k));
      const y1 = Math.min(canvas.height, Math.ceil(Math.max(corners[0][1], corners[1][1]) * k));
      if (x1 <= x0 || y1 <= y0) return "#ffffff";
      const data = canvas.getContext("2d", { willReadFrequently: true })!.getImageData(x0, y0, x1 - x0, y1 - y0).data;
      return dominantHex(data);
    } catch {
      return "#ffffff";
    }
  };

  const createAt = (a: Pt, b: Pt, clicked: boolean, shift: boolean) => {
    const t = store.get().tool;
    const d = defaults();
    if (t === "text") {
      const size = nearbySize(a);
      const wrapW = clicked ? null : Math.max(24, Math.abs(b[0] - a[0]));
      const x = clicked ? a[0] : Math.min(a[0], b[0]);
      const y = clicked ? a[1] - size * LINE_HEIGHT * 0.5 : Math.min(a[1], b[1]);
      const m = measurer(d.text.font, size, d.text.bold, d.text.italic);
      const lines = layoutText(PLACEHOLDER, wrapW, m);
      const box = textBoxSize(lines, wrapW, size, m);
      const o: TextObj = { kind: "text", id: newId(), page: entry.id, x, y, wrap: wrapW, lines, w: box.w, h: box.h, rot: (360 - rotation) % 360, text: PLACEHOLDER, font: d.text.font, size, bold: d.text.bold, italic: d.text.italic, underline: d.text.underline, color: d.text.color, align: d.text.align };
      const [cx, cy] = clampDelta({ x, y, w: o.w, h: o.h }, 0, 0, { w: pw, h: ph });
      o.x += cx;
      o.y += cy;
      ctl.add([o], "Add text");
      pendingText.add(o.id);
      store.set({ editing: o.id });
      finishTool();
      return;
    }
    if (t === "shapes") {
      const kind = d.shapes.shape;
      if (kind === "line" || kind === "arrow") {
        const end: Pt = clicked ? [a[0] + 120, a[1]] : shift ? constrain45(a, b) : b;
        ctl.add([{ kind: "line", id: newId(), page: entry.id, arrow: kind === "arrow", a, b: end, stroke: d.shapes.stroke, width: d.shapes.width }], `Add ${kind}`);
      } else {
        const box = clicked ? { x: a[0] - 60, y: a[1] - 40, w: 120, h: 80 } : dragBox(a, b, shift);
        ctl.add([{ kind: "shape", id: newId(), page: entry.id, shape: kind, ...box, rot: 0, stroke: d.shapes.stroke, fill: d.shapes.fill, width: d.shapes.width }], kind === "rect" ? "Add rectangle" : "Add ellipse");
      }
      ctl.announce(`${kind === "rect" ? "Rectangle" : kind === "ellipse" ? "Ellipse" : kind === "line" ? "Line" : "Arrow"} added on page ${index + 1}`);
      return;
    }
    if (t === "whiteout") {
      const box = clicked ? { x: a[0] - 60, y: a[1] - 12, w: 120, h: 24 } : dragBox(a, b);
      const fill = d.whiteout.fill === "page" ? sampleColor(box) : d.whiteout.fill;
      ctl.add([{ kind: "whiteout", id: newId(), page: entry.id, ...box, fill, border: null, borderWidth: 0 }], "Add whiteout");
      ctl.announce(`Whiteout added on page ${index + 1}. It hides content but doesn't delete it.`);
      finishTool();
    }
  };

  const placeAt = (p: Pt) => {
    const pl = store.get().placement;
    if (!pl) return;
    const maxW = pw * 0.5;
    let w = pl.kind === "signature" ? Math.min(maxW, pl.role === "initials" ? 72 : 180) : Math.min(maxW, rt.assets[pl.asset!]?.w ?? 200);
    let h = w / pl.aspect;
    if (h > ph * 0.5) {
      h = ph * 0.5;
      w = h * pl.aspect;
    }
    const box = { x: p[0] - w / 2, y: p[1] - h / 2, w, h };
    const [dx, dy] = clampDelta(box, 0, 0, { w: pw, h: ph });
    box.x += dx;
    box.y += dy;
    const rot = (360 - rotation) % 360;
    const id = newId();
    if (pl.kind === "image") ctl.add([{ kind: "image", id, page: entry.id, ...box, rot, asset: pl.asset!, opacity: 1 }], "Add image");
    else ctl.add([{ kind: "signature", id, page: entry.id, ...box, rot, role: pl.role ?? "signature", sig: pl.sig!, color: pl.color ?? "#000000" }], pl.role === "initials" ? "Add initials" : "Add signature");
    store.set({ placement: null });
    finishTool();
    ctl.announce(`${pl.label} placed on page ${index + 1}. Arrow keys move it.`);
    requestAnimationFrame(() => (document.querySelector(`[data-obj-id="${id}"]`) as HTMLElement | null)?.focus({ preventScroll: true }));
  };

  // ---- pointer gestures ----
  const onPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "pen") penSeen = true;
    if (e.pointerType === "touch") {
      touches.current.add(e.pointerId);
      if (touches.current.size > 1) {
        // Two fingers pan and zoom (the canvas handles it): drop the one-finger gesture (AC-94).
        if (gesture.current?.type === "ink" || gesture.current?.type === "create" || gesture.current?.type === "mark") setDraft(null);
        gesture.current = null;
        return;
      }
    }
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const s = store.get();
    if (s.busy) return;
    const p = toFrame(e.clientX, e.clientY);
    const target = e.target as HTMLElement;
    if (target.closest("textarea, input, [data-popover]")) return;
    const handle = target.closest<HTMLElement>("[data-handle]")?.dataset.handle;
    const objEl = target.closest<HTMLElement>("[data-obj-id]");
    const t = s.tool;

    if (s.placement) {
      e.preventDefault();
      placeAt(p);
      return;
    }
    if (handle && s.selection.length === 1) {
      const o = H.current(s.history).objects.find((x) => x.id === s.selection[0]);
      if (!o) return;
      e.preventDefault();
      e.stopPropagation();
      wrap.current?.setPointerCapture(e.pointerId);
      if (handle === "rot") gesture.current = { type: "rotate", id: o.id, origin: o, pointer: e.pointerId };
      else if (handle === "a" || handle === "b") gesture.current = { type: "end", id: o.id, which: handle, origin: o, pointer: e.pointerId };
      else gesture.current = { type: "resize", id: o.id, handle: handle as Handle, origin: o, pointer: e.pointerId };
      return;
    }
    const passThrough = t === "draw" || t === "mark";
    if (objEl && !passThrough) {
      const id = objEl.dataset.objId!;
      if (s.editing === id) return;
      e.preventDefault();
      let sel = s.selection;
      if (e.shiftKey) sel = sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id];
      else if (!sel.includes(id)) sel = [id];
      ctl.select(sel);
      objEl.focus({ preventScroll: true });
      const origin = H.current(s.history).objects.filter((o) => sel.includes(o.id));
      wrap.current?.setPointerCapture(e.pointerId);
      gesture.current = { type: "move", ids: sel, start: p, origin, moved: false, pointer: e.pointerId };
      return;
    }
    // Empty space.
    if (t === "select" || t === "edit") {
      if (s.selection.length || s.editing) ctl.select([]);
      // On existing text before the engine is ready: remembered, edited once it is.
      if (!s.engineReady && src != null && firstOfSrc && !s.readOnly) void ctl.wantLine(src, [entry.view[0] + p[0], entry.view[3] - p[1]]);
      if (t === "select" && e.pointerType === "mouse") {
        wrap.current?.setPointerCapture(e.pointerId);
        gesture.current = { type: "marquee", start: p, cur: p, pointer: e.pointerId };
      }
      return;
    }
    if (s.selection.length) ctl.select([]);
    if (t === "draw") {
      if (e.pointerType === "touch" && penSeen) return; // with a pen, touch pans (AC-94)
      e.preventDefault();
      wrap.current?.setPointerCapture(e.pointerId);
      gesture.current = { type: "ink", points: [p], pointer: e.pointerId };
      return;
    }
    if (t === "mark") {
      e.preventDefault();
      wrap.current?.setPointerCapture(e.pointerId);
      gesture.current = { type: "mark", start: p, cur: p, pointer: e.pointerId };
      return;
    }
    if (t === "text" || t === "shapes" || t === "whiteout") {
      e.preventDefault();
      wrap.current?.setPointerCapture(e.pointerId);
      gesture.current = { type: "create", start: p, cur: p, pointer: e.pointerId };
    }
  };

  const raf = useRef(0);
  const onPointerMove = (e: RPointerEvent<HTMLDivElement>) => {
    const pl = store.get().placement;
    if (pl && e.pointerType === "mouse") {
      const g = ghost.current;
      const r = wrap.current?.getBoundingClientRect();
      if (g && r) {
        g.style.transform = `translate(${e.clientX - r.left}px, ${e.clientY - r.top}px)`;
        g.dataset.show = "";
      }
    }
    const g = gesture.current;
    if (!g || g.pointer !== e.pointerId) return;
    const p = toFrame(e.clientX, e.clientY);
    const alt = e.altKey;
    const shift = e.shiftKey;
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const page = { w: pw, h: ph };
      if (g.type === "move") {
        let dx = p[0] - g.start[0];
        let dy = p[1] - g.start[1];
        if (!g.moved && Math.hypot(dx, dy) * scale < 3) return;
        g.moved = true;
        const union = unionBox(g.origin.map(objectBounds));
        [dx, dy] = clampDelta(union, dx, dy, page);
        let guidesOut: ReturnType<typeof snapMove>["guides"] = [];
        if (!alt) {
          const snapped = snapMove(union, dx, dy, page, others(g.ids), threshold);
          [dx, dy] = clampDelta(union, snapped.dx, snapped.dy, page);
          guidesOut = snapped.guides;
        }
        setDraft(g.origin.map((o) => moveObject(o, dx, dy)));
        store.set({ guides: { page: entry.id, guides: guidesOut }, readout: pointsLabel({ ...union, x: union.x + dx, y: union.y + dy }) });
      } else if (g.type === "resize" && hasBox(g.origin)) {
        let q = p;
        let gs: ReturnType<typeof snapMove>["guides"] = [];
        const orot = "rot" in g.origin ? g.origin.rot : 0;
        if (!alt && !orot) {
          const sp = snapPoint(p, page, others([g.id]), threshold);
          q = sp.p;
          gs = sp.guides;
        }
        const keep = aspectLocked(g.origin) ? !shift : shift;
        // Never past the page edge (rotated boxes by their rotated bounds).
        const b = clampedResize({ ...g.origin, rot: orot }, g.handle, q, keep, page);
        let next = { ...g.origin, ...b } as EditorObject;
        if (next.kind === "text") {
          const m = measurer(next.font, next.size, next.bold, next.italic);
          const lines = layoutText(next.text, b.w, m);
          next = { ...next, wrap: b.w, lines, h: textBoxSize(lines, b.w, next.size, m).h, y: g.origin.y };
          next = keepOnPage(next, page, reflowText);
        }
        setDraft([next]);
        store.set({ guides: { page: entry.id, guides: gs }, readout: pointsLabel(b) });
      } else if (g.type === "rotate" && hasBox(g.origin)) {
        const rot = rotationFor(g.origin, p, shift);
        setDraft([keepOnPage({ ...g.origin, rot } as EditorObject, page)]);
        store.set({ readout: `${Math.round(rot)}°` });
      } else if (g.type === "end" && g.origin.kind === "line") {
        const other = g.which === "a" ? g.origin.b : g.origin.a;
        let q = shift ? constrain45(other, p) : p;
        if (!alt && !shift) q = snapPoint(q, page, others([g.id]), threshold).p;
        q = clampPoint(q, page);
        setDraft([{ ...g.origin, [g.which]: q }]);
      } else if (g.type === "create") {
        g.cur = p;
        const t = store.get().tool;
        const d = defaults();
        const box = dragBox(g.start, p, shift);
        let o: EditorObject | null = null;
        if (t === "shapes" && (d.shapes.shape === "line" || d.shapes.shape === "arrow")) o = { kind: "line", id: "__new", page: entry.id, arrow: d.shapes.shape === "arrow", a: g.start, b: shift ? constrain45(g.start, p) : p, stroke: d.shapes.stroke, width: d.shapes.width };
        else if (t === "shapes") o = { kind: "shape", id: "__new", page: entry.id, shape: d.shapes.shape as "rect" | "ellipse", ...box, rot: 0, stroke: d.shapes.stroke, fill: d.shapes.fill, width: d.shapes.width };
        else if (t === "whiteout") o = { kind: "whiteout", id: "__new", page: entry.id, ...box, fill: d.whiteout.fill === "page" ? "#ffffff" : d.whiteout.fill, border: "#b39aa0", borderWidth: 0.5 };
        else if (t === "text") o = { kind: "whiteout", id: "__new", page: entry.id, ...box, fill: "transparent", border: "#4a63d9", borderWidth: 1 / scale };
        setDraft(o ? [o] : null);
        store.set({ readout: pointsLabel(box) });
      } else if (g.type === "ink") {
        const last = g.points[g.points.length - 1];
        if (Math.hypot(p[0] - last[0], p[1] - last[1]) * scale < 1.5) return;
        g.points.push(p);
        const d = defaults().draw;
        const width = d.marker ? 12 : { S: 1, M: 2.5, L: 6 }[d.width];
        setDraft([{ kind: "ink", id: "__new", page: entry.id, points: [...g.points], color: d.marker ? d.markerColor : d.color, width, marker: d.marker }]);
      } else if (g.type === "mark") {
        g.cur = p;
        const d = defaults().mark;
        const sel = words.length ? selectWords(words, g.start, p) : null;
        const rects = sel ? sel.rects : [dragBox(g.start, p)];
        setDraft([{ kind: "markup", id: "__new", page: entry.id, type: sel ? d.type : "highlight", rects, color: d.color, text: sel?.text ?? "" }]);
      } else if (g.type === "marquee") {
        g.cur = p;
        const b = dragBox(g.start, p);
        store.set({ guides: { page: entry.id, guides: [] }, readout: null });
        if (marquee.current) Object.assign(marquee.current.style, boxStyle(b.x, b.y, b.w, b.h, scale), { display: "block" });
      }
    });
  };

  const onPointerUp = (e: RPointerEvent<HTMLDivElement>) => {
    touches.current.delete(e.pointerId);
    const g = gesture.current;
    if (!g || g.pointer !== e.pointerId) return;
    gesture.current = null;
    cancelAnimationFrame(raf.current);
    const s = store.get();
    const p = toFrame(e.clientX, e.clientY);
    const d = s.draft;
    store.set({ draft: null, guides: null, readout: null });
    if (e.type === "pointercancel") return;
    if (g.type === "move") {
      if (!g.moved || !d) return;
      const label = g.ids.length === 1 ? `Move ${kindLabel(g.origin[0])}` : `Move ${g.ids.length} objects`;
      ctl.update(g.ids, (o) => d[o.id] ?? o, label);
      const b = unionBox(g.ids.map((id) => objectBounds(d[id] ?? g.origin[0])));
      ctl.announce(`Moved to ${Math.round(b.x)}, ${Math.round(b.y)} pt`);
    } else if ((g.type === "resize" || g.type === "rotate" || g.type === "end") && d?.[g.id]) {
      const verb = g.type === "rotate" ? "Rotate" : "Resize";
      ctl.update([g.id], () => d[g.id], `${verb} ${kindLabel(g.origin)}`);
      const b = objectBounds(d[g.id]);
      ctl.announce(g.type === "rotate" ? `Rotated to ${Math.round((d[g.id] as Box & { rot: number }).rot)} degrees` : `${Math.round(b.w)} by ${Math.round(b.h)} pt`);
    } else if (g.type === "create") {
      const clicked = Math.hypot(p[0] - g.start[0], p[1] - g.start[1]) * scale < 4;
      createAt(g.start, p, clicked, e.shiftKey);
    } else if (g.type === "ink") {
      const ink = d?.["__new"];
      const def = s.defaults.draw;
      const width = def.marker ? 12 : { S: 1, M: 2.5, L: 6 }[def.width];
      const points = ink && ink.kind === "ink" ? ink.points : g.points;
      ctl.add([{ kind: "ink", id: newId(), page: entry.id, points: points.length > 1 ? points : [points[0], [points[0][0] + 0.5, points[0][1]]], color: def.marker ? def.markerColor : def.color, width, marker: def.marker }], def.marker ? "Add marker stroke" : "Add drawing", false);
    } else if (g.type === "mark") {
      const m = d?.["__new"];
      if (!m || m.kind !== "markup") return;
      const tiny = Math.hypot(p[0] - g.start[0], p[1] - g.start[1]) * scale < 3;
      if (!m.text && (tiny || !m.rects[0]?.w || !m.rects[0]?.h)) return;
      ctl.add([{ ...m, id: newId() }], `Add ${m.type === "highlight" ? "highlight" : m.type === "underline" ? "underline" : "strike-out"}`, false);
      ctl.announce(`${m.type === "highlight" ? "Highlighted" : m.type === "underline" ? "Underlined" : "Struck out"}${m.text ? `: ${m.text}` : " an area"}`);
    } else if (g.type === "marquee") {
      if (marquee.current) marquee.current.style.display = "none";
      const b = dragBox(g.start, p);
      if (b.w * scale < 3 && b.h * scale < 3) return;
      const hit = objects.filter((o) => intersects(objectBounds(o), b)).map((o) => o.id);
      ctl.select(hit, true);
    }
  };

  // Text editing done: commit the text and its layout, or drop an untouched/empty new box (AC-57).
  const onTextDone = useCallback(
    async (o: TextObj, value: string, cancel: boolean) => {
      store.set({ editing: null });
      const isNew = pendingText.has(o.id);
      pendingText.delete(o.id);
      const untouched = isNew && value === PLACEHOLDER;
      if (cancel || !value.trim() || untouched) {
        const s = store.get();
        const last = H.undoEntry(s.history);
        if (isNew && last?.targets?.length === 1 && last.targets[0] === o.id) {
          const h = H.undo(s.history);
          store.set({ history: { ...h, states: h.states.slice(0, h.index + 1), entries: h.entries.slice(0, h.index) }, selection: [] });
        } else if (!value.trim()) ctl.remove([o.id]);
        return;
      }
      await ensureFace(o.font, o.bold, o.italic, value).catch(() => {});
      const m = measurer(o.font, o.size, o.bold, o.italic);
      const lines = layoutText(value, o.wrap, m);
      const box = textBoxSize(lines, o.wrap, o.size, m);
      const cur = H.current(store.get().history).objects.find((x) => x.id === o.id) as TextObj | undefined;
      if (!cur) return;
      const next: TextObj = { ...cur, text: value, lines, w: box.w, h: box.h };
      if (isNew) {
        const s = store.get();
        store.set({ history: H.replaceCurrent(s.history, onPage({ ...H.current(s.history), objects: H.current(s.history).objects.map((x) => (x.id === o.id ? next : x)) }, [o.id])) });
      } else if (cur.text !== value) ctl.update([o.id], () => next, "Edit text");
      ctl.announce(`Text on page ${index + 1}: ${value}`);
      requestAnimationFrame(() => (document.querySelector(`[data-obj-id="${o.id}"]`) as HTMLElement | null)?.focus({ preventScroll: true }));
    },
    [ctl, store, index],
  );

  const marquee = useRef<HTMLDivElement>(null);
  const ghost = useRef<HTMLDivElement>(null);
  const selectedHere = shown.filter((o) => selection.includes(o.id));
  const current = useStore(store, (s) => s.current === index);
  const readOnly = useStore(store, (s) => s.readOnly);
  const interactiveLines = (tool === "select" || tool === "edit") && engineReady && firstOfSrc && !placement && !readOnly;
  const toolClass = placement ? "place" : tool;

  return (
    <div
      ref={wrap}
      className={cx("ed-pagewrap relative mx-auto", `ed-pagewrap--${toolClass}`)}
      style={{ width: disp.width, height: disp.height }}
      data-page-id={entry.id}
      data-testid={`page-${index + 1}`}
      data-drawn={drawn === "ok" || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => ghost.current && delete ghost.current.dataset.show}
    >
      <section aria-label={`Page ${index + 1} of ${total}`} className="contents">
        <div ref={raster} className={cx("ed-page absolute inset-0 overflow-hidden", drawn === "ok" && "ed-page--drawn")} aria-hidden="true" />
        {drawn === "failed" && (
          <div className="absolute inset-0 grid place-items-center">
            <button type="button" className="mp-btn mp-btn--soft" onClick={() => setRetry((n) => n + 1)}>
              Retry
            </button>
          </div>
        )}
        {lineFlash &&
          lineFlash.rects.map((r, k) => {
            const sr = rectToScreen(r, entry.view, rotation, scale);
            return <span key={`${lineFlash.key}-${k}`} aria-hidden="true" className="ed-flash pointer-events-none absolute rounded-[3px]" style={{ left: sr.left - 2, top: sr.top - 2, width: sr.width + 4, height: sr.height + 4 }} />;
          })}
        {text && firstOfSrc && src != null && (
          <LineLayer
            pageNumber={index + 1}
            view={entry.view}
            rotation={rotation}
            scale={scale}
            text={text}
            editing={lineEdit}
            disabled={!!busy || !fresh}
            active={interactiveLines}
            onEdit={(line, t) => store.set({ lineEdit: { src, line, text: t }, selection: [] })}
            onChange={(t) => store.set((s) => ({ lineEdit: s.lineEdit ? { ...s.lineEdit, text: t } : null }))}
            onCommit={() => void ctl.commitLine()}
            onCancel={() => store.set({ lineEdit: null })}
          />
        )}
        <div
          ref={overlay}
          className={cx("ed-overlay absolute", `ed-overlay--${toolClass}`, hideAnnots && "ed-overlay--hide")}
          style={{ width: W, height: H_, left: (disp.width - W) / 2, top: (disp.height - H_) / 2, transform: rotation ? `rotate(${rotation}deg)` : undefined }}
          data-testid={`overlay-${index + 1}`}
        >
          {shown.map((o, i) => (
            <ObjectView
              key={o.id}
              o={o}
              scale={scale}
              assets={rt.assets}
              selected={selection.includes(o.id)}
              focusable={current}
              editing={editing === o.id}
              hidden={hideAnnots && (o.kind === "markup" || o.kind === "ink")}
              onTextDone={onTextDone}
              index={i}
              total={shown.length}
            />
          ))}
          {flash && shown.filter((o) => flash.ids.includes(o.id)).map((o) => {
            const b = objectBounds(o);
            return <span key={`${flash.key}-${o.id}`} aria-hidden="true" className="ed-pulse" style={boxStyle(b.x, b.y, b.w, b.h, scale)} />;
          })}
          {selectedHere.length > 0 && !editing && <SelectionFrame objs={selectedHere} scale={scale} />}
          {editing && selectedHere.length === 1 && selectedHere[0].kind === "text" && <SelectionFrame objs={selectedHere} scale={scale} editing />}
          {guides?.map((g, i) => (
            <span key={i} aria-hidden="true" className={`ed-guide ed-guide--${g.axis}`} style={g.axis === "x" ? { left: g.at * scale, top: g.from * scale, height: (g.to - g.from) * scale } : { top: g.at * scale, left: g.from * scale, width: (g.to - g.from) * scale }} />
          ))}
          <div ref={marquee} aria-hidden="true" className="ed-marquee" />
        </div>
        {readout && selectedHere.length + (draft?.["__new"]?.page === entry.id ? 1 : 0) > 0 && <Readout text={readout} objs={draft?.["__new"]?.page === entry.id ? [draft["__new"]] : selectedHere} entry={entry} scale={scale} />}
        {placement && (
          <div ref={ghost} aria-hidden="true" className="ed-ghost">
            <img src={placement.preview} alt="" />
          </div>
        )}
        {wide && selectedHere.length > 0 && !draft && !editing && (
          <PropertiesPopover objs={selectedHere} anchor={displayedBounds(unionBox(selectedHere.map(objectBounds)), entry, scale)} pageHeight={disp.height} />
        )}
      </section>
    </div>
  );
});

const pendingText = new Set<string>();

function kindLabel(o: EditorObject) {
  return TOOL_LABELS[o.kind] ?? "object";
}
const TOOL_LABELS: Record<string, string> = { text: "text", image: "image", signature: "signature", shape: "shape", line: "line", ink: "drawing", markup: "highlight", whiteout: "whiteout" };

export function unionBox(boxes: Box[]): Box {
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w));
  const y1 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

const intersects = (a: Box, b: Box) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** A frame box to displayed (rotated) page px. */
export function displayedBounds(b: Box, entry: PageEntry, scale: number) {
  const rot = totalRotation(entry);
  return rectToScreen({ x0: entry.view[0] + b.x, y0: entry.view[3] - b.y, x1: entry.view[0] + b.x + b.w, y1: entry.view[3] - b.y - b.h }, entry.view, rot, scale);
}

function Readout({ text, objs, entry, scale }: { text: string; objs: EditorObject[]; entry: PageEntry; scale: number }) {
  const r = displayedBounds(unionBox(objs.map(objectBounds)), entry, scale);
  return (
    <div aria-hidden="true" className="ed-readout" style={{ left: r.left + r.width / 2, top: r.top + r.height + 10 }}>
      {text}
    </div>
  );
}

const HANDLE_POS: Record<Handle, [number, number]> = { nw: [0, 0], n: [0.5, 0], ne: [1, 0], e: [1, 0.5], se: [1, 1], s: [0.5, 1], sw: [0, 1], w: [0, 0.5] };

function SelectionFrame({ objs, scale, editing }: { objs: EditorObject[]; scale: number; editing?: boolean }) {
  if (objs.length === 1) {
    const o = objs[0];
    if (o.kind === "line") {
      return (
        <>
          {(["a", "b"] as const).map((k) => (
            <span key={k} data-handle={k} className="ed-handle" style={{ left: o[k][0] * scale, top: o[k][1] * scale }} aria-hidden="true" />
          ))}
        </>
      );
    }
    if (hasBox(o)) {
      const rot = "rot" in o ? o.rot : 0;
      return (
        <div className={cx("ed-frame", editing && "ed-frame--editing")} style={boxStyle(o.x, o.y, o.w, o.h, scale, rot)} aria-hidden="true">
          {!editing &&
            handlesOf(o).map((h) => (
              <span key={h} data-handle={h} className={`ed-handle ed-handle--${h}`} style={{ left: `${HANDLE_POS[h][0] * 100}%`, top: `${HANDLE_POS[h][1] * 100}%` }} />
            ))}
          {!editing && canRotate(o) && (
            <span className="ed-rotate" data-handle="rot">
              <span data-handle="rot" />
            </span>
          )}
        </div>
      );
    }
  }
  const b = unionBox(objs.map(objectBounds));
  return <div className="ed-frame ed-frame--group" style={boxStyle(b.x, b.y, b.w, b.h, scale)} aria-hidden="true" />;
}

// Re-exported for the shell's keyboard handling.
export { rotatedCorners, TOOL_NAMES };
