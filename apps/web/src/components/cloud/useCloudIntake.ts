"use client";
/**
 * F23: brings files from Google Drive, Dropbox or OneDrive into a tool through the SAME intake
 * as a local pick (spec U-4 "ToolFlow"). Opens the provider's own `/cloud/<route>` window
 * synchronously in the click handler, mirrors its downloads as cards, and hands every file that
 * passes the protocol and screening checks to `intake` in the order a local batch would have.
 * Waiting, blocked, unreachable, denied and offline states float as notices (no alert()).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { openCloudWindow, type CloudSession } from "@/lib/cloud/client";
import { writeLast } from "@/lib/cloud/last-used";
import { newRequestId, screenIncoming, type ErrorCode, type SkipReason } from "@/lib/cloud/protocol";
import { configuredProviders, routeFor, type CloudProvider } from "@/lib/cloud/providers";
import type { FlowTool } from "@/tools/registry";
import type { FlowNoticeInput } from "../tool-flow/types";
import { cloudCopy } from "./copy";

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

type Entry = CloudDownload & { file?: File; resolved: boolean };

type SessionState = {
  session: CloudSession;
  provider: CloudProvider;
  trigger: HTMLElement | null;
  opts: CloudOpenOptions;
  order: string[];
  delivered: number;
  received: number;
  problems: string[];
  waitNotice: string | null;
  gotFiles: boolean;
};

type Deps = {
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

export function useCloudIntake(deps: Deps) {
  const d = useRef(deps);
  d.current = deps;
  const [entries, setEntries] = useState<Entry[]>([]);
  const entriesRef = useRef<Entry[]>([]);
  const update = useCallback((fn: (prev: Entry[]) => Entry[]) => {
    entriesRef.current = fn(entriesRef.current);
    setEntries(entriesRef.current);
  }, []);
  const sessions = useRef(new Map<string, SessionState>());

  // Close every window this tab opened when the tool goes away.
  useEffect(() => {
    const map = sessions.current;
    return () => {
      for (const s of map.values()) s.session.cancel();
      map.clear();
    };
  }, []);

  const flush = useCallback((s: SessionState) => {
    if (!s.problems.length) return;
    const p = s.problems.splice(0);
    d.current.pushNotice(p.length === 1 ? { tone: "danger", title: p[0] } : { tone: "danger", title: d.current.problemsTitle(p.length), items: p });
  }, []);

  /** Hands over the longest run of finished files at the front of the request's order. */
  const deliver = useCallback(
    (s: SessionState) => {
      const ready: File[] = [];
      while (s.delivered < s.order.length) {
        const e = entriesRef.current.find((x) => x.req === s.session.req && x.id === s.order[s.delivered]);
        if (e && !e.resolved) break;
        if (e?.file) ready.push(e.file);
        s.delivered++;
      }
      const done = new Set(s.order.slice(0, s.delivered));
      if (entriesRef.current.some((x) => x.req === s.session.req && done.has(x.id))) update((prev) => prev.filter((x) => !(x.req === s.session.req && done.has(x.id))));
      if (!ready.length) return;
      s.gotFiles = true;
      void d.current.intake(ready, s.trigger, { tag: s.opts.tag, replace: s.opts.replace && s.received === ready.length ? true : undefined });
    },
    [update],
  );

  const endSession = useCallback(
    (req: string, reason: "done" | "cancel" | "lost") => {
      const s = sessions.current.get(req);
      if (!s) return;
      sessions.current.delete(req);
      if (s.waitNotice) d.current.dismissNotice(s.waitNotice);
      // A closed window can no longer retry: unfinished cards go.
      for (const e of entriesRef.current) if (e.req === req && !e.file) e.resolved = true;
      deliver(s);
      update((prev) => prev.filter((x) => x.req !== req));
      flush(s);
      if (s.gotFiles) writeLast(s.provider);
      else if (reason !== "done") {
        // Back to where it was: focus the control that opened the window once this tab is in front.
        const back = () => {
          const t = s.trigger;
          if (t?.isConnected && document.activeElement === document.body) t.focus();
          else if (t?.isConnected && !document.activeElement) t.focus();
        };
        if (document.hasFocus()) back();
        else window.addEventListener("focus", back, { once: true });
      }
    },
    [deliver, flush, update],
  );

  const showError = useCallback((p: CloudProvider, code: ErrorCode | "blocked" | "offline", retry: () => void) => {
    const n = d.current;
    if (code === "blocked") n.pushNotice({ tone: "warning", title: cloudCopy.blocked(p), body: cloudCopy.blockedBody, action: { label: cloudCopy.tryAgain, onClick: retry, autoFocus: true }, inlineAction: true, sticky: true });
    else if (code === "offline") n.pushNotice({ tone: "info", title: cloudCopy.offline, body: cloudCopy.offlineBody(p), sticky: true });
    else if (code === "denied") n.pushNotice({ tone: "warning", title: cloudCopy.denied(p), body: cloudCopy.deniedBody, action: { label: cloudCopy.tryAgain, onClick: retry }, inlineAction: true, sticky: true });
    else n.pushNotice({ tone: "danger", title: cloudCopy.unreachable(p), body: cloudCopy.unreachableBody, action: { label: cloudCopy.tryAgain, onClick: retry }, inlineAction: true });
  }, []);

  /** Must run synchronously inside a click or key handler (the browser only allows a window then). */
  const open = useCallback(
    function open(provider: CloudProvider, trigger: HTMLElement | null, opts: CloudOpenOptions = {}) {
      const { tool, announce, pushNotice, dismissNotice } = d.current;
      const again = () => open(provider, trigger, opts);
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        showError(provider, "offline", again);
        return;
      }
      // One cloud window at a time: a window still waiting for a pick is replaced.
      for (const [req, s] of sessions.current) {
        if (!entriesRef.current.some((e) => e.req === req) && !s.gotFiles) {
          s.session.cancel();
          if (s.waitNotice) dismissNotice(s.waitNotice);
          sessions.current.delete(req);
        }
      }
      const req = newRequestId();
      const multiple = opts.multiple ?? tool.flow.multiFile;
      const limits = { accept: tool.flow.accept, maxFileBytes: tool.flow.maxFileBytes, multiple };
      const box: { s?: SessionState } = {};
      const session = openCloudWindow(
        routeFor(provider),
        { req, accept: tool.flow.accept.extensions.map((e) => e.toLowerCase()), multiple, max: tool.flow.maxFileBytes, tool: tool.flow.title, provider },
        {
          onProgress: (id, name, loaded, total) => {
            const s = box.s;
            if (!s) return;
            if (s.waitNotice) {
              dismissNotice(s.waitNotice);
              s.waitNotice = null;
            }
            const key = `${req}:${id}`;
            const existing = entriesRef.current.find((e) => e.key === key);
            if (!existing) {
              s.order.push(id);
              update((prev) => [...prev, { key, id, req, name, provider, loaded, total, status: "downloading", resolved: false }]);
              announce(cloudCopy.liveDownloading(name, provider));
              // Keep the order a local batch would have (Merge sorts by name).
              const sort = d.current.sortIntake;
              if (sort) {
                const pending = s.order.slice(s.delivered);
                const names = new Map(pending.map((i) => [i, entriesRef.current.find((e) => e.key === `${req}:${i}`)?.name ?? ""]));
                const files = pending.map((i) => Object.assign(new File([], names.get(i) ?? ""), { __id: i }));
                s.order = [...s.order.slice(0, s.delivered), ...sort(files).map((f) => (f as File & { __id: string }).__id)];
              }
            } else if (existing.status !== "arrived") {
              update((prev) => prev.map((e) => (e.key === key ? { ...e, loaded, total, status: "downloading" } : e)));
            }
          },
          onFiles: (files) => {
            const s = box.s;
            if (!s) return;
            const screened = screenIncoming(
              files.map((f) => f.file),
              limits,
              s.received,
            );
            s.received += screened.accepted.length;
            for (const sk of screened.skipped) s.problems.push(d.current.describeSkip(sk.name, sk.reason === "access" ? "type" : sk.reason));
            const ok = new Set(screened.accepted);
            for (const { id, file } of files) {
              const key = `${req}:${id}`;
              if (!entriesRef.current.some((e) => e.key === key)) {
                s.order.push(id);
                update((prev) => [...prev, { key, id, req, name: file.name, provider, loaded: file.size, total: file.size, status: "arrived", resolved: false }]);
              }
              if (ok.has(file)) origins().set(file, provider);
              update((prev) =>
                prev.map((e) => (e.key === key ? { ...e, status: "arrived", loaded: e.total || file.size, file: ok.has(file) ? file : undefined, resolved: true } : e)),
              );
            }
            deliver(s);
          },
          onSkipped: (items) => {
            const s = box.s;
            if (!s) return;
            for (const it of items) {
              s.problems.push(it.reason === "access" ? cloudCopy.notAccessible(it.name, provider) : d.current.describeSkip(it.name, it.reason as Exclude<SkipReason, "access">));
              const e = it.id ? entriesRef.current.find((x) => x.key === `${req}:${it.id}`) : undefined;
              if (e) e.resolved = true;
            }
            deliver(s);
          },
          onFailed: (id, name) => {
            update((prev) => prev.map((e) => (e.key === `${req}:${id}` ? { ...e, status: "failed" } : e)));
            announce(cloudCopy.liveStopped(name));
          },
          onError: (code) => {
            const s = box.s;
            if (s?.waitNotice) {
              dismissNotice(s.waitNotice);
              s.waitNotice = null;
            }
            showError(provider, code, again);
          },
          onDone: () => endSession(req, "done"),
          onClosed: (reason) => endSession(req, reason),
        },
      );
      if (!session) {
        showError(provider, "blocked", again);
        return;
      }
      const state: SessionState = { session, provider, trigger, opts, order: [], delivered: 0, received: 0, problems: [], waitNotice: null, gotFiles: false };
      box.s = state;
      state.waitNotice = pushNotice({
        tone: "info",
        title: cloudCopy.waiting(provider),
        busy: true,
        sticky: true,
        inlineAction: true,
        action: {
          label: cloudCopy.cancel,
          onClick: () => {
            session.cancel();
            endSession(req, "cancel");
          },
        },
      });
      sessions.current.set(req, state);
      announce(cloudCopy.liveOpening(provider));
    },
    [deliver, endSession, showError, update],
  );

  const stop = useCallback(
    (key: string) => {
      const e = entriesRef.current.find((x) => x.key === key);
      if (!e) return;
      const s = sessions.current.get(e.req);
      s?.session.stop(e.id);
      e.resolved = true;
      update((prev) => prev.filter((x) => x.key !== key));
      d.current.announce(cloudCopy.liveStopped(e.name));
      if (s) deliver(s);
    },
    [deliver, update],
  );

  const retry = useCallback(
    (key: string) => {
      const e = entriesRef.current.find((x) => x.key === key);
      const s = e && sessions.current.get(e.req);
      if (!e || !s) return;
      s.session.retry(e.id);
      update((prev) => prev.map((x) => (x.key === key ? { ...x, status: "downloading", loaded: 0 } : x)));
      d.current.announce(cloudCopy.liveDownloading(e.name, e.provider));
    },
    [update],
  );

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
