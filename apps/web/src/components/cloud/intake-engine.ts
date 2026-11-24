/**
 * F23: the part of the cloud intake that runs once a window is open (loaded on first use, so
 * tool pages do not ship it up front). Mirrors the window's downloads as cards, and hands every
 * file that passes the protocol and screening checks to `intake` in the order a local batch would
 * have. Waiting, blocked, unreachable, denied and offline states float as notices (no alert()).
 */
import { openCloudWindow, type CloudSession } from "@/lib/cloud/client";
import { writeLast } from "@/lib/cloud/last-used";
import type { OpenedWindow, WindowParams } from "@/lib/cloud/opener";
import { screenIncoming, type ErrorCode, type SkipReason } from "@/lib/cloud/protocol";
import { routeFor, type CloudProvider } from "@/lib/cloud/providers";
import { transferCopy } from "./transfer-copy";
import { showOffline, type CloudOpenOptions, type Entry, type IntakeDeps } from "./useCloudIntake";

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

export type IntakeHost = {
  deps: () => IntakeDeps;
  setEntries: (e: Entry[]) => void;
  /** Remembers where an accepted file came from (AC-131). */
  markOrigin: (file: File, provider: CloudProvider) => void;
};

export type Begin = {
  provider: CloudProvider;
  trigger: HTMLElement | null;
  opts: CloudOpenOptions;
  params: WindowParams;
  /** The window opened in the click handler; null: the browser blocked it. */
  opened: OpenedWindow | null;
  /** Opens again (runs synchronously in the notice button's click). */
  again: () => void;
};

