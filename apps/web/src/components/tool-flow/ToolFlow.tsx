"use client";
import "@/components/berry/berry-loader.css";
import "../ui/dialog.css";
import "./tool-flow.css";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { cloneElement, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { setHandoff, takeHandoff } from "@/lib/pdf/handoff";
import { openPdf, readPageSizes, type OpenedPdf } from "@/lib/pdf/pdfjs";
import { ThumbnailRenderer } from "@/lib/pdf/thumbnails";
import { USER_ERROR } from "@/lib/pdf/user-error";
import { disposeWorker } from "@/lib/pdf/worker-client";
import { acceptAttribute, fitsPageBudget, screenFiles } from "@/lib/pdf/validation";
import { exceedsPixelCap, imageFormatOfName, imagePageSize, probeImage, sniffFormat } from "@/lib/pdf/images";
import { continueTargets, type FlowTool } from "@/tools/registry";
import { Button } from "../ui/Button";
import { BerryLoader } from "../berry/Berry";
import { isShown, moveFocus, trackInputModality, type InputModality } from "../ui/focus";
import { PlusIcon, UploadIcon } from "../ui/icons";
import { LiveRegion } from "../ui/LiveRegion";
import { SegmentedControl } from "../ui/SegmentedControl";
import { Slider } from "../ui/Slider";
import { ControlDock, DockStatus, ProcessError, ProcessingBar } from "./ControlDock";
import { copy } from "./copy";
import { DropCard } from "./DropCard";
import { DropOverlay } from "./DropOverlay";
import { FilePicker, type FilePickerHandle } from "./FilePicker";
import { LimitsNote, PrivacyNote } from "./notes";
import { NoticeStack, type FlowNotice } from "./NoticeStack";
import { OwnerPermissionNotice } from "./OwnerPermissionNotice";
import type { PageActionsRenderer } from "./PageGrid";
import type { PreviewTarget } from "./PagePreviewDialog";
import { createVisibilityWatcher, ThumbContext } from "./Thumbnail";
import { ToolIntro } from "./ToolIntro";
import type { FlowApi, FlowContext, FlowState, LoadedFile, PageDecoration, PreviewItem, ProcessFn, ReadyFile, ToolOutput, WorkspaceContext } from "./types";
import { onIntent } from "./intent";
import { exit, settle } from "@/lib/motion";
// F23 cloud sources: the caret, the row and the hub on tool pages (everything else is the cloud chunk,
// ui.ts, fetched on intent), compiled out entirely without them (every use sits behind the flag).
import { CloudCaret, CloudRow, useCloud } from "../cloud/tool-cloud";

// Never needed before a file is picked: separate chunks, prefetched on intent (see below).
const lazyParts = {
  result: () => import("./ResultCard"),
  password: () => import("./PasswordDialog"),
  owner: () => import("./OwnerPassword"),
  replace: () => import("./ReplaceFileDialog"),
  preview: () => import("./PagePreviewDialog"),
  pageGrid: () => import("./PageGrid"),
  fileGrid: () => import("./FileGrid"),
  // Only needed once files are in (the leave prompt, the options sheet): out of the first load.
  leave: () => import("./LeaveGuard"),
  dialog: () => import("../ui/Dialog"),
};
const loadLazyParts = () => void Promise.all(Object.values(lazyParts).map((load) => load())).catch(() => {});
const PageGrid = dynamic(() => lazyParts.pageGrid().then((m) => m.PageGrid), { ssr: false });
const FileGrid = dynamic(() => lazyParts.fileGrid().then((m) => m.FileGrid), { ssr: false });
const ResultCard = dynamic(() => lazyParts.result().then((m) => m.ResultCard), { ssr: false });
const PasswordDialog = dynamic(() => lazyParts.password().then((m) => m.PasswordDialog), { ssr: false });
const OwnerPasswordDialog = dynamic(() => lazyParts.owner().then((m) => m.OwnerPasswordDialog), { ssr: false });
const ReplaceFileDialog = dynamic(() => lazyParts.replace().then((m) => m.ReplaceFileDialog), { ssr: false });
const PagePreviewDialog = dynamic(() => lazyParts.preview().then((m) => m.PagePreviewDialog), { ssr: false });
const LeaveGuard = dynamic(() => lazyParts.leave().then((m) => m.LeaveGuard), { ssr: false });

/*
 * F23 cloud sources: every check is `process.env.NEXT_PUBLIC_CLOUD_SOURCES === "1"` written out, a
 * build-time constant the bundler folds before minifying, so builds without them compile to main's
 * exact code (each branch is shaped so that its off side is main's expression).
 */

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

  // ---- extension points (spec F3 M-11 #1). Rotate uses none of them. ----
  /** Replaces the built-in file and page grids. */
  renderWorkspace?: (ctx: WorkspaceContext) => ReactNode;
  /** Toolbar items after the view toggle (and before the size slider). */
  toolbarStart?: (ctx: WorkspaceContext) => ReactNode;
  /** Toolbar items after "Add files". */
  toolbarEnd?: (ctx: WorkspaceContext) => ReactNode;
  /** Orders each batch before it is read (Merge: natural name order). */
  sortIntake?: (files: File[]) => File[];
  /** Called right after a batch is accepted, before any file is parsed. `tag` is what `api.intake` was given. */
  onFilesAdded?: (entries: LoadedFile[], tag: unknown) => void;
  /** Called at the start of every intake, before the file count is checked. */
  beforeIntake?: () => void;
  /** Show the empty state even though files are held (e.g. kept only for an undo). */
  workspaceEmpty?: boolean;
  /** Status text in the ready state (default "{pages} pages · {files} files"). */
  readyStatus?: () => string;
  /** Show the view toggle from one file (Merge) instead of two. */
  viewToggleFromOneFile?: boolean;
  /**
   * Below 640 px the toolbar's Add files button is hidden, because the tool's own
   * one-button Add menu (in `toolbarEnd`, which calls `api.openPicker`) replaces it
   * (Merge, spec F3 M-3). Returns that menu's trigger, which then takes the focus
   * moves that would go to Add files.
   */
  phoneAddMenu?: () => HTMLElement | null;
  /** Merge's own wording for the empty state and the wrong-type error. */
  copyOverrides?: { pickerButton?: string; pickerHint?: string; limits?: string; limitsFull?: string; statusEmpty?: string; errorType?: (name: string) => string };
  /** Chip on the Options button below 1024 px ("2 changed"), for `optionsDensity: "full"`. */
  optionsBadge?: string;
  /** Receives the flow API (for keyboard handlers outside render). */
  apiRef?: { current: FlowApi | null };
  /** Called after every change to the file list (status, pages, removal). */
  onFilesChange?: (files: LoadedFile[]) => void;
  /**
   * Loads an inspector for each PDF (lazily, so it is not in the first load):
   * `scan` reads the raw file in a worker, `notice` looks at the
   * opened document; a returned sentence is shown as a non-blocking notice
   * (Merge: properties the output will not keep).
   */
  inspectPdf?: () => Promise<PdfInspector>;
};

