"use client";
import "../ui/dialog.css";
import "./tool-flow.css";
import "./layout.css";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { cloneElement, memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type SyntheticEvent } from "react";
import { setHandoff, takeHandoff } from "@/lib/pdf/handoff";
import { openPdf, readPageSizes, type OpenedPdf } from "@/lib/pdf/pdfjs";
import { LazyThumbnails } from "@/lib/pdf/thumbs-lazy";
import { USER_ERROR } from "@/lib/pdf/user-error";
import { disposeWorker } from "@/lib/pdf/worker-client";
import { acceptAttribute, fitsPageBudget, screenFiles } from "@/lib/pdf/validation";
import { imageFormatOfName } from "@/lib/pdf/image-names";
import { continueTargets, toolBySlug, isUsable, type FlowTool } from "@/tools/registry";
import { Button } from "../ui/Button";
import { isShown, moveFocus, trackInputModality, type InputModality } from "../ui/focus";
import { PlusIcon, UploadIcon } from "../ui/icons";
import { LiveRegion } from "../ui/LiveRegion";
import { SegmentedControl } from "../ui/SegmentedControl";
import { Slider } from "../ui/Slider";
import type { AnnounceMemo, PillProgress } from "./announce";
import { copy } from "./copy";
import { DropCard } from "./DropCard";
import { DropOverlay } from "./DropOverlay";
import { FilePicker, type FilePickerHandle } from "./FilePicker";
import { LimitsNote, PrivacyNote } from "./notes";
import { NoticeStack, type FlowNotice } from "./NoticeStack";
import { OwnerPermissionNotice } from "./OwnerPermissionNotice";
import type { PageActionsRenderer, PageKeyHandler, TileActivate } from "./PageGrid";
import type { PreviewTarget } from "./PagePreviewDialog";
import { createVisibilityWatcher, ThumbContext } from "./thumb-context";
import { ToolIntro } from "./ToolIntro";
import type { FlowApi, FlowContext, FlowState, LoadedFile, PageDecoration, PreviewItem, ProcessFn, ReadyFile, ToolOutput, WorkspaceContext } from "./types";
import { onIntent } from "./intent";
import { exit, settle } from "@/lib/motion";
import { enter } from "@/lib/motion/flow";
// F23 cloud sources: the caret, the row and the hub on tool pages (everything else is the cloud chunk,
// ui.ts, fetched on intent), compiled out entirely without them (every use sits behind the flag).
import { CloudCaret, CloudRow, useCloud } from "../cloud/tool-cloud";

// Never needed before a file is picked: separate chunks, prefetched on intent (see below).
// The dock and the action slot (loaded-chrome.ts): fetched on intent and awaited before the first file is
// drawn, then read synchronously from `chrome`, so the row is complete from its first frame (motion.md T5).
let chrome: typeof import("./loaded-chrome") | null = null;
const loadChrome = () => import("./loaded-chrome").then((m) => (chrome = m));

// The result (F25 §7, eval G-2/G-4): awaited before the swap and read synchronously, so the result and its
// Download mount in the same commit as "done", with no empty frame between the work area and the result.
// `require.ensure` fetches and registers a chunk without running its modules (tools/editor/idle-prefetch.ts).
declare const require: { ensure(deps: string[], ready: () => void, failed: (e: unknown) => void): void };
let resultParts: typeof import("./ResultCard") | null = null;
const loadResult = () => import("./ResultCard").then((m) => (resultParts = m));

const lazyParts = {
  chrome: loadChrome,
  result: loadResult,
  popover: () => import("../ui/Popover"),
  password: () => import("./PasswordDialog"),
  owner: () => import("./OwnerPassword"),
  replace: () => import("./ReplaceFileDialog"),
  preview: () => import("./PagePreviewDialog"),
  pageGrid: () => import("./PageGrid"),
  fileGrid: () => import("./FileGrid"),
  // Only needed once files are in (the leave prompt, the options sheet): out of the first load.
  leave: () => import("./LeaveGuard"),
  dialog: () => import("../ui/Dialog"),
  // The thumbnail renderer (LazyThumbnails fetches the same chunk) and the picture header helpers.
  thumbs: () => import("@/lib/pdf/thumbnails"),
  images: () => import("@/lib/pdf/images"),
  // pdf.js (eval G-8): its chunk fetched, not run (running it is a long task; the pick does that).
  pdfjs: () => new Promise<void>((done) => require.ensure(["pdfjs-dist"], () => done(), () => done())),
};
const loadLazyParts = () => void Promise.all(Object.values(lazyParts).map((load) => load())).catch(() => {});
/**
 * On a real sign of intent only (never on the 4 s timer, and not with Data Saver on or on 2g), pdf.js's two
 * workers go into the HTTP cache too, so a drop right after it has the engine at hand (eval G-8). Not
 * with the files: the pick creates the workers itself, and a warm fetch racing that would download them twice.
 */
