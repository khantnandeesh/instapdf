"use client";
/**
 * Editor controller: every action the UI can take, on top of the store. Object and page changes
 * go through `apply`, which records one history step with a name ("Move signature"), the page it
 * happened on and the objects to reveal on undo. Existing-text edits go through the engine worker
 * (lib/editor/engine-client) and create a new byte version; undo and redo across text edits load
 * the right version back into pdf.js and the engine.
 */
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { Asset } from "@/lib/editor/build";
import { callEngine, describeEngineError, engineErrorLog, offersLineReplacement, openInShapingEngine, setEngineFileSize, type EngineError } from "@/lib/editor/engine-client";
import { lineAt } from "@/lib/editor/line-hit";
import { editorFontFor, lineReplacement } from "@/lib/editor/replace-line";
import { ensureFace, measurer } from "@/lib/editor/fonts-browser";
import * as H from "@/lib/editor/history";
import {
  addObjects,
  deletePage,
  duplicateObjects,
  duplicatePage,
  insertBlankAfter,
  isPristine,
  keepOnPage,
  kindName,
  movePage,
  objectsOn,
  pageSize,
  reorderObjects,
  removeObjects,
  rotatePage,
  updateObjects,
  type DocState,
  type EditorObject,
  type TextObj,
} from "@/lib/editor/model";
import { layoutText, textBoxSize } from "@/lib/editor/text-layout";

/** Lays a text box out again at a new wrap width (used to wrap text at the page edge). */
export function reflowText(t: TextObj, wrap: number): TextObj {
  const m = measurer(t.font, t.size, t.bold, t.italic);
  const lines = layoutText(t.text, wrap, m);
  const box = textBoxSize(lines, wrap, t.size, m);
  return { ...t, wrap, lines, w: box.w, h: box.h };
}

/** Keeps the objects `ids` of a state inside their pages (no object ends past a page edge). */
export function onPage(s: DocState, ids: readonly string[]): DocState {
  const want = new Set(ids);
  let changed = false;
  const objects = s.objects.map((o) => {
    if (!want.has(o.id)) return o;
    const entry = s.pages.find((p) => p.id === o.page);
    if (!entry) return o;
    const k = keepOnPage(o, pageSize(entry), reflowText);
    if (k !== o) changed = true;
    return k;
  });
  return changed ? { ...s, objects } : s;
}
import { referencedAssets } from "@/lib/editor/asset-refs";
import { textAt, type TextItemLike } from "@/lib/editor/line-hit";
import { releaseUnused } from "./assets";
import { pushVersion, releaseBelow, versionBytes, type VersionEntry } from "@/lib/editor/versions";
import { pdfOutputName, baseName } from "@/lib/pdf/naming";
import { openPdf } from "@/lib/pdf/pdfjs";
import type { PageText } from "@/lib/editor/berry-engine";
import { foldName } from "@/lib/font-library/client";
import { chooseStandIn, chosenStandIn, fontLabel, registerWithEngine, standInCandidates } from "./font-service";
import type { Store, ToolId } from "./store";

export type RuntimeAsset = Asset & { url: string; w: number; h: number };

/** Mutable parts that are not history: bytes, pdf.js proxy, images. */
export type Runtime = {
  name: string;
  password?: string;
  hash: string | null;
  /** Engine byte versions (lib/editor/versions): lengths into newer copies where saves appended. */
  versions: VersionEntry[];
  pdf: PDFDocumentProxy;
  /** Index into versions that pdf.js and the engine show. */
  shown: number;
  /** Source page geometry (view box and own rotation), from the original file. */
  src: { view: [number, number, number, number]; rotate: number }[];
  assets: Record<string, RuntimeAsset>;
  /** Assets an open dialog is using (not yet placed). */
  held: Set<string>;
  /** Objects copied with Ctrl/Cmd+C. */
  clip: { objs: EditorObject[]; page: string } | null;
  /** The file was encrypted: the download has no password (re-encryption comes later). */
  wasEncrypted: boolean;
};

export type Announce = (msg: string, assertive?: boolean) => void;
export type Toast = { text: string; tone: "info" | "success" | "danger"; action?: { label: string; run: () => void }; key: number };

export type Controller = ReturnType<typeof createController>;

