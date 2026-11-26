/**
 * F23: the cloud intake behind tool-cloud.tsx, in the cloud controls' chunk (ui.ts, never in a tool
 * page's first-load JS). Opens the `/cloud/<route>` window in the click, mirrors the window's
 * downloads as cards, and hands every file that passes the protocol and screening checks to `intake`
 * in the order a local batch would have. Waiting, blocked, unreachable, denied and offline states
 * float as notices (no alert()).
 */
import { openCloudWindow, type CloudSession } from "@/lib/cloud/client";
import { writeLast } from "@/lib/cloud/last-used";
import { MAX_FILES_PER_MESSAGE, newRequestId, screenIncoming, type ErrorCode, type SkipReason, type WindowParams } from "@/lib/cloud/protocol";
import { providerName, routeFor, type CloudProvider } from "@/lib/cloud/providers";
import { copy } from "../tool-flow/copy";
import { cloudCopy } from "./copy";
import { busyIcon, cloudAction } from "./NoticeAction";
import { pageHub, type CloudDeps, type CloudDownload, type CloudHub, type CloudOpenOptions, type PreOpened } from "./tool-cloud";
import { transferCopy } from "./transfer-copy";

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
  /** "Stopped waiting for OneDrive" (the window seems closed on its sign-in page). */
  stoppedNotice: string | null;
  gotFiles: boolean;
  /** Files the user stopped: whatever the window still sends for them is dropped. */
  stopped: Set<string>;
  /** At most this many distinct files per request (1 for a single-file tool). */
  cap: number;
  /** The window closed for "Choose from this device": focus goes to the tool's picker, wherever it was. */
  device?: boolean;
};

export type Begin = {
  provider: CloudProvider;
  trigger: HTMLElement | null;
  opts: CloudOpenOptions;
  /** Opens again (runs synchronously in the notice button's click). */
  again: () => void;
  pre?: PreOpened;
};

/** The window's query for a pick on this tool page. */
function pickParams(tool: CloudDeps["tool"], provider: CloudProvider, req: string, multiple: boolean): WindowParams {
  const { flow } = tool;
  return { req, accept: flow.accept.extensions.map((e) => e.toLowerCase()), multiple, max: flow.maxFileBytes, tool: flow.title, provider };
}

/**
 * Opens a provider's window for the tool page: call it synchronously in the click (the browser allows
 * a window only then). `pre`: the window the page already opened in the click, before this chunk was here.
 */
export function openCloud(provider: CloudProvider, trigger: HTMLElement | null, opts: CloudOpenOptions = {}, pre?: PreOpened) {
  const page = pageHub();
  if (!page) return pre?.win?.close();
  // Merge's menus load this chunk on their own: let the page draw with it (the cards).
  if (!page.ui) void page.load();
  (page.intake ??= createIntake(page)).begin({ provider, trigger, opts, pre, again: () => openCloud(provider, trigger, opts) });
}

/** The download cards' Stop and Retry. */
export const stopDownload = (key: string) => pageHub()?.intake?.stop(key);
export const retryDownload = (key: string) => pageHub()?.intake?.retry(key);

/** Where each cloud file came from (the result's privacy line, AC-131). */
const origins = new WeakMap<Blob, CloudProvider>();
/** The provider any of the page's files came from, if one did. */
export const cloudOrigin = () => pageHub()?.deps?.files.map((f) => origins.get(f.source)).find(Boolean) ?? null;