const warmWorkers = () => void import("@/lib/pdf/pdfjs-warm-intent").then((m) => m.warmPdfjs()).catch(() => {});
const PageGrid = dynamic(() => lazyParts.pageGrid().then((m) => m.PageGrid), { ssr: false });
const FileGrid = dynamic(() => lazyParts.fileGrid().then((m) => m.FileGrid), { ssr: false });
// Fallbacks only if the chunk was not in when the result came (it is awaited before the swap).
const LazyResultCard = dynamic(() => lazyParts.result().then((m) => m.ResultCard), { ssr: false });
const LazyResultDownload = dynamic(() => lazyParts.result().then((m) => m.ResultDownload), { ssr: false });
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

/** Once shown, the progress pill stays at least this long, so a fast run does not flash (motion.md T11). */
const MIN_PROCESSING_MS = 400;
/** The pill's done tick holds this long before the result swap starts (F25 §6 "Done", AC-639). */
const DONE_HOLD_MS = 400;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
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
  onPageKey?: PageKeyHandler;
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
  /** Called at the start of every intake (with the incoming files), before the file count is checked. */
  beforeIntake?: (incoming: File[]) => void;
  /**
   * Files kept loaded only so an undo or redo can bring them back (F5 history). They are not in the
   * task, so they do not count toward the file, size or page caps of a new pick.
   */
  heldFiles?: () => ReadonlySet<string>;
  /** Show the empty state even though files are held (e.g. kept only for an undo). */
  workspaceEmpty?: boolean;
  /** Status text in the ready state (default "{pages} pages · {files} files"). */
  readyStatus?: () => string;
  /** Show the view toggle from one file (Merge) instead of two. */
  viewToggleFromOneFile?: boolean;
  /**
   * Below 1024 px the toolbar's Add files button is hidden, because the tool's own
   * one-button Add menu (in `toolbarEnd`, which calls `api.openPicker`) replaces it
   * (Merge, spec F3 M-3; from 1023 px down since F4/F5 P-3, so the toolbar never scrolls
   * sideways). Returns that menu's trigger, which then takes the focus moves that would go to Add files.
   */
  phoneAddMenu?: () => HTMLElement | null;
  /** Controls in the top row (or the bottom dock) after the options (F5 Undo│Redo). */
  dockStart?: (ctx: FlowContext) => ReactNode;
  /**
   * For `optionsDensity: "full"`: a compact control shown in the top row itself from 1280 px, before More
   * options (Merge's Contents page, F25 §3.4); below 1280 it lives only behind More options.
   */
  rowOptions?: (ctx: FlowContext) => ReactNode;
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

  // ---- page tools (spec F4/F5 UI P-4). Rotate and Merge use none of them. ----
  /** The primary's label while it can run ("Split into 3 files"); the plain action label otherwise. */
  primaryLabel?: () => string;
  /** A tile click (and Enter / Space) toggles the page instead of opening the preview (Extract, Delete). */
  onTileActivate?: TileActivate;
  /** Drawn in the grid gap after each tile (Split's marks). `busy`: processing or showing the result. */
  renderGap?: (file: LoadedFile, index: number, tabIndex: number, busy: boolean) => ReactNode;
  /** The grid's keyboard hint after "Use arrow keys to move between pages." */
  gridHint?: string;
  /** The dock's More options trigger: after the options, beside the primary on phones. */
  renderMore?: (ctx: FlowContext) => ReactNode;
};

/** Renders its children, then keeps that output while `hold` is true (React skips the subtree). */
const HoldWhile = memo(
  function HoldWhile({ children }: { children: ReactNode; hold: boolean }) {
    return <>{children}</>;
  },
  (_, next) => next.hold,
);

/**
 * True from the first time `on` is true. The closed dialogs below mount only then (they keep their
 * close animation and focus return after that), so their chunks stay out of the first screen's JS
 * (spec P-12; seo.spec phone budget). Intent (onIntent → loadLazyParts) still fetches them early.
 */
