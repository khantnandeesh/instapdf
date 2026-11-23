import type { Permission } from "@/tools/registry";
import type { PageSize } from "@/lib/pdf/pdfjs";

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
};

export type FlowState = "empty" | "loading" | "password" | "ready" | "processing" | "done" | "error";

/** `phase` "fonts" shows "Preparing fonts…" with an indeterminate bar until the next call without it. */
export type ProcessFn = (files: ReadyFile[], signal: AbortSignal, onProgress: (fraction: number, phase?: "fonts" | "pages") => void) => Promise<ToolOutput>;

/** What the tool tells the grid about one page. */
export type PageDecoration = {
  /** Pending display rotation in degrees (unbounded, for the CSS transform). */
  pendingDelta: number;
  inScope: boolean;
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
};

export type FlowNoticeInput = {
  id: string;
  tone: "info" | "success" | "warning" | "danger";
  title: string;
  body?: string;
  items?: string[];
  action?: { label: string; onClick: () => void };
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
