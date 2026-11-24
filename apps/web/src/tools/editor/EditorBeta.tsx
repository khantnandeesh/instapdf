"use client";
import "./editor.css";
/**
 * Edit PDF (beta): change existing text, line by line (F16, a small subset of phase E1/E2).
 *
 * pdf.js draws the pages; berry-engine (WebAssembly in a Web Worker, loaded only once a file is
 * opened) reads each page's lines and rewrites them. After an edit the engine saves
 * incrementally (the previous bytes + one revision) and only the edited page is redrawn from
 * those bytes. Page geometry (box and rotation) comes from pdf.js, which draws the canvas.
 * Nothing leaves the device.
 */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { Floaties, Sticker } from "@/components/berry/Berry";
import { DropOverlay } from "@/components/tool-flow/DropOverlay";
import { FilePicker } from "@/components/tool-flow/FilePicker";
import { PrivacyNote } from "@/components/tool-flow/notes";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { cx } from "@/components/ui/cx";
import type { PageText, Rect } from "@/lib/editor/berry-engine";
import { callEngine, describeEngineError, setEngineFileSize, type EngineError } from "@/lib/editor/engine-client";
import { displaySize, lineBox, rectToScreen, type PageBox } from "@/lib/editor/geometry";
import { pushUndo, undoBytes, type UndoEntry } from "@/lib/editor/undo";
import { pdfOutputName } from "@/lib/pdf/naming";
import { openPdf } from "@/lib/pdf/pdfjs";
import { CloseBold, DownloadBold, FileUpBold, UndoBold } from "./icons";

const MAX_BYTES = 100 * 1024 * 1024;
const MAX_PAGE_WIDTH = 880;
const MAX_DPR = 2;

/** What pdf.js draws: the page's view box (CropBox ∩ MediaBox) and normalised /Rotate. */
type PageGeo = { view: PageBox; rotate: number };

type Doc = {
  name: string;
  bytes: Uint8Array;
  pdf: PDFDocumentProxy;
  geo: PageGeo[];
  /** CSS px per point, per page (fit width). */
  scales: number[];
};

type Editing = { page: number; line: number; text: string };
type Flash = { page: number; rects: Rect[]; key: number };

function isEngineError(e: unknown): e is EngineError {
  return !!e && typeof e === "object" && "kind" in e;
}

async function readGeometry(pdf: PDFDocumentProxy): Promise<PageGeo[]> {
  const out: PageGeo[] = new Array(pdf.numPages);
  const BATCH = 50;
  for (let start = 0; start < pdf.numPages; start += BATCH) {
    const end = Math.min(pdf.numPages, start + BATCH);
    await Promise.all(
      Array.from({ length: end - start }, async (_, k) => {
        const page = await pdf.getPage(start + k + 1);
        const [x0, y0, x1, y1] = page.view;
        out[start + k] = { view: [x0, y0, x1, y1], rotate: page.rotate };
        page.cleanup();
      }),
    );
  }
  return out;
}

const fitScales = (geo: PageGeo[], avail: number) => geo.map((g) => avail / displaySize(g.view, g.rotate, 1).width);

