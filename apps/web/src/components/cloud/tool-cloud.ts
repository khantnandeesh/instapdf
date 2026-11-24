"use client";
/**
 * F23 cloud sources on tool pages: the only cloud code in a tool page's first-load JS, so it is kept
 * to a few lines of state. Everything else (the caret, the row, the cards, Save to cloud, Merge's
 * menus and the intake) is one chunk, ui.ts, which the page's server-rendered cloud parts load as it
 * hydrates. They hand this hub to the intake (intake-engine.ts attach), which opens each window
 * inside its click.
 *
 * The cloud stylesheet comes in here, with the page's own CSS: the cloud chunk then has none, so
 * the webpack runtime on every page keeps a single lazy stylesheet, as before F23.
 *
 * Builds without NEXT_PUBLIC_CLOUD_SOURCES=1 swap this module for tool-cloud.off.ts (next.config.ts)
 * and never call it (AC-120).
 */
import "./cloud.css";
import { useEffect, useState } from "react";
import type { CloudProvider } from "@/lib/cloud/providers";
import type { FlowTool } from "@/tools/registry";
import type { FlowNoticeInput } from "../tool-flow/types";
import type { Intake } from "./intake-engine";

export type CloudOpenOptions = { tag?: unknown; multiple?: boolean; replace?: boolean };

export type CloudDownload = {
  key: string;
  id: string;
  req: string;
  name: string;
  provider: CloudProvider;
  loaded: number;
  total: number;
  status: "downloading" | "failed" | "arrived";
};

/** What the intake needs from the tool page: ToolFlow sets it on every render. */
export type CloudDeps = {
  tool: FlowTool;
  announce: (m: string) => void;
  intake: (files: File[], trigger: HTMLElement | null, opts: { tag?: unknown; replace?: boolean }) => Promise<void>;
  pushNotice: (n: Omit<FlowNoticeInput, "id">) => string;
  dismissNotice: (id: string) => void;
  /** Orders a batch like a local pick (Merge: natural name order). */
  sortIntake?: (files: File[]) => File[];
  /** The tool's own words for a file of the wrong type. */
  errorType?: (name: string) => string;
  /** The page's files (the result's privacy line names a cloud any came from, AC-131). */
  files: readonly { source: Blob }[];
};

/** What the tool page shows of the cloud intake (set by the engine). */
export type CloudState = {
  downloads: CloudDownload[];
  /** "Getting 2 files from Dropbox…" while files are on their way; null otherwise. */
  busy: string | null;
};

/** One per tool page, stable for its life: the intake's state and inputs, and the intake once made. */
export type CloudHub = {
  s: CloudState;
  set: (s: CloudState) => void;
  deps?: CloudDeps;
  intake?: Intake;
};

/** The page's cloud hub: the same object for the page's life, with the latest state on `s`. */
export function useCloud() {
  const [s, set] = useState<CloudState>({ downloads: [], busy: null });
  const [hub] = useState<CloudHub>(() => ({ s, set }));
  hub.s = s;
  // Close every window this tab opened when the tool goes away.
  useEffect(() => () => hub.intake?.dispose(), [hub]);
  return hub;
}
