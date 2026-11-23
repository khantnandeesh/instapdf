"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { setHandoff, takeHandoff } from "@/lib/pdf/handoff";
import { openPdf, readPageSizes, type OpenedPdf } from "@/lib/pdf/pdfjs";
import { ThumbnailRenderer } from "@/lib/pdf/thumbnails";
import { disposeWorker } from "@/lib/pdf/worker-client";
import { acceptAttribute, fitsPageBudget, screenFiles } from "@/lib/pdf/validation";
import { continueTargets, type FlowTool } from "@/tools/registry";
import { Button } from "../ui/Button";
import { cx } from "../ui/cx";
import { PlusIcon } from "../ui/icons";
import { LiveRegion } from "../ui/LiveRegion";
import { SegmentedControl } from "../ui/SegmentedControl";
import { Slider } from "../ui/Slider";
import { ControlDock, DockStatus, ProcessError, ProcessingBar } from "./ControlDock";
import { copy } from "./copy";
import { DropCard } from "./DropCard";
import { DropOverlay } from "./DropOverlay";
import { FileGrid } from "./FileGrid";
import { FilePicker, type FilePickerHandle } from "./FilePicker";
import { LimitsNote, PrivacyNote } from "./notes";
import { NoticeStack, type FlowNotice } from "./NoticeStack";
import { OwnerPasswordDialog, OwnerPermissionNotice } from "./OwnerPassword";
import { PageGrid, type PageActionsRenderer } from "./PageGrid";
import { PagePreviewDialog } from "./PagePreviewDialog";
import { PasswordDialog } from "./PasswordDialog";
import { ReplaceFileDialog } from "./ReplaceFileDialog";
import { ResultCard } from "./ResultCard";
import { createVisibilityWatcher, ThumbContext } from "./Thumbnail";
import { ToolIntro } from "./ToolIntro";
import type { FlowContext, FlowState, LoadedFile, PageDecoration, ProcessFn, ReadyFile, ToolOutput } from "./types";
import { LeaveGuard } from "./LeaveGuard";

type Phase = "idle" | "processing" | "done" | "error";

/** Shown for at least this long so a fast run does not flash. */
const MIN_PROCESSING_MS = 300;
const THUMB_MIN = 80;
const THUMB_MAX = 400;
/** Same as --ip-thumb-size in tokens.css, so the server HTML needs no style attribute (strict CSP style-src). */
const THUMB_DEFAULT = 160;

let fileSeq = 0;

const isReady = (f: LoadedFile): f is ReadyFile => f.status === "ready" && !!f.pages;

export type ToolFlowProps = {
  tool: FlowTool;
  /** The tool's options panel. */
  renderOptions: (ctx: FlowContext) => ReactNode;
  /** Per-page state the tile shows (pending rotation, scope highlight). */
  decoratePage?: (file: LoadedFile, index: number) => PageDecoration;
  /** Per-page action buttons (before the shared "Enlarge page"). */
  renderPageActions?: PageActionsRenderer;
  /** Tile keyboard shortcuts; return true when handled. */
  onPageKey?: (file: LoadedFile, index: number, key: string) => boolean;
  /** Extra status text when ready (e.g. "No changes yet"). */
  readyNote?: string;
  /** Reason the primary is disabled in the ready state, if any. */
  canRun?: () => true | string;
  process: ProcessFn;
  /** Called on Start over so the tool clears its own option state. */
  onReset?: () => void;
};