export function createIntake(host: IntakeHost) {
  const d = host.deps;
  let entries: Entry[] = [];
  const update = (fn: (prev: Entry[]) => Entry[]) => {
    entries = fn(entries);
    host.setEntries(entries);
  };
  const sessions = new Map<string, SessionState>();

  const flush = (s: SessionState) => {
    if (!s.problems.length) return;
    const p = s.problems.splice(0);
    d().pushNotice(p.length === 1 ? { tone: "danger", title: p[0] } : { tone: "danger", title: d().problemsTitle(p.length), items: p });
  };

  /** Hands over the longest run of finished files at the front of the request's order. */
  const deliver = (s: SessionState) => {
    const ready: File[] = [];
    while (s.delivered < s.order.length) {
      const e = entries.find((x) => x.req === s.session.req && x.id === s.order[s.delivered]);
      if (e && !e.resolved) break;
      if (e?.file) ready.push(e.file);
      s.delivered++;
    }
    const done = new Set(s.order.slice(0, s.delivered));
    if (entries.some((x) => x.req === s.session.req && done.has(x.id))) update((prev) => prev.filter((x) => !(x.req === s.session.req && done.has(x.id))));
    if (!ready.length) return;
    s.gotFiles = true;
    void d().intake(ready, s.trigger, { tag: s.opts.tag, replace: s.opts.replace && s.received === ready.length ? true : undefined });
  };

  const endSession = (req: string, reason: "done" | "cancel" | "lost") => {
    const s = sessions.get(req);
    if (!s) return;
    sessions.delete(req);
    if (s.waitNotice) d().dismissNotice(s.waitNotice);
    // A closed window can no longer retry: unfinished cards go.
    for (const e of entries) if (e.req === req && !e.file) e.resolved = true;
    deliver(s);
    update((prev) => prev.filter((x) => x.req !== req));
    flush(s);
    if (s.gotFiles) writeLast(s.provider);
    else if (reason !== "done") {
      // Back to where it was: focus the control that opened the window once this tab is in front.
      const back = () => {
        const t = s.trigger;
        if (t?.isConnected && (document.activeElement === document.body || !document.activeElement)) t.focus();
      };
      if (document.hasFocus()) back();
      else window.addEventListener("focus", back, { once: true });
    }
  };

  const showError = (p: CloudProvider, code: ErrorCode | "blocked", retry: () => void) => {
    const n = d();
    if (code === "blocked") n.pushNotice({ tone: "warning", title: transferCopy.blocked(p), body: transferCopy.blockedBody, action: { label: transferCopy.tryAgain, onClick: retry, autoFocus: true }, inlineAction: true, sticky: true });
    else if (code === "offline") showOffline(n, p);
    else if (code === "denied") n.pushNotice({ tone: "warning", title: transferCopy.denied(p), body: transferCopy.deniedBody, action: { label: transferCopy.tryAgain, onClick: retry }, inlineAction: true, sticky: true });
    else n.pushNotice({ tone: "danger", title: transferCopy.unreachable(p), body: transferCopy.unreachableBody, action: { label: transferCopy.tryAgain, onClick: retry }, inlineAction: true });
  };

  function begin({ provider, trigger, opts, params, opened, again }: Begin) {
    const { tool, announce, pushNotice, dismissNotice } = d();
    if (opened === null) return showError(provider, "blocked", again);
    // One cloud window at a time: a window still waiting for a pick is replaced.
    for (const [r, s] of sessions) {
      if (!entries.some((e) => e.req === r) && !s.gotFiles) {
        s.session.cancel();
        if (s.waitNotice) dismissNotice(s.waitNotice);
        sessions.delete(r);
      }
    }
    const req = params.req;
    const limits = { accept: tool.flow.accept, maxFileBytes: tool.flow.maxFileBytes, multiple: params.multiple };
    const box: { s?: SessionState } = {};
    const session = openCloudWindow(
      routeFor(provider),
      params,
      {
        onProgress: (id, name, loaded, total) => {
          const s = box.s;
          if (!s) return;
          if (s.waitNotice) {
            dismissNotice(s.waitNotice);
            s.waitNotice = null;
          }
          const key = `${req}:${id}`;
          const existing = entries.find((e) => e.key === key);
          if (!existing) {
            s.order.push(id);
            update((prev) => [...prev, { key, id, req, name, provider, loaded, total, status: "downloading", resolved: false }]);
            announce(transferCopy.liveDownloading(name, provider));
            // Keep the order a local batch would have (Merge sorts by name).
            const sort = d().sortIntake;
            if (sort) {
              const pending = s.order.slice(s.delivered);
              const names = new Map(pending.map((i) => [i, entries.find((e) => e.key === `${req}:${i}`)?.name ?? ""]));
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
          for (const sk of screened.skipped) s.problems.push(d().describeSkip(sk.name, sk.reason === "access" ? "type" : sk.reason));
          const ok = new Set(screened.accepted);
          for (const { id, file } of files) {
            const key = `${req}:${id}`;
            if (!entries.some((e) => e.key === key)) {
              s.order.push(id);
              update((prev) => [...prev, { key, id, req, name: file.name, provider, loaded: file.size, total: file.size, status: "arrived", resolved: false }]);
            }
            if (ok.has(file)) host.markOrigin(file, provider);
            update((prev) => prev.map((e) => (e.key === key ? { ...e, status: "arrived", loaded: e.total || file.size, file: ok.has(file) ? file : undefined, resolved: true } : e)));
          }
          deliver(s);
        },
        onSkipped: (items) => {
          const s = box.s;
          if (!s) return;
          for (const it of items) {
            s.problems.push(it.reason === "access" ? transferCopy.notAccessible(it.name, provider) : d().describeSkip(it.name, it.reason as Exclude<SkipReason, "access">));
            const e = it.id ? entries.find((x) => x.key === `${req}:${it.id}`) : undefined;
            if (e) e.resolved = true;
          }
          deliver(s);
        },
        onFailed: (id, name) => {
          update((prev) => prev.map((e) => (e.key === `${req}:${id}` ? { ...e, status: "failed" } : e)));
          announce(transferCopy.liveStopped(name));
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
      { opened },
    );
    if (!session) return showError(provider, "blocked", again);
    const state: SessionState = { session, provider, trigger, opts, order: [], delivered: 0, received: 0, problems: [], waitNotice: null, gotFiles: false };
    box.s = state;
    state.waitNotice = pushNotice({
      tone: "info",
      title: transferCopy.waiting(provider),
      busy: true,
      sticky: true,
      inlineAction: true,
      action: {
        label: transferCopy.cancel,
        onClick: () => {
          session.cancel();
          endSession(req, "cancel");
        },
      },
    });
    sessions.set(req, state);
    announce(transferCopy.liveOpening(provider));
  }

  return {
    begin,
    stop(key: string) {
      const e = entries.find((x) => x.key === key);
      if (!e) return;
      const s = sessions.get(e.req);
      s?.session.stop(e.id);
      e.resolved = true;
      update((prev) => prev.filter((x) => x.key !== key));
      d().announce(transferCopy.liveStopped(e.name));
      if (s) deliver(s);
    },
    retry(key: string) {
      const e = entries.find((x) => x.key === key);
      const s = e && sessions.get(e.req);
      if (!e || !s) return;
      s.session.retry(e.id);
      update((prev) => prev.map((x) => (x.key === key ? { ...x, status: "downloading", loaded: 0 } : x)));
      d().announce(transferCopy.liveDownloading(e.name, e.provider));
    },
    /** Closes every window this tab opened (the tool went away). */
    dispose() {
      for (const s of sessions.values()) s.session.cancel();
      sessions.clear();
    },
  };
}

export type Intake = ReturnType<typeof createIntake>;
