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
  /** "image" for picture inputs (one page per image, or per TIFF frame). */
  kind?: "pdf" | "image";
  /** The picked File's lastModified (0 when unknown). */
  lastModified?: number;
};

/** A file the tool can process (parsed and unlocked). */
export type ReadyFile = LoadedFile & { status: "ready"; pages: PageSize[] };

export type ToolOutput = {
  name: string;
  type: "application/pdf" | "application/zip";
  blob: Blob;
  size: number;
  pageCount?: number;
  entries?: { name: string; pageCount: number }[];
  wasEncrypted: boolean;
  /** Non-blocking notes about the result, shown as warning notices. */
  warnings?: string[];
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
