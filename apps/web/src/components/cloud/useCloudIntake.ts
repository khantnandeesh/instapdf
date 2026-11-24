"use client";
/**
 * F23: brings files from Google Drive, Dropbox or OneDrive into a tool through the SAME intake
 * as a local pick (spec U-4 "ToolFlow"). Opens the provider's own `/cloud/<route>` window
 * synchronously in the click handler (opener.ts, a few lines), then loads the rest of the intake
 * (intake-engine.ts) on first use, so tool pages do not ship it up front. Messages the window sends
 * in the meantime are kept and replayed.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { writeLast } from "@/lib/cloud/last-used";
import { newRequestId, openWindowNow, type WindowParams } from "@/lib/cloud/opener";
import { configuredProviders, routeFor, type CloudProvider } from "@/lib/cloud/providers";
import type { FlowTool } from "@/tools/registry";
import type { FlowNoticeInput } from "../tool-flow/types";
import { cloudCopy } from "./copy";
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

export type Entry = CloudDownload & { file?: File; resolved: boolean };

export type IntakeDeps = {
  tool: FlowTool;
  intake: (files: File[], trigger: HTMLElement | null, opts: { tag?: unknown; replace?: boolean }) => Promise<void>;
  pushNotice: (n: Omit<FlowNoticeInput, "id">) => string;
  dismissNotice: (id: string) => void;
  announce: (m: string) => void;
  /** The F1 intake message for a skipped file. */
  describeSkip: (name: string, reason: "type" | "size") => string;
  problemsTitle: (n: number) => string;
  /** Orders a batch like a local pick (Merge: natural name order). */
  sortIntake?: (files: File[]) => File[];
};

const providers = configuredProviders();
/** Where each cloud file came from (for the result's privacy line, AC-131). */
let originMap: WeakMap<Blob, CloudProvider> | undefined;
const origins = () => (originMap ??= new WeakMap());
const originOf = (b: Blob) => origins().get(b);
const markLocal = () => writeLast("device");
const loadEngine = () => import("./intake-engine");

/** Offline: said here, not in the engine, which could not load without a connection. */
export const showOffline = (n: Pick<IntakeDeps, "pushNotice">, p: CloudProvider) =>
  void n.pushNotice({ tone: "info", title: cloudCopy.offline, body: cloudCopy.offlineBody(p), sticky: true });

export function useCloudIntake(deps: IntakeDeps) {
  const d = useRef(deps);
  d.current = deps;
  const [entries, setEntries] = useState<Entry[]>([]);
  const engine = useRef<Promise<Intake> | null>(null);
  const live = useRef<Intake | null>(null);
  const gone = useRef(false);

  const getEngine = useCallback(
    () =>
      (engine.current ??= loadEngine().then((m) => {
        const it = m.createIntake({ deps: () => d.current, setEntries: (e) => !gone.current && setEntries(e), markOrigin: (f, p) => origins().set(f, p) });
        live.current = it;
        return it;
      })),
    [],
  );

  // Close every window this tab opened when the tool goes away.
  useEffect(() => {
    gone.current = false;
    return () => {
      gone.current = true;
      live.current?.dispose();
    };
  }, []);

  /** Must run synchronously inside a click or key handler (the browser only allows a window then). */
  const open = useCallback(
    function open(provider: CloudProvider, trigger: HTMLElement | null, opts: CloudOpenOptions = {}) {
      const { flow } = d.current.tool;
      const multiple = opts.multiple ?? flow.multiFile;
      const params: WindowParams = { req: newRequestId(), accept: flow.accept.extensions.map((e) => e.toLowerCase()), multiple, max: flow.maxFileBytes, tool: flow.title, provider };
      if (typeof navigator !== "undefined" && navigator.onLine === false) return showOffline(d.current, provider);
      const opened = openWindowNow(routeFor(provider), params);
      getEngine().then(
        (it) => {
          if (gone.current) opened?.channel.close();
          else it.begin({ provider, trigger, opts, params, opened, again: () => open(provider, trigger, opts) });
        },
        () => {
          // The rest of the intake could not load (connection lost): the window sees its tool gone.
          engine.current = null;
          opened?.channel.close();
          showOffline(d.current, provider);
        },
      );
    },
    [getEngine],
  );

  const stop = useCallback((key: string) => live.current?.stop(key), []);
  const retry = useCallback((key: string) => live.current?.retry(key), []);

  const downloads: CloudDownload[] = useMemo(() => entries.map((e) => ({ key: e.key, id: e.id, req: e.req, name: e.name, provider: e.provider, status: e.status, loaded: e.loaded, total: e.total })), [entries]);
  const pending = entries.filter((e) => e.status !== "failed").length;
  const first = entries[0];
  return {
    providers,
    enabled: providers.length > 0,
    open,
    downloads,
    /** Cards are on screen (downloading, waiting their turn, or failed). */
    holding: entries.length > 0,
    /** Files still on their way: the flow is loading. */
    pending,
    statusText: pending && first ? cloudCopy.status(pending, first.provider) : null,
    stop,
    retry,
    /** Where a file came from (the result's privacy line, AC-131). */
    originOf,
    /** A local pick: "This device" becomes the last used source (U-12). */
    markLocal,
  };
}

export type CloudIntake = ReturnType<typeof useCloudIntake>;
