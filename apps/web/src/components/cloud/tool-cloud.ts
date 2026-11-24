"use client";
/**
 * F23 cloud sources on tool pages: the only cloud code in a tool page's first-load JS, so it is kept
 * to a few lines of state. Everything else (the caret, the row, the cards, Merge's menus, Save to
 * cloud and the intake) is one chunk, ui.ts, fetched as the page hydrates. Those controls get the
 * page's CloudCtrl and open windows with it inside the click (intake-engine.ts openCloud).
 *
 * Builds without NEXT_PUBLIC_CLOUD_SOURCES=1 swap this module for tool-cloud.off.ts (next.config.ts)
 * and never call it (AC-120).
 */
import { useEffect, useMemo, useState } from "react";
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
};

/** What the tool page shows of the cloud intake (set by the engine). */
export type CloudState = {
  downloads: CloudDownload[];
  pending: number;
  statusText: string | null;
  /** The result's privacy line for a file from a provider (AC-131). */
  privacy: ((p: CloudProvider) => string) | null;
  /** The provider a file came from, if it came from one. */
  origin: ((file: Blob) => CloudProvider | undefined) | null;
};
const IDLE: CloudState = { downloads: [], pending: 0, statusText: null, privacy: null, origin: null };

/** One per tool page, stable for its life: the intake's state setter and inputs, and the intake once made. */
export type CloudCtrl = {
  set: (s: CloudState) => void;
  deps?: CloudDeps;
  intake?: Intake;
  /** A local pick: "This device" becomes the last used source (set once ui.ts has loaded). */
  local?: () => void;
};

/** A provider is configured in this build (public IDs, or the mock): a build-time constant. */
export const cloudReady =
  process.env.NEXT_PUBLIC_CLOUD_MOCK === "1" ||
  process.env.NODE_ENV !== "production" ||
  !!(process.env.NEXT_PUBLIC_DROPBOX_APP_KEY || process.env.NEXT_PUBLIC_ONEDRIVE_CLIENT_ID || (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID && process.env.NEXT_PUBLIC_GOOGLE_API_KEY && process.env.NEXT_PUBLIC_GOOGLE_APP_ID));

/** The page's cloud state (a new object only when the engine publishes) and its CloudCtrl (never changes). */
export function useCloud() {
  const [state, setState] = useState(IDLE);
  const [ctrl] = useState<CloudCtrl>(() => ({ set: setState }));
  useEffect(() => {
    // The dynamic() controls import the same chunk.
    void import("./ui").then((m) => m.attach(ctrl));
    // Close every window this tab opened when the tool goes away.
    return () => ctrl.intake?.dispose();
  }, [ctrl]);
  return useMemo(() => ({ state, ctrl }), [state, ctrl]);
}