export function EditorBeta() {
  const [doc, setDoc] = useState<Doc | null>(null);
  const [texts, setTexts] = useState<(PageText | undefined)[]>([]);
  /**
   * Pages whose text was read from the engine's current document. After a reload the old text
   * stays on screen (read-only) until the fresh one arrives, so a focused line list never
   * unmounts under the keyboard.
   */
  const [fresh, setFresh] = useState<boolean[]>([]);
  /** Bumped per page when its canvas must be redrawn from the current bytes. */
  const [versions, setVersions] = useState<number[]>([]);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [busy, setBusy] = useState<"open" | "edit" | "save" | null>(null);
  const [notice, setNotice] = useState<{ text: string; tone: "error" | "info"; key: number } | null>(null);
  const [undo, setUndo] = useState<UndoEntry[]>([]);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [dragging, setDragging] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const docRef = useRef<Doc | null>(null);
  docRef.current = doc;
  const loadingText = useRef(new Set<number>());
  /** Pages whose text crashed or failed in the engine: never asked again for this file. */
  const failedPages = useRef(new Set<number>());
  const recovering = useRef<Promise<void> | null>(null);

  const say = useCallback((text: string, tone: "error" | "info" = "error") => setNotice({ text, tone, key: Date.now() }), []);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  // Unsaved edits: ask before leaving.
  useEffect(() => {
    if (!undo.length) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [undo.length]);

  /**
   * Points pdf.js (and, unless `engine` is false, the engine) at `bytes`. Other pages' canvases
   * are kept unless `redraw` names them.
   */
  const load = useCallback(async (name: string, bytes: Uint8Array, redraw: number[] | "all", engine = true) => {
    if (engine) {
      const copy = bytes.slice();
      await callEngine({ op: "open", bytes: copy }, [copy.buffer]);
    }
    const opened = await openPdf(bytes.slice());
    if (!opened.ok) throw (opened.reason === "corrupt" ? { kind: "parse", message: "pdf.js" } : { kind: "encrypted" }) satisfies EngineError;
    const pdf = opened.pdf.doc;
    const prev = docRef.current;
    let geo = prev?.geo;
    let scales = prev?.scales;
    if (redraw === "all" || !geo || !scales) {
      geo = await readGeometry(pdf);
      scales = fitScales(geo, Math.min(MAX_PAGE_WIDTH, (stage.current?.clientWidth ?? MAX_PAGE_WIDTH) - 2));
    }
    loadingText.current.clear();
    setFresh([]);
    if (redraw === "all") setTexts([]);
    setEngineFileSize(bytes.length);
    setVersions((v) => (redraw === "all" ? geo.map(() => 0) : v.map((n, i) => (redraw.includes(i) ? n + 1 : n))));
    setDoc({ name, bytes, pdf, geo, scales });
    if (prev && prev.pdf !== pdf) setTimeout(() => void prev.pdf.loadingTask.destroy(), 2000);
  }, []);

  /** After a crash or a timeout the worker is fresh: give it the last good bytes again (once at a time). */
  const recover = useCallback((): Promise<void> => {
    recovering.current ??= (async () => {
      const d = docRef.current;
      if (!d) return;
      try {
        await load(d.name, d.bytes, []);
      } catch {
        say("The editor couldn’t restart. Download what you have, then reload the page.");
      }
    })().finally(() => (recovering.current = null));
    return recovering.current;
  }, [load, say]);

  /** Loads a page's lines from the engine (once per document state). */
  const ensureText = useCallback(
    async (page: number) => {
      if (loadingText.current.has(page) || failedPages.current.has(page) || recovering.current) return;
      loadingText.current.add(page);
      try {
        const { page: text } = await callEngine({ op: "text", page });
        setTexts((prev) => {
          const next = [...prev];
          next[page] = text;
          return next;
        });
        setFresh((prev) => {
          const next = [...prev];
          next[page] = true;
          return next;
        });
      } catch (err) {
        loadingText.current.delete(page);
        // Another call crashed the worker: this page is retried after the reload.
        if (isEngineError(err) && err.kind === "aborted") return;
        failedPages.current.add(page);
        say(`Page ${page + 1} can’t be edited.`);
        if (isEngineError(err) && err.kind === "crashed") await recover();
      }
    },
    [recover, say],
  );

  const openFile = useCallback(
    async (file: File) => {
      if (undo.length && !window.confirm("Open another PDF? Your edits to this one will be lost.")) return;
      if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") return say("Choose a PDF file.");
      if (file.size > MAX_BYTES) return say("This beta opens PDFs up to 100 MB.");
      setBusy("open");
      setEditing(null);
      setUndo([]);
      setFlash(null);
      failedPages.current.clear();
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        await load(file.name, bytes, "all");
        setNotice(null);
      } catch (e) {
        if (isEngineError(e) && (e.kind === "crashed" || e.kind === "internal")) say("This file can’t be edited.");
        else say(isEngineError(e) ? describeEngineError(e) : "This file couldn’t be opened.");
      } finally {
        setBusy(null);
      }
    },
    [load, say, undo.length],
  );

  // The whole page is the drop target.
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes("Files");
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDragging(true);
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const file = e.dataTransfer?.files[0];
      if (file) void openFile(file);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, [openFile]);

  // Re-layout on resize or rotation: new fit-width scales, every page redrawn sharp.
  const open = !!doc;
  useEffect(() => {
    const el = stage.current;
    if (!open || !el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ro = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const d = docRef.current;
        if (!d) return;
        const scales = fitScales(d.geo, Math.min(MAX_PAGE_WIDTH, el.clientWidth - 2));
        // Ignore small changes (a scrollbar coming and going), which would otherwise oscillate.
        if (scales.every((s, i) => Math.abs(s - d.scales[i]) * displaySize(d.geo[i].view, d.geo[i].rotate, 1).width < 20)) return;
        setDoc({ ...d, scales });
      }, 150);
    });
    ro.observe(el);
    return () => {
      clearTimeout(timer);
      ro.disconnect();
    };
  }, [open]);

  const commit = useCallback(async () => {
    const d = docRef.current;
    const e = editing;
    setEditing(null);
    if (!d || !e) return;
    const line = texts[e.page]?.lines[e.line];
    if (!line || line.text === e.text) return;
    setBusy("edit");
    try {
      // The worker rolls the engine back when the edit or its save fails, and reopens from
      // the output when it succeeds, so pdf.js only needs the new bytes here.
      const { result, bytes, appended } = await callEngine({ op: "replace", page: e.page, line: e.line, text: e.text });
      try {
        await load(d.name, bytes, [e.page], false);
      } catch {
        // pdf.js can't read the engine's output: put the engine back on the bytes we show.
        await load(d.name, d.bytes, [], true).catch(() => {});
        say("That change couldn’t be shown, so it wasn’t made.");
        return;
      }
      // Recorded only once the new bytes are on screen.
      setUndo((u) => pushUndo(u, d.bytes, bytes, e.page, appended));
      // Show the edit's text (read-only) until the reopened document's text arrives.
      setTexts((prev) => {
        const next = [...prev];
        next[e.page] = result.page;
        return next;
      });
      setFlash({ page: e.page, rects: result.changed, key: Date.now() });
      if (result.substitutions.some((s) => !s.same_family)) say("Some characters use a similar font.", "info");
    } catch (err) {
      if (isEngineError(err)) {
        say(describeEngineError(err));
        if (err.kind === "crashed" || err.kind === "aborted" || err.kind === "internal") await recover();
      } else say("That change couldn’t be made.");
    } finally {
      setBusy(null);
    }
  }, [editing, load, recover, say, texts]);

  const undoLast = useCallback(async () => {
    const d = docRef.current;
    const last = undo[undo.length - 1];
    if (!d || !last || busy) return;
    setEditing(null);
    setBusy("edit");
    try {
      await load(d.name, undoBytes(last, d.bytes).slice(), [last.page]);
      setUndo((u) => u.slice(0, -1));
      setFlash(null);
    } catch {
      say("Undo didn’t work. Please try again.");
      await recover();
    } finally {
      setBusy(null);
    }
  }, [busy, load, recover, say, undo]);

  // Ctrl/Cmd+Z outside a text field.
  useEffect(() => {
    if (!doc) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z" && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        void undoLast();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doc, undoLast]);

  const download = useCallback(async () => {
    const d = docRef.current;
    if (!d) return;
    setBusy("save");
    try {
      const { bytes } = await callEngine({ op: "save" });
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = pdfOutputName(d.name);
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (err) {
      say(isEngineError(err) ? describeEngineError(err) : "Saving didn’t work. Please try again.");
      if (isEngineError(err) && (err.kind === "crashed" || err.kind === "aborted")) await recover();
    } finally {
      setBusy(null);
    }
  }, [recover, say]);

  const close = useCallback(() => {
    if (undo.length && !window.confirm("Close this PDF? Your edits will be lost.")) return;
    void docRef.current?.pdf.loadingTask.destroy();
    setDoc(null);
    setTexts([]);
    setUndo([]);
    setEditing(null);
    setFlash(null);
  }, [undo.length]);

  return (
    <div data-testid="editor" data-state={doc ? "open" : busy === "open" ? "opening" : "empty"}>
      <DropOverlay active={dragging} mode={doc ? "replace" : "add"} />
      <Heading />
      {doc ? (
        <div>
          <div className="ed-bar sticky top-(--ip-header-h) z-20 mx-auto mb-5 flex max-w-[880px] items-center gap-2 rounded-[16px] border-[1.5px] border-sand bg-surface-raised py-2 pr-2 pl-4 shadow-card">
            <h2 className="min-w-0 flex-1 truncate font-ui text-sm font-semibold text-ink" title={doc.name}>
              {doc.name}
            </h2>
            <IconButton label="Undo" variant="soft" icon={<UndoBold size={16} />} disabled={!undo.length || !!busy} onClick={() => void undoLast()} />
            <IconButton label="Close" variant="soft" icon={<CloseBold size={16} />} onClick={close} />
            <Button variant="primary" size="sm" busy={busy === "save"} iconStart={<DownloadBold size={16} />} onClick={() => void download()} aria-label="Download PDF">
              <span className="max-[359px]:sr-only">Download</span>
            </Button>
          </div>
          <NoticeLine notice={notice} />
          <div ref={stage} className="flex flex-col items-center gap-6 pb-10" data-busy={busy ?? undefined}>
            {doc.geo.map((geo, i) => (
              <PageView
                key={i}
                doc={doc}
                index={i}
                geo={geo}
                version={versions[i] ?? 0}
                text={texts[i]}
                fresh={!!fresh[i]}
                editing={editing?.page === i ? editing : null}
                flash={flash?.page === i ? flash : null}
                disabled={!!busy}
                onVisible={ensureText}
                onEdit={(line, text) => setEditing({ page: i, line, text })}
                onChange={(text) => setEditing((e) => (e ? { ...e, text } : e))}
                onCommit={() => void commit()}
                onCancel={() => setEditing(null)}
              />
            ))}
          </div>
        </div>
      ) : (
        <div ref={stage}>
          <Landing busy={busy === "open"} onFile={(f) => void openFile(f)} />
          <div className="mx-auto mt-3 max-w-[440px]">
            <NoticeLine notice={notice} />
          </div>
        </div>
      )}
    </div>
  );
}

function Heading() {
  return (
    <div className="mp-intro flex items-center justify-center gap-3 pt-(--space-6) pb-(--space-5) sm:pt-(--space-7)">
      <h1 className="text-page-title text-ink-black">Edit PDF</h1>
      <Badge tone="beta">Beta</Badge>
    </div>
  );
}

function Landing({ busy, onFile }: { busy: boolean; onFile: (f: File) => void }) {
  return (
    <div className="mp-empty grid min-h-[280px] place-items-center px-[15px] py-8 sm:min-h-[360px]" data-testid="drop-card">
      <Floaties set="empty" />
      <div className="mp-empty__in mp-dropcard relative w-full max-w-[440px] rounded-[16px_16px_28px_16px] border-[1.5px] border-sand bg-surface-raised px-6 pt-9 pb-8 shadow-card">
        <Sticker kind="blossom" size={34} className="mp-sticker--tilt-r absolute -top-4 -right-3" />
        <div className="flex flex-col items-center gap-3">
          <FilePicker accept=".pdf,application/pdf" multiple={false} label={busy ? "Opening…" : "Open PDF"} disabled={busy} icon={<FileUpBold size={20} />} onFiles={(files) => onFile(files[0])} inputTestId="editor-input" />
          <p className="text-sm text-muted">or drop it here</p>
          <PrivacyNote runtime="client" context="intro" />
        </div>
      </div>
    </div>
  );
}

function NoticeLine({ notice }: { notice: { text: string; tone: "error" | "info"; key: number } | null }) {
  return (
    <div role="status" aria-live="polite" className="mx-auto mb-3 flex min-h-6 max-w-[880px] justify-center">
      {notice && (
        <p key={notice.key} className={cx("ed-notice rounded-full px-3 py-1 text-sm", notice.tone === "error" ? "bg-danger-soft text-danger-strong" : "bg-brand-tint text-ink")} data-testid="editor-notice">
          {notice.text}
        </p>
      )}
    </div>
  );
}

type PageViewProps = {
  doc: Doc;
  index: number;
  geo: PageGeo;
  version: number;
  text: PageText | undefined;
  /** False while `text` is from before the last reload: shown, but not editable. */
  fresh: boolean;
  editing: Editing | null;
  flash: Flash | null;
  disabled: boolean;
  onVisible: (page: number) => void;
  onEdit: (line: number, text: string) => void;
  onChange: (text: string) => void;
  onCommit: () => void;
  onCancel: () => void;
};

function PageView({ doc, index, geo, version, text, fresh, editing, flash, disabled, onVisible, onEdit, onChange, onCommit, onCancel }: PageViewProps) {
  const box = useRef<HTMLDivElement>(null);
  const holder = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [drawn, setDrawn] = useState(false);
  const scale = doc.scales[index];
  const { width, height } = displaySize(geo.view, geo.rotate, scale);
  const drawnFor = useRef<string | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => entry.isIntersecting && setVisible(true), { rootMargin: "600px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (visible && !fresh) onVisible(index);
  }, [visible, fresh, index, onVisible, doc]);

  // Draw when visible, and again when this page's version changes (from the current bytes).
  useEffect(() => {
    if (!visible) return;
    const key = `${version}@${scale.toFixed(4)}`;
    if (drawnFor.current === key) return;
    drawnFor.current = key;
    let cancelled = false;
    let task: { cancel: () => void } | null = null;
    void (async () => {
      let page: Awaited<ReturnType<PDFDocumentProxy["getPage"]>> | null = null;
      try {
        // Inside the try: a close or document swap during the draw rejects here.
        page = await doc.pdf.getPage(index + 1);
        const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
        const viewport = page.getViewport({ scale: scale * dpr });
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(viewport.width));
        canvas.height = Math.max(1, Math.round(viewport.height));
        canvas.className = "absolute inset-0 size-full";
        const render = page.render({ canvas, viewport });
        task = render;
        await render.promise;
        if (cancelled || !holder.current) return;
        holder.current.replaceChildren(canvas); // swap only when ready: no blank flash
        setDrawn(true);
      } catch {
        if (!cancelled) drawnFor.current = null;
      } finally {
        page?.cleanup();
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [visible, version, doc.pdf, index, scale]);

  return (
    <section aria-label={`Page ${index + 1}`} className="w-full">
      <div ref={box} className={cx("ed-page relative mx-auto overflow-hidden rounded-[6px] bg-white shadow-card", drawn && "ed-page--drawn")} data-testid={`page-${index + 1}`} {...sizeStyle(width, height)}>
        <div ref={holder} aria-hidden="true" />
        {text && <Lines page={index} geo={geo} text={text} scale={scale} editing={editing} disabled={disabled || !fresh} onEdit={onEdit} onChange={onChange} onCommit={onCommit} onCancel={onCancel} />}
        {flash &&
          flash.rects.map((r, k) => {
            if (!text) return null;
            const s = rectToScreen(r, geo.view, geo.rotate, scale);
            return <span key={`${flash.key}-${k}`} aria-hidden="true" className="ed-flash pointer-events-none absolute rounded-[3px]" {...posStyle(s.left - 2, s.top - 2, s.width + 4, s.height + 4)} />;
          })}
      </div>
    </section>
  );
}

/** Inline styles exist only client-side (after a file is opened), so server HTML stays style-free (CSP style-src 'self'). */
function sizeStyle(width: number, height: number) {
  return { style: { width, height } };
}
function posStyle(left: number, top: number, width: number, height: number) {
  return { style: { left, top, width, height } };
}

/** A generic family close to the line's own font, so the field looks like the page. */
function fontFamilyOf(text: PageText, line: PageText["lines"][number]): string {
  const font = text.fonts[line.runs[0]?.font ?? -1];
  if (font?.monospace) return "ui-monospace, Menlo, Consolas, monospace";
  if (font?.serif) return "'Times New Roman', Times, serif";
  return "Arial, Helvetica, sans-serif";
}

let measureCtx: CanvasRenderingContext2D | null = null;

/** The edit field: the line's box and size, widened to fit what is typed. */
function inputStyle(text: PageText, geo: PageGeo, line: PageText["lines"][number], value: string, scale: number, box: { left: number; top: number; width: number; height: number; transform?: string }) {
  const fontSize = line.size * scale;
  const fontFamily = fontFamilyOf(text, line);
  const font = text.fonts[line.runs[0]?.font ?? -1];
  measureCtx ??= document.createElement("canvas").getContext("2d");
  let width = box.width;
  // Only an unturned field grows (to the right): a turned one would drift off its line, since
  // it turns around its centre. A longer value scrolls inside the field.
  if (measureCtx && !box.transform) {
    measureCtx.font = `${font?.italic ? "italic " : ""}${font?.bold ? "700 " : ""}${fontSize}px ${fontFamily}`;
    width = Math.max(width, measureCtx.measureText(value).width + 12, 120);
    // Stay on the page (it clips).
    width = Math.max(box.width, Math.min(width, displaySize(geo.view, geo.rotate, scale).width - box.left - 2));
  }
  return {
    ...box,
    width,
    fontSize,
    fontFamily,
    fontWeight: font?.bold ? 700 : 400,
    fontStyle: font?.italic ? "italic" : "normal",
    lineHeight: 1,
  };
}

/**
 * The page's editable lines. Pointer: click a line. Keyboard: the page's line list is one tab
 * stop (a listbox); arrows pick a line, Enter edits it, so the tab order stays short. The line
 * boxes are as big as the text they cover: as pointer targets they fall under WCAG 2.5.8's
 * inline and essential exceptions, and the listbox is the keyboard equivalent.
 */
function Lines({
  page,
  geo,
  text,
  scale,
  editing,
  disabled,
  onEdit,
  onChange,
  onCommit,
  onCancel,
}: {
  page: number;
  geo: PageGeo;
  text: PageText;
  scale: number;
  editing: Editing | null;
  disabled: boolean;
  onEdit: (line: number, text: string) => void;
  onChange: (text: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const cancelled = useRef(false);
  const list = useRef<HTMLDivElement>(null);
  const refocus = useRef(false);
  const [active, setActive] = useState(-1);
  const editable = text.lines.map((l, i) => (l.editable && l.text.trim() ? i : -1)).filter((i) => i >= 0);
  // Line ids change with every edit: keep the active index only if it is still an editable line.
  const [seen, setSeen] = useState(text);
  if (seen !== text) {
    setSeen(text);
    if (active >= 0 && !editable.includes(active)) setActive(editable[0] ?? -1);
  }

  useEffect(() => {
    if (!editing && refocus.current) {
      refocus.current = false;
      list.current?.focus();
    }
  }, [editing]);

  const geometryOf = (i: number) => {
    const line = text.lines[i];
    const b = lineBox(line.bbox, line.angle, geo.view, geo.rotate, scale);
    const pad = Math.max(2, b.thickness * 0.15);
    return {
      left: b.cx - b.length / 2 - pad,
      top: b.cy - b.thickness / 2 - pad,
      width: b.length + pad * 2,
      height: b.thickness + pad * 2,
      transform: b.angle ? `rotate(${b.angle}deg)` : undefined,
    };
  };

  const onListKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled || !editable.length) return;
    const pos = editable.indexOf(active);
    if (e.key === "ArrowDown" || e.key === "ArrowRight") setActive(editable[Math.min(editable.length - 1, pos + 1)]);
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") setActive(editable[Math.max(0, pos - 1)]);
    else if (e.key === "Home") setActive(editable[0]);
    else if (e.key === "End") setActive(editable[editable.length - 1]);
    else if ((e.key === "Enter" || e.key === "F2") && active >= 0) {
      refocus.current = true;
      onEdit(active, text.lines[active].text);
    } else return;
    e.preventDefault();
  };

  const editLine = editing ? text.lines[editing.line] : undefined;
  const onInputKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelled.current = true;
      e.currentTarget.blur();
    }
  };

  return (
    <div className="absolute inset-0">
      <div
        ref={list}
        role="listbox"
        tabIndex={0}
        aria-label={`Text on page ${page + 1}`}
        aria-activedescendant={active >= 0 ? `ed-p${page}-l${active}` : undefined}
        aria-disabled={disabled || undefined}
        className="ed-lines absolute inset-0 rounded-[6px]"
        onKeyDown={onListKey}
        onFocus={() => active < 0 && editable.length && setActive(editable[0])}
      >
        {editable.map((i) => {
          const line = text.lines[i];
          if (editing?.line === i) return null;
          return (
            <div
              key={i}
              id={`ed-p${page}-l${i}`}
              role="option"
              aria-selected={active === i}
              data-testid="line"
              data-text={line.text}
              className={cx("ed-line absolute cursor-text rounded-[3px]", active === i && "ed-line--active", disabled && "ed-line--busy")}
              style={geometryOf(i)}
              onClick={() => {
                if (disabled) return;
                setActive(i);
                onEdit(i, line.text);
              }}
            >
              <span className="sr-only">{line.text}</span>
            </div>
          );
        })}
      </div>
      {editing && editLine && (
        <input
          key={`${editing.line}`}
          autoFocus
          aria-label={`Edit line: ${editLine.text}`}
          data-testid="line-input"
          className="ed-input absolute rounded-[4px] border-0 bg-white px-[2px] text-ink-black outline-2 outline-brand"
          style={inputStyle(text, geo, editLine, editing.text, scale, geometryOf(editing.line))}
          value={editing.text}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onInputKey}
          onBlur={() => {
            if (cancelled.current) {
              cancelled.current = false;
              onCancel();
            } else onCommit();
          }}
        />
      )}
    </div>
  );
}