export function createIntake(host: CloudHub) {
  const d = () => host.deps as CloudDeps;
  // The F1 intake's words for a skipped file, and for several problems at once.
  const describeSkip = (name: string, reason: "type" | "size") =>
    reason === "type" ? (d().errorType ?? copy.errorType)(name) : copy.errorSize(name, Math.round(d().tool.flow.maxFileBytes / 1024 / 1024));
  let entries: Entry[] = [];
  const publish = () => {
    const pending = entries.filter((e) => e.status !== "failed").length;
    host.set({
      downloads: entries.map(({ key, id, req, name, provider, status, loaded, total }) => ({ key, id, req, name, provider, status, loaded, total })),
      busy: pending && entries[0] ? transferCopy.status(pending, entries[0].provider) : null,
    });
  };
  const update = (fn: (prev: Entry[]) => Entry[]) => {
    entries = fn(entries);
    publish();
  };
  publish();
  const sessions = new Map<string, SessionState>();

  const flush = (s: SessionState) => {
    if (!s.problems.length) return;
    const p = s.problems.splice(0);
    d().pushNotice(p.length === 1 ? { tone: "danger", title: p[0] } : { tone: "danger", title: copy.problemsTitle(p.length), items: p });
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
    // Lost after the tool stopped waiting: "Stopped waiting" (with Try again) still says it right.
    if (s.stoppedNotice && reason !== "lost") d().dismissNotice(s.stoppedNotice);
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
        if (t?.isConnected && (s.device || document.activeElement === document.body || !document.activeElement)) t.focus();
      };
      if (document.hasFocus()) back();
      else window.addEventListener("focus", back, { once: true });
    }
  };

  const showError = (p: CloudProvider, code: ErrorCode | "blocked", retry: () => void) => {
    const n = d();
    if (code === "blocked") n.pushNotice({ tone: "warning", title: transferCopy.blocked(p), body: transferCopy.blockedBody, action: cloudAction({ label: transferCopy.tryAgain, onClick: retry, autoFocus: true }), sticky: true });
    else if (code === "offline") n.pushNotice({ tone: "info", title: cloudCopy.offline, body: cloudCopy.offlineBody(providerName[p]), sticky: true });
    else if (code === "denied") n.pushNotice({ tone: "warning", title: transferCopy.denied(p), body: transferCopy.deniedBody, action: cloudAction({ label: transferCopy.tryAgain, onClick: retry }), sticky: true });
    else n.pushNotice({ tone: "danger", title: transferCopy.unreachable(p), body: transferCopy.unreachableBody, action: cloudAction({ label: transferCopy.tryAgain, onClick: retry }) });
  };

  const skipText = (name: string, reason: SkipReason, p: CloudProvider) =>
    reason === "access" ? transferCopy.notAccessible(name, p) : reason === "export" ? transferCopy.exportTooBig(name, p) : describeSkip(name, reason);

  /** "Waiting for Google Drive…" with a spinner and Cancel. */
  const waiting = (s: SessionState) =>
    d().pushNotice({
      tone: "info",
      title: transferCopy.waiting(s.provider),
      sticky: true,
      action: cloudAction(
        {
          label: transferCopy.cancel,
          onClick: () => {
            s.session.cancel();
            endSession(s.session.req, "cancel");
          },
        },
        busyIcon,
      ),
    });

  function begin({ provider, trigger, opts, again, pre }: Begin) {
    const { tool, announce, pushNotice, dismissNotice } = d();
    if (!pre?.win && navigator.onLine === false) return showError(provider, "offline", again);
    if (pre && !pre.win) return showError(provider, "blocked", again);
    const req = newRequestId();
    // One cloud window at a time: a window still waiting for a pick is replaced.
    for (const [r, s] of sessions) {
      if (!entries.some((e) => e.req === r) && !s.gotFiles) {
        s.session.cancel();
        if (s.waitNotice) dismissNotice(s.waitNotice);
        if (s.stoppedNotice) dismissNotice(s.stoppedNotice);
        sessions.delete(r);
      }
    }
    const multiple = opts.multiple ?? tool.flow.multiFile;
    const params = pickParams(tool, provider, req, multiple);
    const limits = { accept: tool.flow.accept, maxFileBytes: tool.flow.maxFileBytes, multiple };
    const box: { s?: SessionState } = {};
    /** A file this session still takes: not stopped, and within the request's file cap. */
    const takes = (s: SessionState, id: string) => !s.stopped.has(id) && (s.order.includes(id) || s.order.length < s.cap);
    const session = openCloudWindow(
      routeFor(provider),
      params,
      {
        onProgress: (id, name, loaded, total) => {
          const s = box.s;
          if (!s || !takes(s, id)) return;
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
        onFiles: (all) => {
          const s = box.s;
          if (!s) return;
          const files = all.filter((f) => takes(s, f.id));
          if (!files.length) return;
          const screened = screenIncoming(
            files.map((f) => f.file),
            limits,
            s.received,
          );
          s.received += screened.accepted.length;
          for (const sk of screened.skipped) s.problems.push(describeSkip(sk.name, sk.reason === "size" ? "size" : "type"));
          const ok = new Set(screened.accepted);
          for (const { id, file } of files) {
            const key = `${req}:${id}`;
            if (!entries.some((e) => e.key === key)) {
              s.order.push(id);
              update((prev) => [...prev, { key, id, req, name: file.name, provider, loaded: file.size, total: file.size, status: "arrived", resolved: false }]);
            }
            if (ok.has(file)) origins.set(file, provider);
            update((prev) => prev.map((e) => (e.key === key ? { ...e, status: "arrived", loaded: e.total || file.size, file: ok.has(file) ? file : undefined, resolved: true } : e)));
          }
          deliver(s);
        },
        onSkipped: (items) => {
          const s = box.s;
          if (!s) return;
          for (const it of items) {
            if (it.id && s.stopped.has(it.id)) continue;
            s.problems.push(skipText(it.name, it.reason, provider));
            const e = it.id ? entries.find((x) => x.key === `${req}:${it.id}`) : undefined;
            if (e) e.resolved = true;
          }
          deliver(s);
        },
        onFailed: (id, name) => {
          if (box.s?.stopped.has(id)) return;
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
        // "Choose from this device" in a window that couldn't open: focus goes to the tool's own picker (when this tab is in front).
        onDevice: () => {
          const s = box.s;
          const picker = d().devicePicker?.();
          if (s && picker) Object.assign(s, { trigger: picker, device: true });
        },
        onClosed: (reason) => endSession(req, reason),
        onGaveUp: () => {
          const s = box.s;
          if (!s) return;
          if (s.waitNotice) dismissNotice(s.waitNotice);
          s.waitNotice = null;
          const id = pushNotice({
            tone: "info",
            title: transferCopy.stoppedWaiting(provider),
            body: transferCopy.stoppedWaitingBody,
            sticky: true,
            action: cloudAction({
              label: transferCopy.tryAgain,
              onClick: () => {
                dismissNotice(id);
                again();
              },
            }),
          });
          s.stoppedNotice = id;
        },
        onResumed: () => {
          const s = box.s;
          if (!s) return;
          if (s.stoppedNotice) dismissNotice(s.stoppedNotice);
          s.stoppedNotice = null;
          s.waitNotice = waiting(s);
        },
      },
      // A window the page opened in the click (before this chunk was here): sent on to the provider's page.
      pre?.win ? { open: (url) => (pre.win!.location.replace(url), pre.win) } : undefined,
    );
    if (!session) return showError(provider, "blocked", again);
    const state: SessionState = {
      session,
      provider,
      trigger,
      opts,
      order: [],
      delivered: 0,
      received: 0,
      problems: [],
      waitNotice: null,
      stoppedNotice: null,
      gotFiles: false,
      stopped: new Set(),
      cap: multiple ? MAX_FILES_PER_MESSAGE : 1,
    };
    box.s = state;
    state.waitNotice = waiting(state);
    sessions.set(req, state);
    announce(transferCopy.liveOpening(provider));
  }

  return {
    begin,
    stop(key: string) {
      const e = entries.find((x) => x.key === key);
      if (!e) return;
      const s = sessions.get(e.req);
      s?.stopped.add(e.id);
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
