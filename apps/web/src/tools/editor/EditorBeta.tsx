"use client";
/**
 * Edit PDF (beta): change existing text, line by line (F16, a small subset of phase E1/E2).
 *
 * pdf.js draws the pages; berry-engine (WebAssembly in a Web Worker, loaded only once a file is
 * opened) reads each page's lines and rewrites them. After an edit the engine saves
 * incrementally (original bytes + one revision) and only the edited page is redrawn from those
 * bytes. Nothing leaves the device.
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
import { callEngine, describeEngineError, type EngineError } from "@/lib/editor/engine-client";
import { displaySize, lineBox, rectToScreen } from "@/lib/editor/geometry";
import { pdfOutputName } from "@/lib/pdf/naming";
import { openPdf, readPageSizes, type PageSize } from "@/lib/pdf/pdfjs";
import { CloseBold, DownloadBold, FileUpBold, UndoBold } from "./icons";

const MAX_BYTES = 100 * 1024 * 1024;
const MAX_PAGE_WIDTH = 880;
const UNDO_DEPTH = 20;
const MAX_DPR = 2;

type Doc = {
  name: string;
  bytes: Uint8Array;
  pdf: PDFDocumentProxy;
  sizes: PageSize[];
  /** CSS px per point, per page (fit width). */
  scales: number[];
};

type Editing = { page: number; line: number; text: string };
type Flash = { page: number; rects: Rect[]; key: number };

const copyBytes = (b: Uint8Array) => b.slice();

function isEngineError(e: unknown): e is EngineError {
  return !!e && typeof e === "object" && "kind" in e;
}