export function ToolFlow({
  tool,
  renderOptions,
  decoratePage,
  renderPageActions,
  onPageKey,
  readyNote,
  canRun,
  process: processFiles, // renamed: `process.env` checks below must reach the real global
  onReset,
  renderWorkspace,
  toolbarStart,
  toolbarEnd,
  sortIntake,
  onFilesAdded,
  beforeIntake,
  workspaceEmpty,
  readyStatus,
  viewToggleFromOneFile,
  phoneAddMenu,
  copyOverrides,
  optionsBadge,
  apiRef,
  onFilesChange,
  inspectPdf,
}: ToolFlowProps) {
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
  const [progressPhase, setProgressPhase] = useState<"fonts" | "pages" | undefined>();
  /** A processing error meant for the user (the job said what to do), shown instead of the generic one. */
  const [processMessage, setProcessMessage] = useState<string | null>(null);
  const [notices, setNotices] = useState<FlowNotice[]>([]);
  const [message, setMessage] = useState("");
  const announce = useCallback((m: string) => setMessage((prev) => (prev === m ? `${m} ` : m)), []);
  const [viewChoice, setViewChoice] = useState<"pages" | "files" | null>(null);
  const [thumbSize, setThumbSize] = useState(THUMB_DEFAULT);
  const [renderSize, setRenderSize] = useState(160);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<{ items: PreviewItem[]; at: number } | null>(null);
  const [pw, setPw] = useState<{ error?: string; busy: boolean; attempt: number }>({ busy: false, attempt: 0 });
  const [pendingReplace, setPendingReplace] = useState<File[] | null>(null);
  const [ownerFor, setOwnerFor] = useState<string | null>(null);
  const [ownerError, setOwnerError] = useState<string | undefined>();

  // pdf.js documents (kept outside React state) and the thumbnail renderer.
  const docs = useRef(new Map<string, OpenedPdf>());
  const renderer = useMemo(() => (typeof window === "undefined" ? null : new ThumbnailRenderer()), []);
  const [watcher, setWatcher] = useState<ReturnType<typeof createVisibilityWatcher> | null>(null);
  // The parts needed once a file is in: fetched at the first sign of intent (the file chooser or
  // the drag hides the load), when files arrive without one (a hand-off), or after 4 s (intent.ts).
  const stopIntent = useRef<() => void>(() => {});
  useEffect(() => (stopIntent.current = onIntent(loadLazyParts)), []);
  const hasFiles = files.length > 0;
  useEffect(() => {
    if (!hasFiles) return;
    stopIntent.current();
    loadLazyParts();
  }, [hasFiles]);
  // Set once listeners (drop, paste, hand-off) are live: tests wait for data-hydrated.
  // From 1024 px the pages scroll inside their own area (fold fit), so thumbnails are watched
  // against that area; below, the page itself scrolls and the viewport is the root.
  const [scrollArea, setScrollArea] = useState<HTMLDivElement | null>(null);
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setWide(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  const watchRoot = wide ? scrollArea : null;
  useEffect(() => {
    const w = createVisibilityWatcher(watchRoot);
    setWatcher(w);
    return () => w.disconnect();
  }, [watchRoot]);

  const heading = useRef<HTMLHeadingElement>(null);
  const picker = useRef<FilePickerHandle>(null);
  const intakeTrigger = useRef<HTMLElement | null>(null);
  const progressBox = useRef<HTMLDivElement>(null);
  const retryButton = useRef<HTMLButtonElement>(null);
  const workArea = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);
  const phoneAddMenuRef = useRef(phoneAddMenu);
  phoneAddMenuRef.current = phoneAddMenu;
  /** The toolbar's Add control that is on screen: Add files, or the phone Add menu that replaces it. */
  const toolbarAdd = useCallback(() => {
    const el = picker.current?.element ?? null;
    if (isShown(el)) return el;
    const alt = phoneAddMenuRef.current?.() ?? null;
    return isShown(alt) ? alt : el;
  }, []);
  const fallbackFocus = useCallback(() => {
    const t = intakeTrigger.current;
    if (isShown(t)) return t;
    return toolbarAdd() ?? heading.current;
  }, [toolbarAdd]);

  // ---- F23 cloud sources: same intake as a local pick (its inputs are set further down) ----
  // eslint-disable-next-line react-hooks/rules-of-hooks -- the flag is a build-time constant: the same call on every render
  const cloud = process.env.NEXT_PUBLIC_CLOUD_SOURCES === "1" ? useCloud() : null;
  // The download cards come with the cloud chunk (here before any download starts).
  const CloudCards = process.env.NEXT_PUBLIC_CLOUD_SOURCES === "1" ? cloud!.ui?.CloudDownloads : undefined;

  // ---- derived -------------------------------------------------------------
  const readyFiles = files.filter(isReady);
  const lockedFiles = files.filter((f) => f.status === "locked");
  const state: FlowState =
    phase === "processing"
      ? "processing"
      : phase === "done"
        ? "done"
        : phase === "error"
          ? "error"
          : (process.env.NEXT_PUBLIC_CLOUD_SOURCES === "1" && cloud!.s.downloads.length ? false : files.length === 0 || (workspaceEmpty && !files.some((f) => f.status !== "ready")))
            ? "empty"
            : lockedFiles.length
              ? "password"
              : (process.env.NEXT_PUBLIC_CLOUD_SOURCES === "1" ? files.some((f) => f.status === "loading") || !!cloud!.s.busy : files.some((f) => f.status === "loading"))
                ? "loading"
                : "ready";
  const totalPages = readyFiles.reduce((s, f) => s + f.pageCount, 0);
  const ownerBlocked = readyFiles.filter((f) => flow.requiredPermissions.some((p) => f.denied.includes(p)));
  const runCheck = canRun?.() ?? true;
  const canPrimary = (state === "ready" || state === "error") && readyFiles.length > 0 && ownerBlocked.length === 0 && runCheck === true;
  const showViewToggle = files.length > 1 || (!!viewToggleFromOneFile && files.length > 0);
  const view = showViewToggle ? (viewChoice ?? flow.defaultView) : "pages";
  const optionsDisabled = !(state === "ready" || state === "error");
  const statusText =
    state === "empty"
      ? (copyOverrides?.statusEmpty ?? copy.statusEmpty)
      : state === "loading"
        ? process.env.NEXT_PUBLIC_CLOUD_SOURCES === "1" ? cloud!.s.busy || copy.statusLoading : copy.statusLoading
        : state === "password"
          ? copy.statusPassword
          : ownerBlocked.length
            ? copy.statusOwner
            : typeof runCheck === "string"
              ? runCheck
              : (readyStatus?.() ?? copy.statusReady(totalPages, readyFiles.length));

  // ---- notices -------------------------------------------------------------
  const pushNotice = useCallback((n: Omit<FlowNotice, "id">) => {
    const id = `n${++fileSeq}`;
    setNotices((prev) => [...prev, { ...n, id }]);
    return id;
  }, []);
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
      if (imageFormatOfName(entry.name)) {
        // Pictures (Merge): sizes from the header, no decode; each image (or TIFF frame) is one A4 page.
        const format = sniffFormat(bytes);
        let frames: { width: number; height: number }[] | null = null;
        let tooLarge = false;
        if (format === "tiff") {
          // Walked in the TIFF worker with a time limit: a hostile file can never hang this tab.
          const r = await (await import("@/lib/pdf/tiff-client")).probeTiff(entry.source);
          if ("frames" in r) frames = r.frames;
          else tooLarge = r.problem === "tooLarge";
        } else if (format) {
          const probe = probeImage(bytes);
          frames = probe ? [probe] : null;
        }
        if (!filesRef.current.some((f) => f.id === id)) return "gone";
        const reject = (message: string) => {
          problems.push(message);
          removeFile(id);
          return "rejected" as const;
        };
        if (tooLarge) return reject(copy.errorPixels(entry.name));
        if (!format || !frames?.length) return reject(copy.errorImage(entry.name));
        if (frames.some((f) => exceedsPixelCap(f.width, f.height))) return reject(copy.errorPixels(entry.name));
        const otherPages = filesRef.current.filter((f) => f.id !== id).reduce((sum, f) => sum + f.pageCount, 0);
        if (!fitsPageBudget(otherPages, frames.length, flow.maxTotalPages)) return reject(copy.errorPages(entry.name, flow.maxTotalPages));
        renderer?.registerImage(id, entry.source, format, frames);
        patchFile(id, { status: "ready", kind: "image", pageCount: frames.length, pages: frames.map((f) => imagePageSize(f.width, f.height)) });
        announce(copy.fileReady(entry.name, frames.length));
        return "ok";
      }
      const inspector = inspectPdf ? await inspectPdf().catch(() => null) : null;
      const scanned = inspector?.scan(entry.source); // in a worker, in parallel with pdf.js
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
      if (inspector)
        void Promise.resolve(scanned)
          .then((markers) => inspector.notice(entry.name, pdf.doc, markers))
          .then((note) => note && filesRef.current.some((f) => f.id === id) && pushNotice({ tone: "warning", title: note, sticky: true }))
          .catch(() => {});
      return "ok";
    },
    [announce, flow.maxTotalPages, inspectPdf, patchFile, pushNotice, removeFile, renderer],
  );

  const flushProblems = useCallback(
    (problems: string[]) => {
      if (!problems.length) return;
      pushNotice(problems.length === 1 ? { tone: "danger", title: problems[0] } : { tone: "danger", title: copy.problemsTitle(problems.length), items: problems });
    },
    [pushNotice],
  );

  // How the visitor last interacted (pointer or keys), for focus moves the page makes itself.
  const lastInput = useRef<InputModality>("keyboard");
  useEffect(() => trackInputModality((m) => (lastInput.current = m)), []);

  // After a pick from the empty state, its picker unmounts. Once the workspace is
  // committed, move focus to the toolbar's picker (the same control), but only
  // if focus fell to <body>: newly loaded files never steal focus. After a mouse
  // or touch pick the move shows no focus ring (eval G-7); the next key shows it.
  const [focusToolbarTick, setFocusToolbarTick] = useState(0);
  useEffect(() => {
    if (!focusToolbarTick) return;
    const active = document.activeElement;
    if (active && active !== document.body && active.isConnected) return;
    const el = toolbarAdd();
    if (!el) return;
    intakeTrigger.current = el;
    moveFocus(el, lastInput.current);
  }, [focusToolbarTick, toolbarAdd]);

  const intake = useCallback(
    async (incomingRaw: File[], trigger: HTMLElement | null, opts: { replace?: boolean; tag?: unknown } = {}) => {
      if (phaseRef.current === "processing" || phaseRef.current === "done") return;
      if (!incomingRaw.length) return;
      const incoming = sortIntake ? sortIntake(incomingRaw) : incomingRaw;
      beforeIntake?.();
      if (!flow.multiFile && filesRef.current.length > 0 && !opts.replace) {
        setPendingReplace(incoming);
        return;
      }
      if (opts.replace) for (const f of filesRef.current) removeFile(f.id);
      intakeTrigger.current = trigger;
      if (phaseRef.current === "error") setPhase("idle");
      // Info notices last until the next intake; errors stay until dismissed.
      setNotices((prev) => prev.filter((n) => n.tone === "danger" || n.sticky));

      const screened = screenFiles(
        incoming,
        { accept: flow.accept, multiFile: flow.multiFile, maxFiles: flow.maxFiles, maxFileBytes: flow.maxFileBytes, maxTotalBytes: flow.maxTotalBytes },
        filesRef.current.length,
        filesRef.current.reduce((sum, f) => sum + f.size, 0),
      );
      const mb = (bytes: number) => Math.round(bytes / 1024 / 1024);
      const problems = screened.rejected.map((r) =>
        r.reason === "type" ? (copyOverrides?.errorType ?? copy.errorType)(r.name) : r.reason === "size" ? copy.errorSize(r.name, mb(flow.maxFileBytes)) : copy.errorTotal(r.name, mb(flow.maxTotalBytes)),
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
        kind: imageFormatOfName(file.name) ? "image" : "pdf",
        lastModified: file.lastModified ?? 0,
      }));
      if (!entries.length) {
        flushProblems(problems);
        return;
      }
      updateFiles((prev) => [...prev, ...entries]);
      onFilesAdded?.(entries, opts.tag);
      if (trigger) setFocusToolbarTick((n) => n + 1);
      announce(copy.readingCount(entries.length));
      for (const e of entries) await loadFile(e.id, undefined, problems);
      flushProblems(problems);
    },
    [announce, beforeIntake, copyOverrides?.errorType, flow, flushProblems, loadFile, onFilesAdded, pushNotice, removeFile, sortIntake, updateFiles],
  );

  if (process.env.NEXT_PUBLIC_CLOUD_SOURCES === "1") cloud!.deps = { tool, announce, intake, pushNotice, dismissNotice, sortIntake, errorType: copyOverrides?.errorType, files };

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
    setProgressPhase(undefined);
    setPhase("processing");
    announce(tool.flow.progressLabel);
    const started = performance.now();
    try {
      const out = await processFiles(ready, controller.signal, (v, ph) => {
        setProgress(v);
        setProgressPhase(ph);
      });
      const wait = MIN_PROCESSING_MS - (performance.now() - started);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      if (controller.signal.aborted) return;
      setProgress(1);
      // The work area fades out (120ms, inert at once) and the result card rises in its place (T12).
      await exit(workArea.current, "result");
      if (controller.signal.aborted) return settle(workArea.current);
      setOutput(out);
      for (const w of out.warnings ?? []) pushNotice({ tone: "warning", title: w });
      setPhase("done");
      announce(copy.resultTitle(out.type === "application/zip"));
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : "unknown error";
      console.error(`[${tool.slug}] processing failed:`, message.startsWith(USER_ERROR) ? "user-facing error" : message);
      setProcessMessage(message.startsWith(USER_ERROR) ? message.slice(USER_ERROR.length) : null);
      setPhase("error");
    }
  }, [announce, processFiles, pushNotice, tool.flow.progressLabel, tool.slug]);

  // Move focus once the processing bar or the error panel has been committed
  // (a requestAnimationFrame can run before React commits under load).
  useEffect(() => {
    if (phase === "processing") progressBox.current?.focus();
    else if (phase === "error") retryButton.current?.focus();
    // Fit the first screen: the result starts at the top, so Download is never under the header.
    // A smooth scroll already in flight is only cancelled by an instant scroll that really moves the
    // page (scrollTo(0, 0) while scrollY still reads 0 is a no-op), so step to 1 and back, now and again
    // after two frames.
    else if (phase === "done") {
      const root = document.documentElement;
      const before = root.style.scrollBehavior;
      const toTop = () => {
        window.scrollTo(0, 1);
        window.scrollTo(0, 0);
      };
      root.style.scrollBehavior = "auto";
      toTop();
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          toTop();
          root.style.scrollBehavior = before;
        }),
      );
    }
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

  // A layout effect, not a passive one: a tool that mirrors the file list (Merge's cards) updates in
  // the same task, before paint. With useEffect the flow committed its new state first (e.g. "ready"
  // after Skip on a locked file) while the tool still rendered the removed file's card for a frame.
  useLayoutEffect(() => {
    onFilesChange?.(files);
  }, [files, onFilesChange]);

  // ---- API for tools with their own workspace -------------------------------
  const api = useMemo<FlowApi>(
    () => ({
      intake: (f, trigger, tag) => intake(f, trigger, { tag }),
      removeFiles: (ids) => ids.forEach(removeFile),
      pushNotice,
      dismissNotice,
      announce,
      openPreview: (items, at) => setPreview({ items, at }),
      setView: (v) => setViewChoice(v),
      openPicker: () => picker.current?.open(),
      fallbackFocus,
    }),
    [announce, dismissNotice, fallbackFocus, intake, pushNotice, removeFile],
  );
  if (apiRef) apiRef.current = api;

  // ---- render ----------------------------------------------------------------
  const ctx: FlowContext = { files, readyFiles, state, disabled: optionsDisabled, announce };
  const wctx: WorkspaceContext = { ...ctx, view, api, dimmed: state === "processing" };
  const decorate = decoratePage ?? (() => ({ pendingDelta: 0, inScope: false }));
  const previewTarget: PreviewTarget | null = useMemo(() => {
    if (!preview) return null;
    const items = preview.items.flatMap((it) => {
      const file = readyFiles.find((f) => f.id === it.fileId);
      return file ? [{ file, index: it.index, rotation: it.rotation }] : [];
    });
    return items.length ? { items, at: Math.min(preview.at, items.length - 1) } : null;
  }, [preview, readyFiles]);
  const accept = acceptAttribute(flow.accept);
  const ownerFile = ownerFor ? readyFiles.find((f) => f.id === ownerFor) : undefined;

  const primary = (
    <Button variant="primary" size="lg" className="w-full" disabled={!canPrimary} aria-describedby={statusId} onClick={run} data-testid="primary-action">
      {flow.actionLabel}
    </Button>
  );

  // Elements the F23 branches below extend (cloneElement adds the caret) and the plain branch
  // renders as is. Thunks, which the minifier inlines back: flag-off builds compile to main's code.
  const introPicker = () => (
    <FilePicker
      ref={picker}
      accept={accept}
      multiple={flow.multiFile}
      label={copyOverrides?.pickerButton ?? copy.pickerButton(flow.multiFile)}
      icon={<UploadIcon size={24} />}
      onFiles={(f, t) => void intake(f, t)}
      inputTestId="file-input"
    />
  );
  const toolbarPicker = () => (
    <FilePicker
      ref={picker}
      accept={accept}
      multiple={flow.multiFile}
      label={flow.multiFile ? "Add files" : "Replace file"}
      variant="tool"
      size="sm"
      className={phoneAddMenu ? "shadow-glow max-sm:hidden" : "shadow-glow"}
      icon={<PlusIcon size={16} />}
      disabled={state === "processing"}
      onFiles={(f, t) => void intake(f, t, { replace: !flow.multiFile })}
      inputTestId="file-input"
    />
  );
  const pickerHint = () => <p className="hidden text-sm text-muted [@media(pointer:fine)]:block">{copyOverrides?.pickerHint ?? copy.pickerHint}</p>;
  const previewDialog = () => (
    <PagePreviewDialog
      target={previewTarget}
      renderer={renderer}
      onNavigate={(at) => setPreview((p) => (p ? { ...p, at } : p))}
      onClose={() => setPreview(null)}
      fallbackFocus={() => heading.current}
    />
  );
  return (
    <div data-state={state} data-hydrated={watcher ? "" : undefined} data-testid="tool-flow" className="ip-flow" style={thumbSize === THUMB_DEFAULT ? undefined : { ["--ip-thumb-size" as string]: `${thumbSize}px` }}>
      <DropOverlay active={dragging && acceptsDrop} mode={flow.multiFile || files.length === 0 ? "add" : "replace"} />
      <LiveRegion message={message} />
      <ToolIntro ref={heading} title={flow.title} />

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
        // Empty: the drop area (--ip-work-h, fits the first screen) beside the options panel, which grows
        // with its options. When the panel runs past the fold the page scrolls (never the panel), the drop
        // area stays in view (sticky) and the primary stays pinned at the bottom of the screen.
        // Loaded: the pages take the full width down to the compact bottom bar.
        <div ref={workArea} className={state === "empty" ? "lg:grid lg:grid-cols-[minmax(0,1fr)_var(--ip-dock-w)] lg:items-start lg:gap-[30px]" : undefined}>
          <section aria-label="Your files" className={state === "empty" ? "min-w-0 lg:sticky lg:top-[calc(var(--ip-header-h)+16px)]" : "min-w-0"}>
            {state === "empty" ? (
              <DropCard>
                {process.env.NEXT_PUBLIC_CLOUD_SOURCES === "1"
                  ? cloneElement(introPicker(), { sources: <CloudCaret hub={cloud!} look="primary" /> })
                  : introPicker()}
                {process.env.NEXT_PUBLIC_CLOUD_SOURCES === "1" ? (
                  <>
                    <CloudRow hub={cloud!} />
                    {pickerHint()}
                  </>
                ) : (
                  pickerHint()
                )}
                <LimitsNote text={copyOverrides?.limits ?? copy.limits(flow)} full={copyOverrides?.limitsFull ?? copy.limitsFull(flow)} />
                <PrivacyNote runtime={tool.runtime} context="intro" />
              </DropCard>
            ) : (
              // BerryPDF working mode: plain seed-cream, no decoration. A sticky row of editing tools
              // (blueberry EditorToolbar look, Tabs for the view) above the pink page trays.
              // From 1024 px the area fills the screen down to the bottom bar (--ip-pages-h)
              // and the pages scroll inside it with a slim BerryPDF scroll bar (shown only on overflow);
              // below 1024 px the page scrolls and the tools row sticks under the header.
              <div className="relative rounded-panel border-[1.5px] border-sand bg-cream px-3 sm:px-5 lg:flex lg:h-(--ip-pages-h) lg:flex-col">
                <div className="sticky top-(--ip-header-h) z-10 -mx-3 flex h-[64px] shrink-0 items-center gap-2 rounded-t-panel bg-cream px-3 sm:-mx-5 sm:gap-3 sm:px-5 lg:static lg:gap-4">
                  {showViewToggle && (
                    <SegmentedControl
                      look="tabs"
                      label="View"
                      value={view}
                      onChange={setViewChoice}
                      options={
                        flow.defaultView === "files"
                          ? [
                              { value: "files", label: "Files" },
                              { value: "pages", label: "Pages" },
                            ]
                          : [
                              { value: "pages", label: "Pages" },
                              { value: "files", label: "Files" },
                            ]
                      }
                    />
                  )}
                  {toolbarStart?.(wctx)}
                  {view === "pages" && (
                    <Slider
                      // Tablets: a shorter track so the row (view, sort, size, add) fits 768 px without widening the page.
                      className="max-sm:hidden max-lg:[&_.ip-range]:w-20"
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
                    {process.env.NEXT_PUBLIC_CLOUD_SOURCES === "1"
                      ? cloneElement(toolbarPicker(), {
                          sources: (
                            <CloudCaret hub={cloud!} look="tool" className={phoneAddMenu ? "max-sm:hidden" : undefined} disabled={state === "processing"} />
                          ),
                        })
                      : toolbarPicker()}
                  </span>
                  {toolbarEnd?.(wctx)}
                </div>
                <div
                  ref={setScrollArea}
                  data-testid="pages-scroll"
                  className="ip-scroll flex flex-col gap-4 pt-3 pb-6 max-lg:min-h-[calc(var(--ip-thumb-size)+76px)] lg:-mx-5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:px-5"
                  data-ip-scroll="pages"
                  inert={state === "processing" ? true : undefined}
                >
                  {ownerBlocked.map((f) => (
                    <OwnerPermissionNotice
                      key={f.id}
                      fileName={f.name}
                      denied={flow.requiredPermissions.filter((p) => f.denied.includes(p))}
                      onEnterPassword={() => setOwnerFor(f.id)}
                    />
                  ))}
                  <ThumbContext.Provider value={{ renderer, watch: watcher?.watch ?? null, renderSize: renderBucket(renderSize) }}>
                    {renderWorkspace ? (
                      renderWorkspace(wctx)
                    ) : view === "pages" ? (
                      <PageGrid
                        files={files}
                        decorate={decorate}
                        renderActions={renderPageActions}
                        onPageKey={onPageKey}
                        onRemove={(f) => removeFile(f.id)}
                        onOpen={(f, i) =>
                          setPreview({ items: Array.from({ length: f.pageCount }, (_, k) => ({ fileId: f.id, index: k, rotation: decorate(f, k).pendingDelta })), at: i })
                        }
                        dimmed={state === "processing"}
                      />
                    ) : (
                      <FileGrid files={files} onRemove={(f) => removeFile(f.id)} />
                    )}
                    {process.env.NEXT_PUBLIC_CLOUD_SOURCES === "1" ? (
                      <>
                        {CloudCards && <CloudCards downloads={cloud!.s.downloads} />}
                        {previewDialog()}
                      </>
                    ) : (
                      previewDialog()
                    )}
                  </ThumbContext.Provider>
                </div>
                {state === "processing" && (
                  // A full wait: the berry loader over the dimmed pages, kept in view while scrolling.
                  // Decorative; the dock's progress bar and status carry the state for assistive tech.
                  <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[11]" data-testid="processing-loader">
                    <div className="sticky top-[calc(var(--ip-header-h)+120px)] flex justify-center pt-16">
                      <div className="mp-loading ip-wait-in rounded-panel border-[1.5px] border-sand bg-surface-raised px-8 pt-5 pb-4 shadow-card">
                        <BerryLoader size="md" />
                        <span className="tabular-nums">{copy.progress(flow.progressLabel, Math.round(progress * 100))}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          <ControlDock
            label={`${tool.name} options`}
            layout={state === "empty" ? "side" : "bar"}
            optionsDisabled={optionsDisabled}
            options={renderOptions(ctx)}
            density={flow.optionsDensity}
            sheet={{
              title: `${tool.name} options`,
              badge: optionsBadge,
              footer: (close) => (
                <>
                  <Button variant="secondary" className="flex-1" onClick={close}>
                    Done
                  </Button>
                  <Button
                    variant="primary"
                    className="flex-1"
                    disabled={!canPrimary}
                    onClick={() => {
                      close();
                      void run();
                    }}
                  >
                    {flow.actionLabel}
                  </Button>
                </>
              ),
            }}
            status={<DockStatus id={statusId} text={statusText} extra={state === "ready" && runCheck === true ? readyNote : undefined} />}
            footer={
              state === "processing" ? (
                <ProcessingBar ref={progressBox} label={flow.progressLabel} value={progress} phaseLabel={progressPhase === "fonts" ? copy.preparingFonts : undefined} />
              ) : state === "error" ? (
                <ProcessError ref={retryButton} message={processMessage ?? copy.errorProcess(flow.progressLabel)} onRetry={run} onStartOver={startOver} />
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

/** See `inspectPdf`. `scan` reads the file (off the main thread) for whatever `notice` needs. */
export type PdfInspector = { scan: (file: Blob) => Promise<unknown>; notice: (name: string, doc: OpenedPdf["doc"], scanned: unknown) => Promise<string | null> };

/** Re-render thumbnails only in steps, scaling with CSS in between. */
function renderBucket(size: number): number {
  return size <= 160 ? 160 : size <= 240 ? 240 : size <= 320 ? 320 : 400;
}