function useMountOnce(on: boolean): boolean {
  const [seen, setSeen] = useState(on);
  if (on && !seen) setSeen(true);
  return seen || on;
}

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
  heldFiles,
  workspaceEmpty,
  readyStatus,
  viewToggleFromOneFile,
  phoneAddMenu,
  dockStart,
  rowOptions,
  copyOverrides,
  optionsBadge,
  apiRef,
  onFilesChange,
  inspectPdf,
  primaryLabel,
  onTileActivate,
  renderGap,
  gridHint,
  renderMore,
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
  const heldRef = useRef(heldFiles);
  heldRef.current = heldFiles;
  /** The files of the task: all but those kept only for undo (they count toward no cap). */
  const inTask = useCallback((list: LoadedFile[]) => {
    const held = heldRef.current?.();
    return held?.size ? list.filter((f) => !held.has(f.id)) : list;
  }, []);

  const [phase, setPhase] = useState<Phase>("idle");
  const phaseRef = useRef<Phase>("idle");
  phaseRef.current = phase;
  const [output, setOutput] = useState<ToolOutput | null>(null);
  // F23: the result's privacy line after a copy went to a cloud (Save to Drive lives in the slot).
  const [cloudLine, setCloudLine] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressPhase, setProgressPhase] = useState<"fonts" | "pages" | undefined>();
  /** A server job's phase (upload, queue, work), when the tool reports one (F25 §6). */
  const [jobPhase, setJobPhase] = useState<PillProgress | null>(null);
  /** The pill's done tick, held DONE_HOLD_MS before the result swap. */
  const [pillDone, setPillDone] = useState(false);
  /** What Cancel does for a server job once it exists (sends DELETE); null for browser jobs. */
  const serverCancel = useRef<(() => Promise<boolean>) | null>(null);
  // Bumped on every run, so a late DELETE reply from a cancelled run never shows its notice over the next.
  const runGen = useRef(0);
  const memo = useRef<AnnounceMemo | null>(null);
  const errorNotice = useRef<string | null>(null);
  /** A processing error meant for the user (the job said what to do), shown instead of the generic one. */
  const [processMessage, setProcessMessage] = useState<string | null>(null);
  const [notices, setNotices] = useState<FlowNotice[]>([]);
  const [message, setMessage] = useState("");
  const announce = useCallback((m: string) => setMessage((prev) => (prev === m ? `${m} ` : m)), []);
  const [viewChoice, setViewChoice] = useState<"pages" | "files" | null>(null);
  const [thumbSize, setThumbSize] = useState(THUMB_DEFAULT);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<{ items: PreviewItem[]; at: number } | null>(null);
  const [pw, setPw] = useState<{ error?: string; busy: boolean; attempt: number }>({ busy: false, attempt: 0 });
  const [pendingReplace, setPendingReplace] = useState<File[] | null>(null);
  const [ownerFor, setOwnerFor] = useState<string | null>(null);
  const [ownerError, setOwnerError] = useState<string | undefined>();

  // pdf.js documents (kept outside React state) and the thumbnail renderer.
  const docs = useRef(new Map<string, OpenedPdf>());
  // Fetched with the first file (or on intent), never in the tool's first load.
  const renderer = useMemo(() => (typeof window === "undefined" ? null : new LazyThumbnails()), []);
  const [watcher, setWatcher] = useState<ReturnType<typeof createVisibilityWatcher> | null>(null);
  // The parts needed once a file is in: fetched at the first sign of intent (the file chooser or
  // the drag hides the load), when files arrive without one (a hand-off), or after 4 s (intent.ts).
  const stopIntent = useRef<() => void>(() => {});
  useEffect(() => {
    const parts = onIntent(loadLazyParts);
    const warm = onIntent(warmWorkers, 0);
    return (stopIntent.current = () => (parts(), warm()));
  }, []);
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
  // The pages area dims and goes inert one frame after the pill shows (eval G-13): with hundreds of tiles,
  // making it inert restyles every tile (~450ms at 990 pages), which must not hold the pill's first paint.
  const [pagesDim, setPagesDim] = useState(false);
  // Until then (the gap frame) the pages still take input, and a tile click there would change the job the
  // primary just started (the tools read their marks when the work begins). So from the click the pages
  // area swallows pointer input in the capture phase: no restyle, nothing reaches a tile. (Keys can't reach
  // a tile then: the click or Enter that started the run moved focus to the pill.)
  const blockWhileWorking = (e: SyntheticEvent) => {
    if (phaseRef.current !== "processing") return;
    e.preventDefault();
    e.stopPropagation();
  };
  const retryButton = useRef<HTMLButtonElement>(null);
  const primaryButton = useRef<HTMLButtonElement>(null);
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
  // Enter in a dock field (FlowApi.submit) needs only the flow's own conditions; the tool has checked its settings.
  const flowCanRun = (state === "ready" || state === "error") && readyFiles.length > 0 && ownerBlocked.length === 0;
  const canPrimary = flowCanRun && runCheck === true;
  const showViewToggle = files.length > 1 || (!!viewToggleFromOneFile && files.length > 0);
  // Screen fit on phones (F25, F4/F5 eval G-9): with one file and no tool controls the tools row holds
  // only the picker, so below 1024 px the picker sits in the bottom bar (icon only) and the row keeps
  // just the size slider (640-1023 px); below 640 px the row is gone and the pages start under the title.
  const solo = !wide && !showViewToggle && !toolbarStart && !toolbarEnd;
  const view = showViewToggle ? (viewChoice ?? flow.defaultView) : "pages";
  const optionsDisabled = !(state === "ready" || state === "error");
  /** Settings tools (F25 §4): the options in a side panel from 1024 px, the row holds only the slot. */
  const settings = flow.layout === "settings";
  const loaded = state !== "empty";
  // A safety net for a way in that skipped intake's await: draw the row once its chunk is here.
  const [, setChromeTick] = useState(0);
  useEffect(() => {
    if (loaded && !chrome) void loadChrome().then(() => setChromeTick((n) => n + 1), () => {});
  }, [loaded]);
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
        const { exceedsPixelCap, imagePageSize, probeImage, sniffFormat } = await import("@/lib/pdf/images");
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
        const otherPages = inTask(filesRef.current).filter((f) => f.id !== id).reduce((sum, f) => sum + f.pageCount, 0);
        if (!fitsPageBudget(otherPages, frames.length, flow.maxTotalPages)) return reject(copy.errorPages(entry.name, flow.maxTotalPages));
        renderer?.registerImage(id, entry.source, format, frames);
        patchFile(id, { status: "ready", kind: "image", pageCount: frames.length, pages: frames.map((f) => imagePageSize(f.width, f.height)) });
        announce(copy.fileReady(entry.name, frames.length));
        return "ok";
      }
      // The inspector loads beside pdf.js, never before it (eval G-11); its scan runs in a worker.
      const inspection = inspectPdf?.().then((i) => [i, i.scan(entry.source)] as const, () => null);
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
      const otherPages = inTask(filesRef.current).filter((f) => f.id !== id).reduce((s, f) => s + f.pageCount, 0);
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
      if (inspection)
        void inspection
          .then((x) => x && x[1].then((markers) => x[0].notice(entry.name, pdf.doc, markers)))
          .then((note) => note && filesRef.current.some((f) => f.id === id) && pushNotice({ tone: "warning", title: note, sticky: true }))
          .catch(() => {});
      return "ok";
    },
    [announce, flow.maxTotalPages, inTask, inspectPdf, patchFile, pushNotice, removeFile, renderer],
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
      beforeIntake?.(incoming);
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
        inTask(filesRef.current).length,
        inTask(filesRef.current).reduce((sum, f) => sum + f.size, 0),
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
      if (!chrome) await loadChrome().catch(() => {});
      updateFiles((prev) => [...prev, ...entries]);
      onFilesAdded?.(entries, opts.tag);
      if (trigger) setFocusToolbarTick((n) => n + 1);
      announce(copy.readingCount(entries.length));
      for (const e of entries) await loadFile(e.id, undefined, problems);
      flushProblems(problems);
    },
    [announce, beforeIntake, copyOverrides?.errorType, flow, flushProblems, inTask, loadFile, onFilesAdded, pushNotice, removeFile, sortIntake, updateFiles],
  );

  if (process.env.NEXT_PUBLIC_CLOUD_SOURCES === "1")
    cloud!.deps = { tool, announce, intake, pushNotice, dismissNotice, sortIntake, errorType: copyOverrides?.errorType, files, devicePicker: () => picker.current?.element ?? null };

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
  // The live region during a job (F25 §6 "Screen readers"): every phase change, progress at the
  // 25/50/75% marks at most every 10s, the queue position at most every 30s and when it reaches 1.
  const sayProgress = useCallback(
    (p: PillProgress) => {
      if (!chrome) return;
      const { text, memo: next } = chrome.announcementFor(memo.current, p, performance.now(), tool.flow.progressLabel);
      memo.current = next;
      if (text) announce(text);
    },
    [announce, tool.flow.progressLabel],
  );

  const run = useCallback(async () => {
    const ready = filesRef.current.filter(isReady);
    if (!ready.length || phaseRef.current === "processing") return;
    // Set here, not only at render: a second Enter or click before React re-renders must see it.
    phaseRef.current = "processing";
    const controller = new AbortController();
    abort.current = controller;
    runGen.current++;
    serverCancel.current = null;
    memo.current = null;
    if (errorNotice.current) dismissNotice(errorNotice.current);
    errorNotice.current = null;
    setProgress(0);
    setProgressPhase(undefined);
    // A server tool's run starts with the upload: show that phase from the first frame (the job reports it again).
    setJobPhase(tool.runtime === "server" ? { phase: "upload", fraction: 0 } : null);
    setPillDone(false);
    setPagesDim(false);
    setPhase("processing");
    announce(tool.flow.progressLabel);
    const started = performance.now();
    try {
      // The pill shows on the click (F25 §6, eval G-13): let it paint before the work starts.
      await new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)));
      if (controller.signal.aborted) return;
      setPagesDim(true);
      const out = await processFiles(
        ready,
        controller.signal,
        (v, ph) => {
          setProgress(v);
          setProgressPhase(ph);
          sayProgress({ phase: "work", fraction: v });
        },
        {
          onPhase: (p) => {
            if (controller.signal.aborted) return;
            setJobPhase(p);
            if (typeof p.fraction === "number") setProgress(p.fraction);
            sayProgress(p);
          },
          onCancel: (fn) => (serverCancel.current = fn),
        },
      );
      const wait = MIN_PROCESSING_MS - (performance.now() - started);
      if (wait > 0) await sleep(wait);
      if (controller.signal.aborted) return;
      setProgress(1);
      // The done tick (leaf, "Done") holds, then the stage becomes the result (T12).
      setPillDone(true);
      announce(copy.done);
      await Promise.all([sleep(DONE_HOLD_MS), loadResult().catch(() => {})]);
      if (controller.signal.aborted) return;
      // The work area fades out (120ms, inert at once) and the result rises in its place (T12). The pill
      // that holds focus is about to go: park focus on the tool heading until the result focuses Download.
      heading.current?.focus({ preventScroll: true });
      await exit(workArea.current, "result");
      if (controller.signal.aborted) return settle(workArea.current);
      setOutput(out);
      for (const w of out.warnings ?? []) pushNotice({ tone: "warning", title: w });
      setPagesDim(false);
      setPhase("done");
      setPillDone(false);
      announce(copy.resultTitle(out.type === "application/zip"));
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : "unknown error";
      console.error(`[${tool.slug}] processing failed:`, message.startsWith(USER_ERROR) ? "user-facing error" : message);
      const shown = message.startsWith(USER_ERROR) ? message.slice(USER_ERROR.length) : null;
      setProcessMessage(shown);
      setPagesDim(false);
      setPhase("error");
      // The full reason and what to do go in NoticeStack (assertive, never auto-dismissed), with Start over.
      errorNotice.current = pushNotice({ tone: "danger", title: shown ?? copy.errorProcess(tool.flow.progressLabel), action: { label: copy.startOver, onClick: () => startOverRef.current() } });
    }
  }, [announce, dismissNotice, processFiles, pushNotice, sayProgress, tool.flow.progressLabel, tool.runtime, tool.slug]);
  const submitRef = useRef<() => void>(() => {});
  submitRef.current = () => {
    if (flowCanRun) void run(); // run() itself ignores a second call while one is processing
  };

  // Cancel really stops the work (F25 §6): the worker is terminated (runInWorker rejects on abort) and a
  // server job is deleted (DELETE /jobs/{id}). The slot is back to rest at once and focus returns to the primary.
  const [focusPrimaryTick, setFocusPrimaryTick] = useState(0);
  const cancel = useCallback(async () => {
    if (phaseRef.current !== "processing") return;
    const server = serverCancel.current;
    serverCancel.current = null;
    abort.current?.abort();
    settle(workArea.current);
    setPhase("idle");
    phaseRef.current = "idle";
    setPillDone(false);
    setJobPhase(null);
    setProgress(0);
    announce(copy.cancelled);
    setFocusPrimaryTick((n) => n + 1);
    // The primary is back on this click; the pages wake a frame later (review S6): taking inert off 990
    // tiles restyles every one (~0.5s), which must not hold the primary's paint.
    // (A run started meanwhile dims them again after its own frame, which comes later.)
    requestAnimationFrame(() => setTimeout(() => setPagesDim(false)));
    if (tool.runtime !== "server" && !server) return void pushNotice({ tone: "info", title: copy.cancelledBrowser, timeoutMs: 6000 });
    // "Deleted" only once DELETE answered 2xx. Cancelled mid-upload there is no job id yet, so the upload
    // may still land and is deleted by the 2-hour rule. A late reply never speaks over a newer run.
    const runAtCancel = runGen.current;
    const deleted = server ? await server() : false;
    if (runGen.current !== runAtCancel) return;
    pushNotice({ tone: "info", title: deleted ? copy.cancelledServer : copy.cancelledServerLater, timeoutMs: 8000 });
  }, [announce, pushNotice, tool.runtime]);
  useEffect(() => {
    if (focusPrimaryTick) primaryButton.current?.focus();
  }, [focusPrimaryTick]);

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
    runGen.current++;
    serverCancel.current = null;
    errorNotice.current = null;
    setPillDone(false);
    setJobPhase(null);
    for (const f of filesRef.current) releaseDoc(f.id);
    updateFiles(() => []);
    setOutput(null);
    setCloudLine(null);
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
  const startOverRef = useRef(startOver);
  startOverRef.current = startOver;

  // Back to editing (T12 reversed): the work area is back at once and fades in (200ms; opacity only).
  // Options, selection and marks are intact; focus moves to the tool heading (F25 AC-648).
  const resultCard = useRef<HTMLElement>(null);
  const [workBack, setWorkBack] = useState(0);
  const backToOptions = useCallback(() => {
    heading.current?.focus({ preventScroll: true });
    setOutput(null);
    setCloudLine(null);
    setPhase("idle");
    setWorkBack((n) => n + 1);
  }, []);
  useLayoutEffect(() => {
    if (workBack) enter(workArea.current, "overlay");
  }, [workBack]);

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

  // The fixing tool for an error (F25 §6): Repair PDF for a damaged file, only once that tool is usable.
  const fixFor = (message: string | null | undefined): FlowTool | null => {
    if (!message || !/damaged|couldn.t be opened/i.test(message) || tool.slug === "repair-pdf") return null;
    const t = toolBySlug("repair-pdf");
    return t && isUsable(t) ? (t as FlowTool) : null;
  };
  const continueWithFiles = (target: FlowTool) => {
    setHandoff(
      target.slug,
      files.map((f) => new File([f.source], f.name, { type: f.source.type || "application/pdf" })),
    );
    router.push(`/${target.slug}`);
  };

  // Hand-off from another tool's result screen.
  useEffect(() => {
    const handed = takeHandoff(tool.slug);
    if (handed) void intake(handed, null);
  }, [intake, tool.slug]);

  // Closing or leaving the tab mid server job (a full navigation never unmounts React): the job is
  // deleted with a keepalive DELETE, which outlives the page.
  useEffect(() => {
    if (phase !== "processing") return;
    const onHide = () => {
      const server = serverCancel.current;
      serverCancel.current = null;
      if (server) void server();
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [phase]);

  // On unmount: stop any running job, shut the processing worker down and
  // release the pdf.js documents.
  useEffect(() => {
    const map = docs.current;
    return () => {
      // Leaving mid server job deletes it too (the DELETE is sent with keepalive, so it outlives the page).
      const server = serverCancel.current;
      serverCancel.current = null;
      abort.current?.abort();
      if (server) void server();
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
      }
    } catch {}
  }, []);
  useEffect(() => {
    // Each thumbnail redraws for its new box itself (PageThumb measures it); only the choice is kept here.
    const t = setTimeout(() => {
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
      submit: () => submitRef.current(),
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
  const watch = watcher?.watch ?? null;
  const thumbs = useMemo(() => ({ renderer, watch }), [renderer, watch]);
  const ownerFile = ownerFor ? readyFiles.find((f) => f.id === ownerFor) : undefined;

  // Page tools state the outcome while the primary can run (I-7, AC-545); the plain verb otherwise.
  const actionText = canPrimary && primaryLabel ? primaryLabel() : flow.actionLabel;
  // The label the run was started with (the marks and choices are kept on the result): Download takes its box.
  const ranText = primaryLabel ? primaryLabel() : flow.actionLabel;
  const primary = (
    <Button ref={primaryButton} variant="primary" size="lg" className="ip-slot__main max-[359px]:px-4" disabled={!canPrimary} aria-describedby={statusId} onClick={run} data-testid="primary-action">
      {/* Sized to fit "Download" too (layout.css .ip-slot__size): Download takes this exact box (eval G-3). */}
      <span className="ip-slot__size ip-slot__size--dl" data-size={copy.download}>
        <span>{actionText}</span>
      </span>
    </Button>
  );
  const working = state === "processing";
  // The action slot (F25 §6): rest, the pill, the error or (on the result) Download, in one box that never resizes.
  const fix = state === "error" ? fixFor(processMessage) : null;
  const C = chrome;
  const slot = !C ? null : working ? (
    <C.ProgressPill
      ref={progressBox}
      action={flow.actionLabel}
      onCancel={() => void cancel()}
      state={
        pillDone
          ? { phase: "done", verb: flow.progressLabel }
          : jobPhase && jobPhase.phase !== "work"
            ? { ...jobPhase, verb: flow.progressLabel }
            : { phase: "work", fraction: jobPhase && jobPhase.fraction === undefined ? undefined : progress, verb: flow.progressLabel, note: progressPhase === "fonts" ? copy.preparingFonts : undefined }
      }
    />
  ) : state === "error" ? (
    <C.SlotError
      ref={retryButton}
      line={C.shortError(processMessage ?? copy.errorProcess(flow.progressLabel))}
      onRetry={run}
      fix={fix ? { label: fix.name, onClick: () => continueWithFiles(fix) } : undefined}
    />
  ) : state === "done" && output ? (
    resultParts ? (
      <resultParts.ResultDownload output={output} tool={tool} announce={announce} onSaved={setCloudLine} sizeAs={ranText} />
    ) : (
      <LazyResultDownload output={output} tool={tool} announce={announce} onSaved={setCloudLine} sizeAs={ranText} />
    )
  ) : (
    <>
      <C.SlotStatus id={statusId} text={statusText} extra={state === "ready" && runCheck === true ? readyNote : undefined} />
      {primary}
    </>
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
      // Without an Add menu, a multi-file tool's picker drops its word below 400 px (a 44 px icon button,
      // its name kept for assistive tech) so the tools row stays one row (F4/F5 P-3, Alternate & mix).
      className={phoneAddMenu ? "shadow-tool-lift max-lg:hidden" : solo ? "size-11 px-0" : flow.multiFile ? "shadow-tool-lift max-[399px]:size-11 max-[399px]:px-0" : "shadow-tool-lift"}
      labelClassName={solo ? "sr-only" : !phoneAddMenu && flow.multiFile ? "max-[399px]:sr-only" : undefined}
      icon={<PlusIcon size={16} />}
      disabled={state === "processing"}
      onFiles={(f, t) => void intake(f, t, { replace: !flow.multiFile })}
      inputTestId="file-input"
    />
  );
  const pickerHint = () => <p className="hidden text-sm text-muted [@media(pointer:fine)]:block">{copyOverrides?.pickerHint ?? (flow.multiFile ? copy.pickerHint : copy.pickerHintOne)}</p>;
  const previewDialog = () => (
    <PagePreviewDialog
      target={previewTarget}
      renderer={renderer}
      onNavigate={(at) => setPreview((p) => (p ? { ...p, at } : p))}
      onClose={() => setPreview(null)}
      fallbackFocus={() => heading.current}
    />
  );
  const pwOpen = (!!currentLocked || !!pwSubmitting) && state !== "done";
  const pwMounted = useMountOnce(pwOpen);
  const ownerMounted = useMountOnce(!!ownerFile);
  const leaveMounted = useMountOnce(guardLeave);
  const replaceMounted = useMountOnce(!!pendingReplace);
  const dimOn = { "data-dim": "", inert: true };
  const dim = working ? dimOn : {};
  // Set a frame after the pill shows and cleared a frame after the run ends (see run and cancel).
  const dimPages = pagesDim ? dimOn : {};
  const options = renderOptions(ctx);
  const rowPicker =
    process.env.NEXT_PUBLIC_CLOUD_SOURCES === "1"
      ? cloneElement(toolbarPicker(), {
          sources: <CloudCaret hub={cloud!} look="tool" className={phoneAddMenu ? "max-lg:hidden" : undefined} disabled={state === "processing"} />,
        })
      : toolbarPicker();
  const dock = loaded && C && (
    <C.ControlDock
      label={`${tool.name} options`}
      layout={wide ? (settings ? "side" : "row") : "bar"}
      start={dockStart?.(ctx)}
      rowOptions={wide && !settings ? rowOptions?.(ctx) : undefined}
      optionsDisabled={optionsDisabled}
      options={settings && wide ? null : options}
      more={renderMore?.(ctx)}
      add={solo && rowPicker}
      density={flow.optionsDensity}
      dimmed={working}
      bare={state === "done"}
      sheet={{
        title: wide ? "More options" : `${tool.name} options`,
        badge: optionsBadge,
        footer: (close) => (
          <>
            <Button variant="secondary" className="flex-1 lg:flex-none" onClick={close}>
              Done
            </Button>
            {/* The phone sheet covers the dock, so it repeats the primary; the popover (>= 1024) does not:
                the primary lives only in the slot there (eval G-7). */}
            {!wide && (
              <Button
                variant="primary"
                className="flex-1"
                disabled={!canPrimary}
                onClick={() => {
                  close();
                  void run();
                }}
              >
                {actionText}
              </Button>
            )}
          </>
        ),
      }}
      slot={slot}
    />
  );
  return (
    <div data-state={state} data-hydrated={watcher ? "" : undefined} data-testid="tool-flow" className="ip-flow" style={thumbSize === THUMB_DEFAULT ? undefined : { ["--ip-thumb-size" as string]: `${thumbSize}px` }}>
      <DropOverlay active={dragging && acceptsDrop} mode={flow.multiFile || files.length === 0 ? "add" : "replace"} />
      <LiveRegion message={message} />
      {/* The head: the centred h1 while empty; once a file is in, the sticky top row (F25 §3) with the dock
          as its right part from 1024 px. Below 1024 px the dock is fixed to the bottom and sits outside the
          row, so the row holds only the h1 (AC-612); it follows the head in the DOM either way. */}
      <ToolIntro ref={heading} title={flow.title} row={loaded}>
        {wide && dock}
      </ToolIntro>
      {!wide && dock}

      {state === "empty" ? (
        // The picker card, alone (F25 §2): no options panel, no dock, centred in the first screen.
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
          {/* Every file undone (F5 history): the files are only held, so Undo│Redo stays reachable here,
              under the card, to bring them back. Never on a fresh visit or after Start over. */}
          {workspaceEmpty && files.length > 0 && dockStart && <div className="mt-4 flex justify-center">{dockStart(ctx)}</div>}
        </DropCard>
      ) : state === "done" && output ? (
        // Its own key: the work area's element (faded out and inert by T12) is never reused for the result.
        <div key="result" className="ip-wide relative rounded-panel border-[1.5px] border-sand bg-cream px-3 sm:px-5 lg:mt-2">
          {(() => {
            const Card = resultParts ? resultParts.ResultCard : LazyResultCard;
            return (
              <Card
                ref={resultCard}
                output={output}
                tool={tool}
                continueTargets={continueTargets(output.type)}
                onContinue={continueWith}
                onStartOver={startOver}
                onBack={backToOptions}
                announce={announce}
                cloudLine={cloudLine}
              />
            );
          })()}
        </div>
      ) : (
        // The stage (F25 §3): the cream panel under the row, --ip-stage-h tall from 1024 px, holding the tools
        // row and the pages (they scroll inside it with a slim BerryPDF bar). Below 1024 px the page scrolls
        // and the tools row sticks under the header. A settings tool adds its options panel on the right.
        <div key="work" ref={workArea} className={settings ? "ip-wide lg:mt-2 lg:grid lg:grid-cols-[minmax(0,1fr)_var(--ip-dock-w)] lg:items-start lg:gap-6" : "ip-wide lg:mt-2"}>
          <section aria-label="Your files" className="min-w-0">
            {/* Below 1024 px the panel clips to its rounded corners (overflow: clip keeps the row sticky) and the
                row is square: at rest the panel rounds it, and once stuck under the header its corners cover the
                pages scrolling by (visual gate round 2). */}
            <div className="relative rounded-panel border-[1.5px] border-sand bg-cream px-3 max-lg:overflow-clip sm:px-5 lg:flex lg:h-(--ip-stage-h) lg:flex-col">
              <div className={`${solo ? "max-sm:hidden " : ""}sticky top-(--ip-header-h) z-10 -mx-3 flex h-[64px] shrink-0 items-center gap-2 bg-cream px-3 max-[359px]:gap-1.5 max-[359px]:px-2 sm:-mx-5 sm:gap-3 sm:px-5 lg:static lg:gap-4 lg:rounded-t-panel`}>
                {showViewToggle && (
                  <SegmentedControl
                    look="tabs"
                    label="View"
                    // Below 360 px tighter tabs (and gaps) keep the tools row to one row (F4/F5 P-3), cloud caret included.
                    className="shrink-0 max-[359px]:[&_.mp-tab]:px-2"
                    value={view}
                    onChange={setViewChoice}
                    options={
                      flow.defaultView === "files" || viewToggleFromOneFile
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
                {!solo && <span className="ms-auto">{rowPicker}</span>}
                {toolbarEnd?.(wctx)}
              </div>
              <div
                ref={setScrollArea}
                // overflow-x clip: a page turning in a tile is briefly wider than its tile (page tiles have a 4px
                // edge); it must never widen the page (phones zoom out) or flash a sideways scroll bar.
                data-testid="pages-scroll"
                className="ip-scroll ip-dimmable flex flex-col gap-4 overflow-x-clip pt-3 pb-6 max-lg:-mx-2 max-lg:min-h-[calc(var(--ip-thumb-size)+76px)] max-lg:px-2 lg:-mx-5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:px-5"
                data-ip-scroll="pages"
                onPointerDownCapture={blockWhileWorking}
                onClickCapture={blockWhileWorking}
                {...dimPages}
              >
                {ownerBlocked.map((f) => (
                  <OwnerPermissionNotice
                    key={f.id}
                    fileName={f.name}
                    denied={flow.requiredPermissions.filter((p) => f.denied.includes(p))}
                    onEnterPassword={() => setOwnerFor(f.id)}
                  />
                ))}
                <ThumbContext.Provider value={thumbs}>
                  {/* While the work runs the pages hold still: not re-rendered on every progress tick (990 tiles
                      took ~1s of main thread at the click, eval G-13). The area dims and goes inert around them. */}
                  <HoldWhile hold={state === "processing" || pagesDim}>
                  {renderWorkspace ? (
                    renderWorkspace(wctx)
                  ) : view === "pages" ? (
                    <PageGrid
                      files={files}
                      decorate={decorate}
                      renderActions={renderPageActions}
                      onPageKey={onPageKey}
                      onTileActivate={onTileActivate}
                      renderGap={renderGap && ((f, i, t) => renderGap(f, i, t, state === "processing" || state === "done"))}
                      gridHint={gridHint}
                      onRemove={(f) => removeFile(f.id)}
                      onOpen={(f, i) =>
                        setPreview({ items: Array.from({ length: f.pageCount }, (_, k) => ({ fileId: f.id, index: k, rotation: decorate(f, k).pendingDelta })), at: i })
                      }
                      dimmed={state === "processing"}
                    />
                  ) : (
                    <FileGrid files={files} onRemove={(f) => removeFile(f.id)} />
                  )}
                  </HoldWhile>
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
            </div>
          </section>
          {settings && wide && (
            // The settings panel (F25 §4): the numbered steps (dock-side: forms), as tall as the stage and growing
            // with its steps (never an inner scroller: the page scrolls while the sticky row keeps the primary in view).
            <aside
              aria-label={`${tool.name} options`}
              data-ip-options="side"
              className="flex min-h-(--ip-stage-h) flex-col rounded-[20px_20px_28px_20px] border-[1.5px] border-panel-border bg-surface-raised p-6 shadow-card"
            >
              <fieldset disabled={optionsDisabled} className="ip-dimmable min-w-0" data-testid="dock-options" {...dim}>
                <legend className="sr-only">{`${tool.name} options`}</legend>
                <h2 className="sr-only">Options</h2>
                {options}
              </fieldset>
            </aside>
          )}
        </div>
      )}

      <NoticeStack notices={notices} onDismiss={dismissNotice} />

      {pwMounted && <PasswordDialog
        open={pwOpen}
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
      />}
      {ownerMounted && <OwnerPasswordDialog
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
      />}
      {leaveMounted && <LeaveGuard active={guardLeave} />}
      {replaceMounted && <ReplaceFileDialog
        open={!!pendingReplace}
        fileName={files[0]?.name ?? ""}
        onCancel={() => setPendingReplace(null)}
        onConfirm={() => {
          const next = pendingReplace;
          setPendingReplace(null);
          if (next) void intake(next, null, { replace: true });
        }}
      />}
    </div>
  );
}

/**
 * See `inspectPdf`. `scan` reads the file (off the main thread) for whatever `notice` needs. It is
 * called on each load attempt (a password retry too), so it scans a file once and never rejects:
 * a file that fails to open never reads its result.
 */
export type PdfInspector = { scan: (file: Blob) => Promise<unknown>; notice: (name: string, doc: OpenedPdf["doc"], scanned: unknown) => Promise<string | null> };
