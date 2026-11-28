import type { Permission } from "@/tools/registry";
import type { PageSize } from "@/lib/pdf/pdfjs";
import type { ReactNode } from "react";
import type { PillProgress } from "./announce";

export type FileStatus = "loading" | "locked" | "ready";

/** A file in the current task. Bytes stay in `source` (a File/Blob in memory). */
export type LoadedFile = {
  id: string;
  name: string;
  size: number;
  source: Blob;
  status: FileStatus;
  /** 0 until the file is parsed. */
  pageCount: number;
  /** Displayed page sizes (own /Rotate applied); null until known. */
  pages: PageSize[] | null;
  password?: string;
  wasEncrypted: boolean;
  denied: Permission[];
  /** The file could not be opened here; only a tool that takes damaged files (Repair) lets it in. It shows as one placeholder page. */
  damaged?: boolean;
  /** "image" for picture inputs (one page per image, or per TIFF frame). */
  kind?: "pdf" | "image";
  /** The picked File's lastModified (0 when unknown). */
  lastModified?: number;
};

/** A file the tool can process (parsed and unlocked). */
export type ReadyFile = LoadedFile & { status: "ready"; pages: PageSize[] };

export type ToolOutput = {
  name: string;
  type: "application/pdf" | "application/zip" | "image/jpeg" | "image/png" | "image/tiff" | "text/plain";
  blob: Blob;
  size: number;
  pageCount?: number;
  /** A ZIP's files. `detail` replaces the "n pages" line for a file that is not a PDF ("1240 × 1754 px"). */
  entries?: { name: string; pageCount: number; detail?: string }[];
  /** What the result's meta line counts when it is not PDF pages ("3 images", "1,204 words"). */
  lead?: string;
  /** A picture of the result for the result card, when the output is not a PDF (an image, or the first image of a ZIP). */
  preview?: Blob;
  /** The start of a text result, shown in the result card instead of a page. */
  previewText?: string;
  /** A text result offers "Copy text" beside the download. */
  copyText?: string;
  wasEncrypted: boolean;
  /** Non-blocking notes about the result, shown as warning notices. */
  warnings?: string[];
  /** A sentence the result's meta line ends with ("3 pages deleted.", spec §7 item 2). */
  note?: string;
};

export type FlowState = "empty" | "loading" | "password" | "ready" | "processing" | "done" | "error";

/**
 * `phase` "fonts" shows "Preparing fonts…" with an indeterminate bar until the next call without it.
 * `job` (F25 §6): a server tool reports its upload / queue / work phases and registers what Cancel does.
 */
export type ProcessFn = (
  files: ReadyFile[],
  signal: AbortSignal,
  onProgress: (fraction: number, phase?: "fonts" | "pages") => void,
  job: { onPhase: (p: PillProgress) => void; onCancel: (cancel: () => Promise<boolean>) => void },
) => Promise<ToolOutput>;

/** What the tool tells the grid about one page. */
export type PageDecoration = {
  /** Pending display rotation in degrees (unbounded, for the CSS transform). */
  pendingDelta: number;
  inScope: boolean;
  // ---- page tools (spec F4/F5 UI P-6); Rotate sets none of them ----
  /** Extract: the page is picked (outline + tick badge). */
  picked?: boolean;
  /** Delete: the page is marked for removal (dimmed, trash badge, number struck through). */
  marked?: boolean;
  /** Split: the part that holds the page, and whether the page starts it (number disc). */
  part?: { n: number; first: boolean };
  /** Split: the page is in no part (dashed edge, dimmed). */
  leftOut?: boolean;
  /** The tile's accessible name, when the tool names it (default "Page n of N, rotation"). */
  label?: string;
  /** Toggle tiles (Extract, Delete): `aria-pressed` on the tile button. */
  pressed?: boolean;
  /** Flip: the page picture is shown mirrored ("none" keeps the turn animated back). */
  flip?: "horizontal" | "vertical" | "none";
  /** Crop: the part of the page that stays, in fractions of the page; the rest is dimmed. */
  keep?: { x: number; y: number; w: number; h: number };
  /** A picture of what the tool will add, drawn over the page (the stamping tools' preview). Decorative. */
  overlay?: ReactNode;
};

/** Context handed to the tool's options and page actions. */
export type FlowContext = {
  files: LoadedFile[];
  readyFiles: ReadyFile[];
  state: FlowState;
  /** True when options must not be used (empty, loading, processing...). */
  disabled: boolean;
  announce: (message: string) => void;
};

/** One page shown in the preview dialog. */
export type PreviewItem = { fileId: string; index: number; rotation: number };

/** What a tool with its own workspace can ask of the shared flow (spec F3 M-11 #1). */
export type FlowApi = {
  /** Same intake as a pick or a drop; `tag` comes back in `onFilesAdded`. */
  intake: (files: File[], trigger: HTMLElement | null, tag?: unknown) => Promise<void>;
  removeFiles: (ids: string[]) => void;
  pushNotice: (notice: Omit<FlowNoticeInput, "id">) => string;
  dismissNotice: (id: string) => void;
  announce: (message: string) => void;
  openPreview: (items: PreviewItem[], at: number) => void;
  setView: (view: "pages" | "files") => void;
  /** Draws a page with the shared renderer, `size` CSS px on its longer side; returns a cancel. `background`: after every page on screen. */
  renderPage: (fileId: string, index: number, size: number, onDone: (canvas: HTMLCanvasElement) => void, background?: boolean) => () => void;
  /** Opens the toolbar's file picker (Add files). */
  openPicker: () => void;
  /** Focus target when nothing better exists (the toolbar picker, else the heading). */
  fallbackFocus: () => HTMLElement | null;
  /**
   * Runs the primary action as a press would, when the flow can run (files ready, nothing
   * processing): Enter in a dock field. The tool checks its own settings first, from their live
   * values (the field's text as typed), since its `canRun` may not have rendered them yet.
   */
  submit: () => void;
};

export type FlowNoticeInput = {
  id: string;
  tone: "info" | "success" | "warning" | "danger";
  title: string;
  body?: string;
  items?: string[];
  /** F23 adds `node` and `icon` (see Notice; cloud/NoticeAction.tsx makes them). */
  action?: { label: string; onClick: () => void; node?: ReactNode; icon?: ReactNode };
  /** Kept when new files are added (other info and warning notices are cleared then). */
  sticky?: boolean;
  /** Auto-dismiss after this long (paused while hovered or focused). */
  timeoutMs?: number;
  onExpire?: () => void;
};

export type WorkspaceContext = FlowContext & {
  view: "pages" | "files";
  api: FlowApi;
  /** True while processing: the workspace is inert. */
  dimmed: boolean;
};