export function ToolFlow({ tool, renderOptions, decoratePage, renderPageActions, onPageKey, readyNote, canRun, process, onReset }: ToolFlowProps) {
  const flow = tool.flow;
  const router = useRouter();
  const statusId = useId();

  // ---- core state --------------------------------------------------------
  const filesRef = useRef<LoadedFile[]>([]);
  const [files, setFilesState] = useState<LoadedFile[]>([]);
  const updateFiles = useCallback((fn: (prev: LoadedFile[]) => LoadedFile[]) => {
    filesRef.current = fn(filesRef.current);
    setFilesState(filesRef.current);
  }, []);
  const patchFile = useCallback((id: string, patch: Partial<LoadedFile>) => updateFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f))), [updateFiles]);

  const [phase, setPhase] = useState<Phase>("idle");
  const phaseRef = useRef<Phase>("idle");
  phaseRef.current = phase;
  const [output, setOutput] = useState<ToolOutput | null>(null);
  const [progress, setProgress] = useState(0);
  const [notices, setNotices] = useState<FlowNotice[]>([]);
  const [message, setMessage] = useState("");
  const announce = useCallback((m: string) => setMessage((prev) => (prev === m ? `${m} ` : m)), []);
  const [viewChoice, setViewChoice] = useState<"pages" | "files" | null>(null);
  const [thumbSize, setThumbSize] = useState(THUMB_DEFAULT);
  const [renderSize, setRenderSize] = useState(160);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<{ fileId: string; index: number } | null>(null);
  const [pw, setPw] = useState<{ error?: string; busy: boolean; attempt: number }>({ busy: false, attempt: 0 });
  const [pendingReplace, setPendingReplace] = useState<File[] | null>(null);
  const [ownerFor, setOwnerFor] = useState<string | null>(null);
  const [ownerError, setOwnerError] = useState<string | undefined>();

  // pdf.js documents (kept outside React state) and the thumbnail renderer.
  const docs = useRef(new Map<string, OpenedPdf>());
  const renderer = useMemo(() => (typeof window === "undefined" ? null : new ThumbnailRenderer()), []);
  const [watcher, setWatcher] = useState<ReturnType<typeof createVisibilityWatcher> | null>(null);
  // Set once listeners (drop, paste, hand-off) are live: tests wait for data-hydrated.
  useEffect(() => {
    const w = createVisibilityWatcher();
    setWatcher(w);
    return () => w.disconnect();
  }, []);

  const heading = useRef<HTMLHeadingElement>(null);
  const picker = useRef<FilePickerHandle>(null);
  const intakeTrigger = useRef<HTMLElement | null>(null);
  const progressBox = useRef<HTMLDivElement>(null);
  const retryButton = useRef<HTMLButtonElement>(null);
  const abort = useRef<AbortController | null>(null);
  const fallbackFocus = useCallback(() => {
    const t = intakeTrigger.current;
    if (t && t.isConnected) return t;
    return picker.current?.element ?? heading.current;
  }, []);

  // ---- derived -------------------------------------------------------------
  const readyFiles = files.filter(isReady);
  const lockedFiles = files.filter((f) => f.status === "locked");
  const state: FlowState =
    phase === "processing" ? "processing" : phase === "done" ? "done" : phase === "error" ? "error" : files.length === 0 ? "empty" : lockedFiles.length ? "password" : files.some((f) => f.status === "loading") ? "loading" : "ready";
  const totalPages = readyFiles.reduce((s, f) => s + f.pageCount, 0);
  const ownerBlocked = readyFiles.filter((f) => flow.requiredPermissions.some((p) => f.denied.includes(p)));
  const runCheck = canRun?.() ?? true;
  const canPrimary = (state === "ready" || state === "error") && readyFiles.length > 0 && ownerBlocked.length === 0 && runCheck === true;
  const view = files.length > 1 ? (viewChoice ?? flow.defaultView) : "pages";
  const optionsDisabled = !(state === "ready" || state === "error");
  const statusText =
    state === "empty"
      ? copy.statusEmpty
      : state === "loading"
        ? copy.statusLoading
        : state === "password"
          ? copy.statusPassword
          : ownerBlocked.length
            ? copy.statusOwner
            : typeof runCheck === "string"
              ? runCheck
              : copy.statusReady(totalPages, readyFiles.length);

  // ---- notices -------------------------------------------------------------
  const pushNotice = useCallback((n: Omit<FlowNotice, "id">) => setNotices((prev) => [...prev, { ...n, id: `n${++fileSeq}` }]), []);
  const dismissNotice = useCallback((id: string) => setNotices((prev) => prev.filter((n) => n.id !== id)), []);

  // ---- file lifecycle ------------------------------------------------------
  const releaseDoc = useCallback(
    (id: string) => {
      renderer?.unregister(id);
      const d = docs.current.get(id);
      docs.current.delete(id);
      void d?.task.destroy();
    },
    [renderer],
  );

  const removeFile = useCallback(
    (id: string) => {
      releaseDoc(id);
      updateFiles((prev) => prev.filter((f) => f.id !== id));
    },
    [releaseDoc, updateFiles],
  );

  /** Parses one file (optionally with a password). Problems are collected into `problems`. */
  const loadFile = useCallback(
    async (id: string, password: string | undefined, problems: string[]): Promise<"ok" | "locked" | "wrong" | "gone" | "rejected"> => {
      const entry = filesRef.current.find((f) => f.id === id);
      if (!entry) return "gone";
      let bytes: Uint8Array;
      try {
        bytes = new Uint8Array(await entry.source.arrayBuffer());
      } catch {
        bytes = new Uint8Array(0);
      }
      const result = await openPdf(bytes, password);
      if (!filesRef.current.some((f) => f.id === id)) {
        if (result.ok) void result.pdf.task.destroy();
        return "gone";
      }
      if (!result.ok) {
        if (result.reason === "corrupt") {
          problems.push(copy.errorCorrupt(entry.name));
          removeFile(id);
          return "rejected";
        }
        if (result.reason === "wrongPassword" && password !== undefined) return "wrong";
        patchFile(id, { status: "locked" });
        return "locked";
      }
      const { pdf } = result;
      const otherPages = filesRef.current.filter((f) => f.id !== id).reduce((s, f) => s + f.pageCount, 0);
      if (!fitsPageBudget(otherPages, pdf.pageCount, flow.maxTotalPages)) {
        void pdf.task.destroy();
        problems.push(copy.errorPages(entry.name, flow.maxTotalPages));
        removeFile(id);
        return "rejected";
      }
      // Reserve the pages now so files parsed after this one count them.
      patchFile(id, { pageCount: pdf.pageCount, password, wasEncrypted: pdf.wasEncrypted, denied: pdf.denied, status: "loading" });
      let pages;
      try {
        pages = await readPageSizes(pdf.doc);
      } catch {
        void pdf.task.destroy();
        problems.push(copy.errorCorrupt(entry.name));
        removeFile(id);
        return "rejected";
      }
      if (!filesRef.current.some((f) => f.id === id)) {
        void pdf.task.destroy();
        return "gone";
      }
      docs.current.set(id, pdf);
      renderer?.register(id, pdf.doc);
      patchFile(id, { status: "ready", pages });
      announce(copy.fileReady(entry.name, pdf.pageCount));
      return "ok";
    },
    [announce, flow.maxTotalPages, patchFile, removeFile, renderer],
  );

  const flushProblems = useCallback(
    (problems: string[]) => {
      if (!problems.length) return;
      pushNotice(problems.length === 1 ? { tone: "danger", title: problems[0] } : { tone: "danger", title: copy.problemsTitle(problems.length), items: problems });
    },
    [pushNotice],
  );

  // After a pick from the empty state, its picker unmounts. Once the workspace is
  // committed, move focus to the toolbar's picker (the same control), but only
  // if focus fell to <body>: newly loaded files never steal focus.
  const [focusToolbarTick, setFocusToolbarTick] = useState(0);
  useEffect(() => {
    if (!focusToolbarTick) return;
    const active = document.activeElement;
    if (active && active !== document.body && active.isConnected) return;
    const el = picker.current?.element;
    if (!el) return;
    intakeTrigger.current = el;
    el.focus();
  }, [focusToolbarTick]);

  const intake = useCallback(
    async (incoming: File[], trigger: HTMLElement | null, opts: { replace?: boolean } = {}) => {
      if (phaseRef.current === "processing" || phaseRef.current === "done") return;
      if (!incoming.length) return;
      if (!flow.multiFile && filesRef.current.length > 0 && !opts.replace) {
        setPendingReplace(incoming);
        return;
      }
      if (opts.replace) for (const f of filesRef.current) removeFile(f.id);
      intakeTrigger.current = trigger;
      if (phaseRef.current === "error") setPhase("idle");
      // Info notices last until the next intake; errors stay until dismissed.
      setNotices((prev) => prev.filter((n) => n.tone === "danger"));

      const screened = screenFiles(
        incoming,
        { accept: flow.accept, multiFile: flow.multiFile, maxFiles: flow.maxFiles, maxFileBytes: flow.maxFileBytes, maxTotalBytes: flow.maxTotalBytes },
        filesRef.current.length,
        filesRef.current.reduce((sum, f) => sum + f.size, 0),
      );
      const mb = (bytes: number) => Math.round(bytes / 1024 / 1024);
      const problems = screened.rejected.map((r) =>
        r.reason === "type" ? copy.errorType(r.name) : r.reason === "size" ? copy.errorSize(r.name, mb(flow.maxFileBytes)) : copy.errorTotal(r.name, mb(flow.maxTotalBytes)),
      );
      if (screened.overCount.length) pushNotice({ tone: "warning", title: copy.errorCount(flow.maxFiles), items: screened.overCount.map((n) => `Not loaded: ${n}`) });

      const entries: LoadedFile[] = screened.accepted.map((file) => ({
        id: `f${++fileSeq}`,
        name: file.name,
        size: file.size,
        source: file,
        status: "loading",
        pageCount: 0,
        pages: null,
        wasEncrypted: false,
        denied: [],
      }));
      if (!entries.length) {
        flushProblems(problems);
        return;
      }
      updateFiles((prev) => [...prev, ...entries]);
      if (trigger) setFocusToolbarTick((n) => n + 1);
      announce(copy.readingCount(entries.length));
      for (const e of entries) await loadFile(e.id, undefined, problems);
      flushProblems(problems);
    },
    [announce, flow, flushProblems, loadFile, pushNotice, removeFile, updateFiles],
  );

  // ---- password queue ------------------------------------------------------
  const currentLocked = lockedFiles[0];
  // Files resolved (unlocked or skipped) in the current run of prompts, for "Locked file 2 of 3".
  const [pwDone, setPwDone] = useState(0);
  useEffect(() => {
    if (lockedFiles.length === 0 && pwDone !== 0) setPwDone(0);
  }, [lockedFiles.length, pwDone]);
  // The file whose password is being checked. The dialog keeps showing it until
  // the check (and any "use for the other files" pass) ends, so the next file's
  // name never flashes up as a second prompt (AC-26).
  const [pwSubmitting, setPwSubmitting] = useState<{ id: string; name: string } | null>(null);
  const submitPassword = useCallback(
    async (password: string, applyAll: boolean) => {
      const target = filesRef.current.find((f) => f.status === "locked");
      if (!target) return;
      setPw((p) => ({ ...p, busy: true }));
      setPwSubmitting({ id: target.id, name: target.name });
      const problems: string[] = [];
      const r = await loadFile(target.id, password, problems);
      if (r === "wrong") {
        setPw((p) => ({ busy: false, error: copy.pwWrong, attempt: p.attempt + 1 }));
        setPwSubmitting(null);
        return;
      }
      let resolved = 1;
      if (applyAll) {
        for (const other of filesRef.current.filter((f) => f.status === "locked")) {
          const r2 = await loadFile(other.id, password, problems);
          if (r2 !== "locked" && r2 !== "wrong") resolved++; // a wrong password leaves it locked
        }
      }
      setPwDone((d) => d + resolved);
      setPw({ busy: false, attempt: 0 });
      setPwSubmitting(null);
      flushProblems(problems);
    },
    [flushProblems, loadFile],
  );
  const skipLocked = useCallback(() => {
    const target = filesRef.current.find((f) => f.status === "locked");
    if (target) removeFile(target.id);
    setPwDone((d) => d + 1);
    setPw({ busy: false, attempt: 0 });
  }, [removeFile]);

  // ---- run -------------------------------------------------------------------
  const run = useCallback(async () => {
    const ready = filesRef.current.filter(isReady);
    if (!ready.length) return;
    const controller = new AbortController();
    abort.current = controller;
    setProgress(0);
    setPhase("processing");
    announce(tool.flow.progressLabel);
    const started = performance.now();
    try {
      const out = await process(ready, controller.signal, (v) => setProgress(v));
      const wait = MIN_PROCESSING_MS - (performance.now() - started);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      if (controller.signal.aborted) return;
      setProgress(1);
      setOutput(out);
      setPhase("done");
      announce(copy.resultTitle(out.type === "application/zip"));
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error(`[${tool.slug}] processing failed:`, error instanceof Error ? error.message : "unknown error");
      setPhase("error");
    }
  }, [announce, process, tool.flow.progressLabel, tool.slug]);

  // Move focus once the processing bar or the error panel has been committed
  // (a requestAnimationFrame can run before React commits under load).
  useEffect(() => {
    if (phase === "processing") progressBox.current?.focus();
    else if (phase === "error") retryButton.current?.focus();
  }, [phase]);
  // Start over focuses the (re-mounted) picker after the empty state is committed.
  const [focusPickerTick, setFocusPickerTick] = useState(0);
  useEffect(() => {
    if (focusPickerTick) picker.current?.focus();
  }, [focusPickerTick]);

  const startOver = useCallback(() => {
    abort.current?.abort();
    for (const f of filesRef.current) releaseDoc(f.id);
    updateFiles(() => []);
    setOutput(null);
    setPhase("idle");
    phaseRef.current = "idle";
    setNotices([]);
    setViewChoice(null);
    setPw({ busy: false, attempt: 0 });
    setPwSubmitting(null);
    onReset?.();
    announce("Cleared. Add a PDF to start.");
    setFocusPickerTick((n) => n + 1);
  }, [announce, onReset, releaseDoc, updateFiles]);

  const backToOptions = useCallback(() => {
    setOutput(null);
    setPhase("idle");
  }, []);

  const continueWith = useCallback(
    (target: FlowTool) => {
      if (!output) return;
      const file = new File([output.blob], output.name, { type: output.type });
      if (target.slug === tool.slug) {
        startOver();
        void intake([file], null);
      } else {
        setHandoff(target.slug, [file]);
        router.push(`/${target.slug}`);
      }
    },
    [intake, output, router, startOver, tool.slug],
  );

  // Hand-off from another tool's result screen.
  useEffect(() => {
    const handed = takeHandoff(tool.slug);
    if (handed) void intake(handed, null);
  }, [intake, tool.slug]);

  // On unmount: stop any running job, shut the processing worker down and
  // release the pdf.js documents.
  useEffect(() => {
    const map = docs.current;
    return () => {
      abort.current?.abort();
      disposeWorker();
      for (const d of map.values()) void d.task.destroy();
      map.clear();
    };
  }, []);

  // ---- global drag & drop and paste -----------------------------------------
  const acceptsDrop = state !== "processing" && state !== "done";
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files");
    const reset = () => {
      depth = 0;
      setDragging(false);
    };
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth++;
      if (acceptsDrop) setDragging(true);
    };
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault(); // also stops the browser from opening a dropped PDF
      if (e.dataTransfer) e.dataTransfer.dropEffect = acceptsDrop ? "copy" : "none";
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!e.dataTransfer || !Array.from(e.dataTransfer.types).includes("Files")) return;
      e.preventDefault();
      reset();
      if (acceptsDrop) void intake(Array.from(e.dataTransfer.files), null);
    };
    // On window so a paste aimed at the document or window itself is handled too (F1 eval G-1).
    // The target is then not an element, so the editable-field guard only applies to elements.
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target instanceof Element ? e.target : null;
      if (t && (t.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']") || (t as HTMLElement).isContentEditable)) return;
      const pasted = Array.from(e.clipboardData?.files ?? []);
      if (!pasted.length || !acceptsDrop) return; // plain text: do nothing, say nothing
      e.preventDefault();
      void intake(pasted, null);
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    window.addEventListener("dragend", reset);
    window.addEventListener("blur", reset);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("dragend", reset);
      window.removeEventListener("blur", reset);
      window.removeEventListener("paste", onPaste);
    };
  }, [acceptsDrop, intake]);

  const guardLeave = files.length > 0 && state !== "done" && state !== "empty";

  // ---- thumbnail size (kept for the session; read after mount, no SSR mismatch) ---
  useEffect(() => {
    try {
      const saved = Number(sessionStorage.getItem("ip-thumb-size"));
      if (saved >= THUMB_MIN && saved <= THUMB_MAX) {
        setThumbSize(saved);
        setRenderSize(saved);
      }
    } catch {}
  }, []);
  useEffect(() => {
    const t = setTimeout(() => {
      setRenderSize(thumbSize);
      try {
        sessionStorage.setItem("ip-thumb-size", String(thumbSize));
      } catch {}
    }, 150);
    return () => clearTimeout(t);
  }, [thumbSize]);

  // ---- render ----------------------------------------------------------------
  const ctx: FlowContext = { files, readyFiles, state, disabled: optionsDisabled, announce };
  const decorate = decoratePage ?? (() => ({ pendingDelta: 0, inScope: false }));
  const previewFile = preview ? readyFiles.find((f) => f.id === preview.fileId) : undefined;
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  const accept = acceptAttribute(flow.accept);
  const ownerFile = ownerFor ? readyFiles.find((f) => f.id === ownerFor) : undefined;

  const primary = (
    <Button variant="primary" size="lg" className="w-full" disabled={!canPrimary} aria-describedby={statusId} onClick={run} data-testid="primary-action">
      {flow.actionLabel}
    </Button>
  );

  return (
    <div data-state={state} data-hydrated={watcher ? "" : undefined} data-testid="tool-flow" style={thumbSize === THUMB_DEFAULT ? undefined : { ["--ip-thumb-size" as string]: `${thumbSize}px` }}>
      <DropOverlay active={dragging && acceptsDrop} mode={flow.multiFile || files.length === 0 ? "add" : "replace"} />
      <LiveRegion message={message} />
      <ToolIntro ref={heading} title={flow.title} summary={tool.summary} />

      {state === "done" && output ? (
        <ResultCard
          output={output}
          tool={tool}
          continueTargets={continueTargets(output.type)}
          onContinue={continueWith}
          onStartOver={startOver}
          onBack={backToOptions}
          announce={announce}
        />
      ) : (
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_var(--ip-dock-w)] lg:items-start lg:gap-6">
          <section aria-label="Your files" className={cx("min-w-0", state !== "empty" && "rounded-xl bg-surface")}>
            {state === "empty" ? (
              <DropCard>
                <FilePicker
                  ref={picker}
                  accept={accept}
                  multiple={flow.multiFile}
                  label={copy.pickerButton(flow.multiFile)}
                  onFiles={(f, t) => void intake(f, t)}
                  inputTestId="file-input"
                />
                <p className="hidden text-sm text-fg-muted [@media(pointer:fine)]:block">{copy.pickerHint(isMac)}</p>
                <LimitsNote text={copy.limits(flow)} />
                <PrivacyNote runtime={tool.runtime} context="intro" />
              </DropCard>
            ) : (
              <>
                <div className="sticky top-(--ip-header-h) z-10 flex h-[52px] items-center gap-3 rounded-t-xl border-b border-border bg-surface px-3 sm:px-6">
                  {files.length > 1 && (
                    <SegmentedControl
                      label="View"
                      value={view}
                      onChange={setViewChoice}
                      options={[
                        { value: "pages", label: "Pages" },
                        { value: "files", label: "Files" },
                      ]}
                    />
                  )}
                  {view === "pages" && (
                    <Slider
                      className="max-sm:hidden"
                      label="Thumbnail size"
                      min={THUMB_MIN}
                      max={THUMB_MAX}
                      step={8}
                      value={thumbSize}
                      onChange={setThumbSize}
                      valueText={(v) => `Thumbnail size ${v} pixels`}
                    />
                  )}
                  <span className="ms-auto">
                    <FilePicker
                      ref={picker}
                      accept={accept}
                      multiple={flow.multiFile}
                      label={flow.multiFile ? "Add files" : "Replace file"}
                      variant="secondary"
                      size="sm"
                      icon={<PlusIcon size={18} />}
                      disabled={state === "processing"}
                      onFiles={(f, t) => void intake(f, t, { replace: !flow.multiFile })}
                      inputTestId="file-input"
                    />
                  </span>
                </div>
                <div className="flex flex-col gap-4 p-3 sm:p-6" style={{ minHeight: "calc(var(--ip-thumb-size) + 36px)" }} inert={state === "processing" ? true : undefined}>
                  {ownerBlocked.map((f) => (
                    <OwnerPermissionNotice
                      key={f.id}
                      fileName={f.name}
                      denied={flow.requiredPermissions.filter((p) => f.denied.includes(p))}
                      onEnterPassword={() => setOwnerFor(f.id)}
                    />
                  ))}
                  <ThumbContext.Provider value={{ renderer, watch: watcher?.watch ?? null, renderSize: renderBucket(renderSize) }}>
                    {view === "pages" ? (
                      <PageGrid
                        files={files}
                        decorate={decorate}
                        renderActions={renderPageActions}
                        onPageKey={onPageKey}
                        onRemove={(f) => removeFile(f.id)}
                        onOpen={(f, i) => setPreview({ fileId: f.id, index: i })}
                        dimmed={state === "processing"}
                      />
                    ) : (
                      <FileGrid files={files} onRemove={(f) => removeFile(f.id)} />
                    )}
                    <PagePreviewDialog
                      target={previewFile && preview ? { file: previewFile, index: preview.index } : null}
                      renderer={renderer}
                      rotationFor={(f, i) => decorate(f, i).pendingDelta}
                      onNavigate={(i) => setPreview((p) => (p ? { ...p, index: i } : p))}
                      onClose={() => setPreview(null)}
                      fallbackFocus={() => heading.current}
                    />
                  </ThumbContext.Provider>
                </div>
              </>
            )}
          </section>

          <ControlDock
            label={`${tool.name} options`}
            optionsDisabled={optionsDisabled}
            options={renderOptions(ctx)}
            status={<DockStatus id={statusId} text={statusText} extra={state === "ready" && runCheck === true ? readyNote : undefined} />}
            footer={
              state === "processing" ? (
                <ProcessingBar ref={progressBox} label={flow.progressLabel} value={progress} />
              ) : state === "error" ? (
                <ProcessError ref={retryButton} message={copy.errorProcess(flow.progressLabel)} onRetry={run} onStartOver={startOver} />
              ) : (
                primary
              )
            }
          />
        </div>
      )}

      <NoticeStack notices={notices} onDismiss={dismissNotice} />

      <PasswordDialog
        open={(!!currentLocked || !!pwSubmitting) && state !== "done"}
        fileId={pwSubmitting?.id ?? currentLocked?.id ?? ""}
        fileName={pwSubmitting?.name ?? currentLocked?.name ?? ""}
        queuePosition={pwDone + lockedFiles.length > 1 ? { index: pwDone + 1, total: pwDone + lockedFiles.length } : undefined}
        showApplyToAll={lockedFiles.length > 1 || files.some((f) => f.status === "loading")}
        error={pw.error}
        busy={pw.busy}
        attempt={pw.attempt}
        onSubmit={submitPassword}
        onSkip={skipLocked}
        fallbackFocus={fallbackFocus}
      />
      <OwnerPasswordDialog
        open={!!ownerFile}
        fileName={ownerFile?.name ?? ""}
        denied={ownerFile ? flow.requiredPermissions.filter((p) => ownerFile.denied.includes(p)) : []}
        error={ownerError}
        // Owner-password checking arrives with the first tool that needs it (F16/F17, spec D-1/D-2).
        onSubmit={() => setOwnerError("Owner passwords can't be checked in this tool yet.")}
        onClose={() => {
          setOwnerFor(null);
          setOwnerError(undefined);
        }}
      />
      <LeaveGuard active={guardLeave} />
      <ReplaceFileDialog
        open={!!pendingReplace}
        fileName={files[0]?.name ?? ""}
        onCancel={() => setPendingReplace(null)}
        onConfirm={() => {
          const next = pendingReplace;
          setPendingReplace(null);
          if (next) void intake(next, null, { replace: true });
        }}
      />
    </div>
  );
}

/** Re-render thumbnails only in steps, scaling with CSS in between. */
function renderBucket(size: number): number {
  return size <= 160 ? 160 : size <= 240 ? 240 : size <= 320 ? 320 : 400;
}
