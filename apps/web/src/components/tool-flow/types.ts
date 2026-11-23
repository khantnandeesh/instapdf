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

export type ProcessFn = (files: ReadyFile[], signal: AbortSignal, onProgress: (fraction: number) => void) => Promise<ToolOutput>;

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