export function EditorBeta() {
  const [doc, setDoc] = useState<Doc | null>(null);
  const [texts, setTexts] = useState<(PageText | undefined)[]>([]);
  /** Bumped per page when its canvas must be redrawn from the current bytes. */
  const [versions, setVersions] = useState<number[]>([]);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [busy, setBusy] = useState<"open" | "edit" | "save" | null>(null);
  const [notice, setNotice] = useState<{ text: string; tone: "error" | "info"; key: number } | null>(null);
  const [undo, setUndo] = useState<{ bytes: Uint8Array; page: number }[]>([]);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [dragging, setDragging] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const docRef = useRef<Doc | null>(null);
  docRef.current = doc;
  const loadingText = useRef(new Set<number>());

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

  /** Loads a page's lines from the engine (once per document state). */
  const ensureText = useCallback(async (page: number) => {
    if (loadingText.current.has(page)) return;
    loadingText.current.add(page);
    try {
      const { page: text } = await callEngine({ op: "text", page });
      setTexts((prev) => {
        const next = [...prev];
        next[page] = text;
        return next;
      });
    } catch {
      loadingText.current.delete(page);
    }
  }, []);

  /** Points the engine and pdf.js at `bytes`. Other pages' canvases are kept unless `redraw` names them. */
  const load = useCallback(async (name: string, bytes: Uint8Array, redraw: number[] | "all") => {
    await callEngine({ op: "open", bytes: copyBytes(bytes) });
    const opened = await openPdf(copyBytes(bytes));
    if (!opened.ok) throw (opened.reason === "corrupt" ? { kind: "parse", message: "pdf.js" } : { kind: "encrypted" }) satisfies EngineError;
    const pdf = opened.pdf.doc;
    const prev = docRef.current;
    let sizes = prev?.sizes;
    let scales = prev?.scales;
    if (redraw === "all" || !sizes || !scales) {
      sizes = await readPageSizes(pdf);
      const avail = Math.min(MAX_PAGE_WIDTH, (stage.current?.clientWidth ?? MAX_PAGE_WIDTH) - 2);
      scales = sizes.map((s) => avail / s.width);
    }
    loadingText.current.clear();
    setTexts([]);
    setVersions((v) => (redraw === "all" ? sizes.map(() => 0) : v.map((n, i) => (redraw.includes(i) ? n + 1 : n))));
    setDoc({ name, bytes, pdf, sizes, scales });
    if (prev && prev.pdf !== pdf) setTimeout(() => void prev.pdf.loadingTask.destroy(), 2000);
  }, []);

  const openFile = useCallback(
    async (file: File) => {
      if (undo.length && !window.confirm("Open another PDF? Your edits to this one will be lost.")) return;
      if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") return say("Choose a PDF file.");
      if (file.size > MAX_BYTES) return say("This beta opens PDFs up to 100 MB.");
      setBusy("open");
      setEditing(null);
      setUndo([]);
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        await load(file.name, bytes, "all");
        setNotice(null);
      } catch (e) {
        say(isEngineError(e) ? describeEngineError(e) : "This file couldn’t be opened.");
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

  /** After a crash the worker is fresh: give it the last good bytes again. */
  const recover = useCallback(async () => {
    const d = docRef.current;
    if (!d) return;
    try {
      await load(d.name, d.bytes, []);
    } catch {
      say("The editor couldn’t restart. Download what you have, then reload the page.");
    }
  }, [load, say]);

  const commit = useCallback(async () => {
    const d = docRef.current;
    const e = editing;
    setEditing(null);
    if (!d || !e) return;
    const line = texts[e.page]?.lines[e.line];
    if (!line || line.text === e.text) return;
    setBusy("edit");
    try {
      const { result, bytes } = await callEngine({ op: "replace", page: e.page, line: e.line, text: e.text });
      setUndo((u) => [...u.slice(-(UNDO_DEPTH - 1)), { bytes: d.bytes, page: e.page }]);
      await load(d.name, bytes, [e.page]);
      // Fresh line ids for the edited page come with the result.
      loadingText.current.add(e.page);
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
        if (err.kind === "crashed") await recover();
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
      await load(d.name, last.bytes, [last.page]);
      setUndo((u) => u.slice(0, -1));
      setFlash(null);
    } catch {
      say("Undo didn’t work. Please try again.");
    } finally {
      setBusy(null);
    }
  }, [busy, load, say, undo]);

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
      if (isEngineError(err) && err.kind === "crashed") await recover();
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
            {doc.sizes.map((size, i) => (
              <PageView
                key={i}
                doc={doc}
                index={i}
                size={size}
                version={versions[i] ?? 0}
                text={texts[i]}
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
  size: PageSize;
  version: number;
  text: PageText | undefined;
  editing: Editing | null;
  flash: Flash | null;
  disabled: boolean;
  onVisible: (page: number) => void;
  onEdit: (line: number, text: string) => void;
  onChange: (text: string) => void;
  onCommit: () => void;
  onCancel: () => void;
};

function PageView({ doc, index, size, version, text, editing, flash, disabled, onVisible, onEdit, onChange, onCommit, onCancel }: PageViewProps) {
  const box = useRef<HTMLDivElement>(null);
  const holder = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [drawn, setDrawn] = useState(false);
  const scale = doc.scales[index];
  const width = size.width * scale;
  const height = size.height * scale;
  const pdfForVersion = useRef<{ version: number; pdf: PDFDocumentProxy } | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => entry.isIntersecting && setVisible(true), { rootMargin: "600px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (visible) onVisible(index);
  }, [visible, text, index, onVisible]);

  // Draw when visible, and again when this page's version changes (from the current bytes).
  useEffect(() => {
    if (!visible) return;
    if (pdfForVersion.current?.version === version) return;
    pdfForVersion.current = { version, pdf: doc.pdf };
    let cancelled = false;
    let task: { cancel: () => void } | null = null;
    void (async () => {
      const page = await doc.pdf.getPage(index + 1);
      try {
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
        if (!cancelled) pdfForVersion.current = null;
      } finally {
        page.cleanup();
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
        {text && <Lines page={index} text={text} scale={scale} editing={editing} disabled={disabled} onEdit={onEdit} onChange={onChange} onCommit={onCommit} onCancel={onCancel} />}
        {flash &&
          flash.rects.map((r, k) => {
            if (!text) return null;
            const s = rectToScreen(r, text.page_box, text.rotation, scale);
            return <span key={`${flash.key}-${k}`} aria-hidden="true" className="ed-flash pointer-events-none absolute rounded-[3px]" {...posStyle(s.left - 2, s.top - 2, s.width + 4, s.height + 4)} />;
          })}
      </div>
    </section>
  );
}

/** Inline styles exist only client-side (after a file is opened), so server HTML stays style-free (CSP style-src 'self'). */
function sizeStyle(width: number, height: number) {
  return { style: { width, height, maxWidth: "100%" } };
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
function inputStyle(text: PageText, line: PageText["lines"][number], value: string, scale: number, box: { left: number; top: number; width: number; height: number; transform?: string }) {
  const fontSize = line.size * scale;
  const fontFamily = fontFamilyOf(text, line);
  const font = text.fonts[line.runs[0]?.font ?? -1];
  measureCtx ??= document.createElement("canvas").getContext("2d");
  let width = box.width;
  if (measureCtx) {
    measureCtx.font = `${font?.italic ? "italic " : ""}${font?.bold ? "700 " : ""}${fontSize}px ${fontFamily}`;
    width = Math.max(width, measureCtx.measureText(value).width + 12);
  }
  // Stay on the page (it clips); a longer value scrolls inside the field.
  if (!box.transform) width = Math.min(width, displaySize(text.page_box, text.rotation, scale).width - box.left - 2);
  return {
    ...box,
    width,
    minWidth: 120,
    fontSize,
    fontFamily,
    fontWeight: font?.bold ? 700 : 400,
    fontStyle: font?.italic ? "italic" : "normal",
    lineHeight: 1,
  };
}

/**
 * The page's editable lines. Pointer: click a line. Keyboard: the page's line list is one tab
 * stop (a listbox); arrows pick a line, Enter edits it. One stop per page keeps tab order short
 * and avoids dozens of tiny, tightly stacked focus targets (WCAG 2.5.8).
 */
function Lines({
  page,
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

  useEffect(() => {
    if (!editing && refocus.current) {
      refocus.current = false;
      list.current?.focus();
    }
  }, [editing]);

  const geometryOf = (i: number) => {
    const line = text.lines[i];
    const b = lineBox(line.bbox, line.angle, text.page_box, text.rotation, scale);
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
          style={inputStyle(text, editLine, editing.text, scale, geometryOf(editing.line))}
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