/** "ABCDEF+TimesNewRomanPS-BoldMT" → "TimesNewRomanPS": the name a person recognises. */
export function familyOfFont(name: string): string {
  const bare = name.replace(/^[A-Z]{6}\+/, "").split(/[-,]/)[0] || name;
  return bare.replace(/([a-z])(Sans|Serif|Mono|Slab|Display|Text|Condensed|Narrow|New|Roman|Gothic|Script|Pro)(?![a-z])/g, "$1 $2");
}

const isEngineError = (e: unknown): e is EngineError => !!e && typeof e === "object" && "kind" in e;

export function createController(store: Store, rt: Runtime, ui: { announce: Announce; toast: (t: Omit<Toast, "key">) => void }) {
  const state = () => H.current(store.get().history);
  const pageName = (pageId?: string) => {
    const i = state().pages.findIndex((p) => p.id === pageId);
    return i >= 0 ? `page ${i + 1}` : "";
  };

  /** Records one change. */
  function apply(next: DocState, label: string, opts: { page?: string; targets?: string[]; key?: string; select?: string[] } = {}) {
    // An owner-restricted file is read-only until its owner password is entered.
    if (store.get().readOnly) return ui.toast({ text: "Locked by the file’s owner.", tone: "info" });
    store.set((s) => ({
      history: H.commit(s.history, next, { label, page: opts.page, targets: opts.targets, key: opts.key, at: Date.now() }),
      selection: opts.select ?? s.selection.filter((id) => next.objects.some((o) => o.id === id)),
      // The font notice is about the last change only ("Change" undoes and redoes it).
      fontNotice: null,
    }));
  }

  function objectsById(ids: readonly string[]) {
    const set = new Set(ids);
    return state().objects.filter((o) => set.has(o.id));
  }

  /** "signature", "2 objects" */
  function nameOf(ids: readonly string[]) {
    const objs = objectsById(ids);
    if (objs.length === 1) return kindName(objs[0]).toLowerCase();
    return `${objs.length} objects`;
  }

  // Versions no history state refers to any more are released (history trims at MAX_STEPS).
  let lastHistory = store.get().history;
  store.subscribe(() => {
    const h = store.get().history;
    if (h === lastHistory) return;
    lastHistory = h;
    rt.versions = releaseBelow(rt.versions, Math.min(H.minEngine(h), rt.shown));
  });

  // Assets nothing refers to any more are released (a short delay lets a dialog hold a new one).
  let sweep: ReturnType<typeof setTimeout> | null = null;
  const sweepAssets = () => {
    sweep = null;
    const s = store.get();
    releaseUnused(rt, referencedAssets({ history: s.history, placement: s.placement, clip: rt.clip?.objs, held: rt.held }));
  };
  store.subscribe(() => {
    if (!sweep) sweep = setTimeout(sweepAssets, 1000);
  });

  const ctl = {
    store,
    rt,
    /** Bytes of an engine version (throws if it was released: no state can point at it). */
    bytesOf(i: number): Uint8Array {
      const b = versionBytes(rt.versions, i);
      if (!b) throw new Error(`engine version ${i} was released`);
      return b;
    },
    state,
    announce: ui.announce,
    toast: ui.toast,
    apply,
    objectsById,

    setTool(tool: ToolId, locked = false) {
      const s = store.get();
      if (s.readOnly && tool !== "select") return;
      // Edit text before the engine is ready: its load progress shows on the tool.
      const wanted = tool === "edit" && ctl.engineAllowed && !s.engineReady ? { engineWanted: true } : {};
      if (tool === "edit") ctl.startEngine();
      store.set({ tool, locked, placement: null, editing: null, lineEdit: null, pendingLine: null, ...wanted });
      ui.announce(`${TOOL_NAMES[tool]} tool${locked ? ", locked" : ""}`);
    },

    select(ids: string[], announce = false) {
      store.set({ selection: ids, editing: null });
      if (announce && ids.length) ui.announce(`Selected ${nameOf(ids)}`);
    },

    add(objs: EditorObject[], label: string, select = true) {
      apply(onPage(addObjects(state(), objs), objs.map((o) => o.id)), label, { page: objs[0]?.page, targets: objs.map((o) => o.id), select: select ? objs.map((o) => o.id) : undefined });
      store.set({ flash: { ids: objs.map((o) => o.id), key: Date.now() } });
    },

    update(ids: readonly string[], fn: (o: EditorObject) => EditorObject, label: string, key?: string) {
      if (!ids.length) return;
      const objs = objectsById(ids);
      apply(onPage(updateObjects(state(), ids, fn), ids), label, { page: objs[0]?.page, targets: [...ids], key });
    },

    remove(ids: readonly string[]) {
      if (!ids.length) return;
      const what = nameOf(ids);
      const page = objectsById(ids)[0]?.page;
      apply(removeObjects(state(), ids), `Delete ${what}`, { page, targets: [...ids], select: [] });
      ui.announce(`Deleted ${what}. Ctrl+Z to undo.`);
    },

    duplicate(ids: readonly string[], nextPage = false) {
      if (!ids.length) return;
      const r = duplicateObjects(state(), ids, nextPage);
      if (!r.ids.length) return;
      apply(onPage(r.state, r.ids), `Duplicate ${nameOf(ids)}`, { page: objectsById(r.ids)[0]?.page ?? r.state.objects.find((o) => o.id === r.ids[0])?.page, targets: r.ids, select: r.ids });
      ui.announce(`Duplicated ${r.ids.length === 1 ? "it" : `${r.ids.length} objects`}`);
    },

    reorder(ids: readonly string[], dir: 1 | -1) {
      if (!ids.length) return;
      const next = reorderObjects(state(), ids, dir);
      if (next.objects.every((o, i) => o === state().objects[i])) return;
      apply(next, dir === 1 ? "Bring forward" : "Send backward", { page: objectsById(ids)[0]?.page, targets: [...ids], select: [...ids] });
      ui.announce(dir === 1 ? "Brought forward" : "Sent backward");
    },

    // ---- pages ----
    rotatePage(pageId: string, delta: 90 | -90) {
      apply(rotatePage(state(), pageId, delta), `Rotate ${pageName(pageId)}`, { page: pageId });
      ui.announce(`Rotated ${pageName(pageId)} ${delta > 0 ? "right" : "left"}`);
    },
    deletePage(pageId: string) {
      const s = state();
      if (s.pages.length <= 1) return;
      const n = s.pages.findIndex((p) => p.id === pageId) + 1;
      apply(deletePage(s, pageId), `Delete page ${n}`, { page: pageId, select: [] });
      ui.announce(`Page ${n} deleted. Ctrl+Z to undo.`);
      ui.toast({ text: `Page ${n} deleted`, tone: "info", action: { label: "Undo", run: () => ctl.undo() } });
    },
    duplicatePage(pageId: string) {
      const r = duplicatePage(state(), pageId);
      apply(r.state, `Duplicate ${pageName(pageId)}`, { page: r.id });
      ui.announce(`Duplicated ${pageName(pageId)}`);
    },
    insertBlank(pageId: string) {
      const r = insertBlankAfter(state(), pageId);
      apply(r.state, `Insert page after ${pageName(pageId)}`, { page: r.id });
      ui.announce(`Inserted a blank page after ${pageName(pageId)}`);
    },
    movePage(pageId: string, to: number) {
      const from = state().pages.findIndex((p) => p.id === pageId);
      if (from === to || to < 0 || to >= state().pages.length) return;
      apply(movePage(state(), pageId, to), `Move page ${from + 1}`, { page: pageId });
      ui.announce(`Moved page ${from + 1} to position ${to + 1}`);
    },

    // ---- history ----
    async undo() {
      const s = store.get();
      if (!H.canUndo(s.history) || s.busy) return;
      const entry = H.undoEntry(s.history)!;
      await ctl.goto(H.undo(s.history), entry, "Undid");
    },
    async redo() {
      const s = store.get();
      if (!H.canRedo(s.history) || s.busy) return;
      const entry = H.redoEntry(s.history)!;
      await ctl.goto(H.redo(s.history), entry, "Redid");
    },
    async revert(indexes: number[]) {
      const s = store.get();
      const next = H.revertEntries(s.history, indexes);
      if (next === s.history) return;
      await ctl.goto(next, H.undoEntry(next)!, "Done");
    },
    /** Shows another history position: loads the engine version it needs, reveals and flashes what changed. */
    async goto(history: H.History, entry: H.Change, verb: string) {
      const target = H.current(history);
      if (target.engine !== rt.shown) {
        store.set({ busy: "edit" });
        try {
          await ctl.showVersion(target.engine);
        } catch {
          ui.toast({ text: "That step couldn’t be undone. Please try again.", tone: "danger" });
          store.set({ busy: null });
          return;
        }
        store.set({ busy: null });
      }
      const live = (entry.targets ?? []).filter((id) => target.objects.some((o) => o.id === id));
      store.set({ history, selection: live, editing: null, lineEdit: null, fontNotice: null, flash: { ids: live, key: Date.now() } });
      ui.announce(`${verb}: ${entry.label.toLowerCase()}`);
      if (entry.page) ctl.revealPage?.(entry.page, live[0]);
    },
    /** Set by the canvas: scrolls a page (and an object on it) into view. */
    revealPage: null as null | ((pageId: string, objectId?: string) => void),
    /** Set by the shell: opens the sign dialog, the image picker, a download. */
    openSign: null as null | ((role?: "signature" | "initials") => void),
    pickImage: null as null | (() => void),
    download: null as null | ((name?: string) => void),

    // ---- existing text (engine) ----
    async showVersion(index: number) {
      const bytes = ctl.bytesOf(index);
      const copy = bytes.slice();
      if (store.get().engineReady) await callEngine({ op: "open", bytes: copy }, [copy.buffer]);
      const opened = await openPdf(bytes.slice(), rt.password);
      if (!opened.ok) throw new Error("pdf.js");
      const prev = rt.pdf;
      rt.pdf = opened.pdf.doc;
      rt.shown = index;
      setEngineFileSize(bytes.length);
      store.set((s) => ({ pdfRev: s.pdfRev + 1, fresh: {}, rasterRev: Object.fromEntries(rt.src.map((_, i) => [i, (s.rasterRev[i] ?? 0) + 1])) }));
      setTimeout(() => void prev.loadingTask.destroy(), 2000);
    },

    /** Opens the shown bytes in the engine (downloading it first if needed). Never throws. */
    openEngine(): Promise<void> {
      ctl.engineStarted = true;
      const opening = (async () => {
        // The shown version can change while the engine downloads (a restore): open the latest.
        for (;;) {
          const shown = rt.shown;
          const copy = ctl.bytesOf(shown).slice();
          setEngineFileSize(copy.length);
          await callEngine({ op: "open", bytes: copy }, [copy.buffer]);
          if (shown === rt.shown) break;
        }
        store.set({ engineReady: true, fresh: {} });
      })().catch(() => store.set({ engineReady: false }));
      ctl.engineOpening = opening;
      return opening;
    },
    engineOpening: Promise.resolve() as Promise<void>,
    /** False for files the engine never opens (encrypted ones). */
    engineAllowed: false,
    engineStarted: false,
    /**
     * Starts the engine (download, then open) unless it's running. Called once the first page is
     * drawn, or at once when it's already loaded or loading (prefetched), or when Edit text is
     * asked for: on a slow connection the page itself comes first.
     */
    startEngine() {
      if (ctl.engineAllowed && !ctl.engineStarted) void ctl.openEngine();
    },
    /**
     * A click at (ux, uy) on source page `src` before the engine is ready: if pdf.js finds text
     * there, it's remembered (and the load progress shown) so the line edit starts once it's ready.
     */
    async wantLine(src: number, at: [number, number]) {
      if (!ctl.engineAllowed || store.get().engineReady) return;
      try {
        const page = await rt.pdf.getPage(src + 1);
        const content = await page.getTextContent();
        if (!textAt(content.items.flatMap((i) => ("str" in i ? [i as unknown as TextItemLike] : [])), at[0], at[1])) return;
      } catch {
        return;
      }
      if (store.get().engineReady) return;
      store.set({ pendingLine: { src, at }, engineWanted: true, selection: [] });
      ctl.startEngine();
      ui.announce("Getting text editing ready. The line opens when it is.");
    },

    /**
     * Reopens the shown bytes in the shaping build (downloading it, with its own progress ring),
     * for a line marked "needs-shaping" or an edit that typed such text. The page texts are read
     * again from it. Resolves false when the download failed (the default build stays open, and
     * the pill offers Retry). Never prefetched: this is the only way the shaping files load.
     */
    shapingOpening: null as Promise<boolean> | null,
    loadShaping(): Promise<boolean> {
      if (store.get().shaping === "ready") return Promise.resolve(true);
      ctl.shapingOpening ??= (async () => {
        store.set({ shaping: "loading", engineReady: false });
        try {
          if (ctl.recovering) await ctl.recovering;
          for (;;) {
            const shown = rt.shown;
            await openInShapingEngine(ctl.bytesOf(shown).slice());
            if (shown === rt.shown) break;
          }
          ctl.failedText.clear();
          store.set({ shaping: "ready", engineReady: true, fresh: {} });
          ui.announce("Text editing for this script is ready.");
          return true;
        } catch {
          store.set({ shaping: "failed", engineReady: true });
          return false;
        }
      })().finally(() => (ctl.shapingOpening = null));
      return ctl.shapingOpening;
    },
    /** A click on a line that needs the shaping build: load it, then open that line for editing. */
    wantShapedLine(src: number, at: [number, number]) {
      store.set({ pendingLine: { src, at }, selection: [] });
      ui.announce("Getting text editing ready for this script. The line opens when it is.");
      void ctl.loadShaping();
    },

    loadingText: new Set<number>(),
    failedText: new Set<number>(),
    async ensureText(src: number) {
      const s = store.get();
      if (!s.engineReady || s.fresh[src] || ctl.loadingText.has(src) || ctl.failedText.has(src)) return;
      ctl.loadingText.add(src);
      const version = rt.shown;
      let retry = false;
      try {
        if (ctl.recovering) await ctl.recovering;
        const { page } = await callEngine({ op: "text", page: src });
        if (version !== rt.shown) return;
        store.set((st) => ({ texts: { ...st.texts, [src]: page }, fresh: { ...st.fresh, [src]: true } }));
      } catch (err) {
        // Another call crashed the worker while this one waited: ask again once the engine is back.
        if (isEngineError(err) && err.kind === "aborted") retry = true;
        else {
          ctl.failedText.add(src);
          ui.toast({ text: `Page ${src + 1} can’t be edited.`, tone: "danger" });
          if (isEngineError(err) && err.kind === "crashed") await ctl.recoverEngine();
        }
      } finally {
        ctl.loadingText.delete(src);
      }
      if (retry) {
        await new Promise((r) => setTimeout(r, 0));
        if (ctl.recovering) await ctl.recovering;
        await ctl.ensureText(src);
      }
    },
    recovering: null as Promise<void> | null,
    recoverEngine(): Promise<void> {
      ctl.recovering ??= (async () => {
        try {
          const copy = ctl.bytesOf(rt.shown).slice();
          await callEngine({ op: "open", bytes: copy }, [copy.buffer]);
          store.set({ fresh: {} });
        } catch {
          ui.toast({ text: "The editor couldn’t restart. Download what you have, then reload the page.", tone: "danger" });
        }
      })().finally(() => (ctl.recovering = null));
      return ctl.recovering;
    },

    async commitLine(): Promise<void> {
      const s = store.get();
      const e = s.lineEdit;
      store.set({ lineEdit: null });
      if (!e || s.readOnly) return;
      const line = s.texts[e.src]?.lines[e.line];
      if (!line || line.text === e.text) return;
      store.set({ busy: "edit" });
      try {
        const { result, bytes, appended } = await ctl.replaceWithStandIn(e, s.texts[e.src]);
        const opened = await openPdf(bytes.slice(), rt.password);
        if (!opened.ok) {
          const back = ctl.bytesOf(rt.shown).slice();
          await callEngine({ op: "open", bytes: back }, [back.buffer]).catch(() => {});
          ui.toast({ text: "That change couldn’t be shown, so it wasn’t made.", tone: "danger" });
          return;
        }
        const prev = rt.pdf;
        const pushed = pushVersion(rt.versions, rt.shown, bytes, appended);
        rt.versions = pushed.versions;
        rt.shown = pushed.index;
        // Copies beyond the budget were released: states that needed them can't be shown any more.
        if (pushed.floor > 0) store.set((st) => ({ history: H.dropBelowEngine(st.history, pushed.floor) }));
        rt.pdf = opened.pdf.doc;
        setEngineFileSize(bytes.length);
        setTimeout(() => void prev.loadingTask.destroy(), 2000);
        const pageId = state().pages.find((p) => p.src === e.src)?.id;
        store.set((st) => ({
          pdfRev: st.pdfRev + 1,
          texts: { ...st.texts, [e.src]: result.page },
          fresh: {},
          rasterRev: { ...st.rasterRev, [e.src]: (st.rasterRev[e.src] ?? 0) + 1 },
          lineFlash: { src: e.src, rects: result.changed, key: Date.now() },
        }));
        apply({ ...state(), engine: rt.shown }, "Edit text", { page: pageId });
        // Another font drew some characters: say which, and offer a different one (F24).
        const sub = result.substitutions.find((x) => !x.same_family);
        if (sub) {
          const standInId = ctl.standInIdOf(sub.substitute_font);
          const original = familyOfFont(sub.original_font);
          store.set({ fontNotice: { original, standIn: sub.substitute_font, standInId, fontName: sub.original_font, src: e.src, line: e.line, text: e.text, key: Date.now() } });
          ui.announce(`${original} isn’t complete in this file. Using ${sub.substitute_font}.`);
        } else store.set({ fontNotice: null });
      } catch (err) {
        // Typed Hindi, Arabic or similar into a line of the default build: load the shaping
        // build, find the same line in its reading of the page, and make the same edit there.
        if (isEngineError(err) && err.kind === "read-only" && err.reason === "needs-shaping" && store.get().shaping !== "ready") {
          store.set({ busy: null });
          const at: [number, number] = [(line.bbox.x0 + line.bbox.x1) / 2, (line.bbox.y0 + line.bbox.y1) / 2];
          if (!(await ctl.loadShaping())) return;
          await ctl.ensureText(e.src);
          const page = store.get().texts[e.src];
          const i = page ? lineAt(page.lines, at[0], at[1]) : -1;
          if (i < 0) return ui.toast({ text: describeEngineError(err), tone: "danger" });
          store.set({ lineEdit: { src: e.src, line: i, text: e.text } });
          return ctl.commitLine();
        }
        if (isEngineError(err)) {
          console.warn(engineErrorLog(err));
          const action = offersLineReplacement(err) ? { label: "Replace with new text", run: () => void ctl.replaceLineWithText(e) } : undefined;
          ui.toast({ text: describeEngineError(err), tone: "danger", action });
          if (err.kind === "crashed" || err.kind === "aborted" || err.kind === "internal") await ctl.recoverEngine();
        } else ui.toast({ text: "That change couldn’t be made.", tone: "danger" });
      } finally {
        store.set({ busy: null });
      }
    },

    /**
     * Fallback for an edit the engine refused: cover the line with a whiteout and put a text box
     * with the typed text in its place (same size, colour and baseline, the closest editor font).
     */
    async replaceLineWithText(edit: { src: number; line: number; text: string }) {
      const s = store.get();
      const page = s.texts[edit.src];
      const line = page?.lines[edit.line];
      const entry = state().pages.find((p) => p.src === edit.src);
      if (!page || !line || !entry) return;
      const face = editorFontFor(page.fonts[line.runs[0]?.font ?? -1]);
      const size = line.runs[0]?.size ?? line.size;
      try {
        const metrics = await ensureFace(face.font, face.bold, face.italic, edit.text);
        const objs = lineReplacement({ line, fonts: page.fonts, entry, text: edit.text, face, metrics, measure: measurer(face.font, size, face.bold, face.italic) });
        if (!objs) {
          ui.toast({ text: "This line can’t be replaced automatically. Use Whiteout and Text instead.", tone: "info" });
          return;
        }
        ctl.add(objs, "Replace line", false);
        ui.announce("Line replaced with new text");
      } catch {
        ui.toast({ text: "The font for the new text couldn’t load. Please try again.", tone: "danger" });
      }
    },

    /** Engine family name → the font id it was registered from. */
    standIns: new Map<string, string>(),
    /** The document fonts and style the registered stand-ins were chosen for. */
    standInKey: "",
    /** The font id a stand-in name from the engine ("Tinos", "Tinos Bold Italic") was registered from. */
    standInIdOf(name: string): string {
      return ctl.standIns.get(name) ?? ctl.standIns.get(name.replace(/ (Bold Italic|Bold|Italic)$/, "")) ?? "";
    },
    /**
     * Replaces a line; when its font lacks a typed character, registers the closest font we have
     * (the person's choice, the best shape match, then the engine's own list) and tries again.
     * The engine uses any registered font that has the character, so the registered ones are
     * dropped whenever the line's fonts differ from those they were chosen for: each document
     * font and style gets its own closest font.
     */
    async replaceWithStandIn(e: { src: number; line: number; text: string }, page: PageText | undefined) {
      const call = { op: "replace", page: e.src, line: e.line, text: e.text } as const;
      const runs = page?.lines[e.line]?.runs ?? [];
      const fonts = [...new Set(runs.map((r) => r.font))].map((i) => page!.fonts[i]).filter(Boolean);
      const key = fonts.map((f) => `${f.name}|${f.bold}|${f.italic}`).sort().join(",");
      if (ctl.standIns.size && key !== ctl.standInKey) {
        await callEngine({ op: "clearFonts" });
        ctl.standIns.clear();
      }
      try {
        return await callEngine(call);
      } catch (err) {
        if (!isEngineError(err) || err.kind !== "missing-glyphs") throw err;
        // The font the engine asks about: the run whose family it names, else the line's first.
        const asked = foldName(err.request.families[0] ?? "");
        const info = fonts.find((f) => asked && foldName(f.family || f.name) === asked && f.bold === err.request.bold && f.italic === err.request.italic) ?? fonts.find((f) => asked && foldName(f.family || f.name) === asked) ?? fonts[0];
        ctl.standInKey = key;
        ctl.standInFor = asked;
        for (const id of await standInCandidates(info, err.request)) {
          if (!(await registerWithEngine(id, err.request.bold, err.request.italic, err.chars))) continue;
          ctl.standIns.set(fontLabel(id), id);
          try {
            return await callEngine(call);
          } catch (again) {
            // This font lacks them too (or the edit failed for another reason): try the next.
            if (!isEngineError(again) || again.kind !== "missing-glyphs") throw again;
          }
        }
        throw err;
      }
    },
    /** The document family (folded) the last stand-in was asked for: the key of the person's choice. */
    standInFor: "",

    /**
     * The notice's "Change": the person picks the font that stands in. The edit is undone and
     * made again with it, and later edits of that document font use it too. If the font can't be
     * used, the edit is put back as it was and a message says so.
     */
    async changeStandIn(id: string) {
      const n = store.get().fontNotice;
      if (!n || store.get().busy) return;
      const key = ctl.standInFor || foldName(n.original);
      const before = chosenStandIn(key);
      const lineText = () => store.get().texts[n.src]?.lines[n.line]?.text;
      try {
        await ctl.undo();
        const { page } = await callEngine({ op: "text", page: n.src });
        if (page.lines[n.line]?.text === n.text) {
          // Nothing was undone (the step is no longer kept): leave the edit as it is.
          ui.toast({ text: "That edit can’t be changed any more. Edit the line again to pick a font.", tone: "info" });
          return;
        }
        chooseStandIn(key, id);
        await callEngine({ op: "clearFonts" });
        ctl.standIns.clear();
        store.set((st) => ({ texts: { ...st.texts, [n.src]: page }, fresh: { ...st.fresh, [n.src]: true }, lineEdit: { src: n.src, line: n.line, text: n.text } }));
        await ctl.commitLine();
        const now = store.get().fontNotice;
        if (lineText() !== n.text) {
          // The edit could not be made with that font: put it back as it was.
          chooseStandIn(key, before);
          await callEngine({ op: "clearFonts" }).catch(() => {});
          ctl.standIns.clear();
          await ctl.redo();
        } else if (now && now.standInId !== id) {
          chooseStandIn(key, before);
          ui.toast({ text: `${fontLabel(id)} can’t be used for existing text yet, or lacks these characters. Using ${now.standIn}.`, tone: "info" });
        }
      } catch (err) {
        chooseStandIn(key, before);
        ui.toast({ text: isEngineError(err) ? describeEngineError(err) : "That font couldn’t be used.", tone: "danger" });
      }
    },

    // ---- output ----
    outputName(edited = false) {
      const name = pdfOutputName(rt.name);
      return edited ? `${baseName(name)}-edited.pdf` : name;
    },
    pristine: () => isPristine(state()),
    objectsOn: (pageId: string) => objectsOn(state(), pageId),
  };
  return ctl;
}

export const TOOL_NAMES: Record<ToolId, string> = {
  select: "Select",
  edit: "Edit text",
  text: "Text",
  sign: "Sign",
  mark: "Mark",
  draw: "Draw",
  shapes: "Shapes",
  image: "Image",
  whiteout: "Whiteout",
};
