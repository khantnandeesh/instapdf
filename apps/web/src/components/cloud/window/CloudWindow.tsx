"use client";
import { windowCopy } from "./copy";
import "../cloud.css";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { BerryMark } from "@/components/berry/Berry";
import { Button } from "@/components/ui/Button";
import { CheckIcon, CloseIcon, ShieldIcon } from "@/components/ui/icons";
import { LiveRegion } from "@/components/ui/LiveRegion";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { DownloadError, downloadFile, runPool } from "@/lib/cloud/download";
import { parseWindowParams, SIGN_IN_AWAY_MS, type WindowParams } from "@/lib/cloud/protocol";
import { providerName, type CloudProvider, type CloudRoute } from "@/lib/cloud/providers";
import { WindowLink } from "@/lib/cloud/window-link";
import { transferCopy } from "../transfer-copy";
import { ProviderArt } from "../marks";
import { MockPicker, type MockChoice } from "./MockPicker";
import * as onepick from "./adapters/onepick";
import * as dropbox from "./adapters/dropbox";
import * as google from "./adapters/google";
import * as onedrive from "./adapters/onedrive";
import { CloudError, isSignInResponse, type Adapter, type AdapterCtx, type FrameSpec, type Phase, type Picked } from "./adapters/types";

type Params = WindowParams & { route: CloudRoute; provider: CloudProvider };

type Row = { id: string; name: string; loaded: number; total: number; status: "downloading" | "done" | "skipped" | "failed" | "stopped"; note?: string };

type View =
  | { k: "before" }
  | { k: "busy"; phase: Phase }
  | { k: "mock" }
  | { k: "frame"; spec: FrameSpec; title: string }
  | { k: "rows" }
  | { k: "done" }
  | { k: "denied" }
  | { k: "unreachable" }
  | { k: "lost" }
  | { k: "invalid" }
  | { k: "saving"; name: string; pct: number }
  | { k: "saved"; name: string };

/** Back from a full-page sign-in on the bare redirect URL: return to the window's own URL. */
async function completeRedirect(route: CloudRoute): Promise<boolean> {
  if ((process.env.NEXT_PUBLIC_CLOUD_MOCK === "1" || process.env.NODE_ENV !== "production") && route === "mock") return (await import("./adapters/mock")).completeRedirect();
  if (route === "onedrive") return onedrive.completeRedirect();
  return false;
}

async function loadAdapter(route: CloudRoute, ctx: AdapterCtx): Promise<Adapter> {
  // The adapters are small and ship with this page (every extra chunk grows the webpack runtime on
  // every page); MSAL stays its own chunk, loaded by the OneDrive adapter. The mock exists only in
  // mock builds and `next dev` (lib/cloud/providers.ts mockActive).
  if ((process.env.NEXT_PUBLIC_CLOUD_MOCK === "1" || process.env.NODE_ENV !== "production") && route === "mock") return (await import("./adapters/mock")).createAdapter(ctx);
  if (route === "dropbox") return dropbox.createAdapter(ctx);
  if (route === "google") return google.createAdapter(ctx);
  return onedrive.createAdapter(ctx);
}

/**
 * The /cloud/<provider> window (spec U-5, U-6, U-7, AC-168). Shows a one-line disclosure before
 * any provider code loads, then the provider's own sign-in and picker, downloads the chosen files
 * straight into this browser with per-file progress, hands them to the tool tab over the request's
 * BroadcastChannel and closes itself. In save mode it uploads the result the tool tab sends.
 */
export function CloudWindow({ route, toolTitles }: { route: CloudRoute; /** Every tool's title: the only values `?tool=` may carry. */ toolTitles: readonly string[] }) {
  const [params, setParams] = useState<Params | null>(null);
  const [view, setView] = useState<View>({ k: "before" });
  const [ready, setReady] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [canClose, setCanClose] = useState(false);
  const [live, setLive] = useState("");
  /** The tool tab stopped answering while this window is busy: a banner, cleared when it answers again. */
  const [toolLost, setToolLost] = useState(false);
  const viewRef = useRef<View>(view);
  viewRef.current = view;
  /** Files the tool tab stopped: never downloaded, or dropped if one is under way (AC-136). */
  const stopped = useRef(new Set<string>());
  /** Waiting for the tool tab's ack before saying "Added". */
  const completing = useRef(false);
  const rowsRef = useRef<Row[]>([]);
  const link = useRef<WindowLink | null>(null);
  const adapter = useRef<Adapter | null>(null);
  const picked = useRef(new Map<string, Picked>());
  const aborts = useRef(new Map<string, AbortController>());
  const saveFile = useRef<File | null>(null);
  const pendingSave = useRef(false);
  const finished = useRef(false);
  const mockResolve = useRef<((r: MockChoice) => void) | null>(null);
  const frameEl = useRef<HTMLIFrameElement | null>(null);
  const frameWait = useRef<((f: HTMLIFrameElement | null) => void) | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const primary = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  const setRowsBoth = useCallback((fn: (r: Row[]) => Row[]) => {
    rowsRef.current = fn(rowsRef.current);
    setRows(rowsRef.current);
  }, []);
  const patchRow = useCallback((id: string, p: Partial<Row>) => setRowsBoth((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r))), [setRowsBoth]);

  const closeSoon = useCallback(() => {
    setTimeout(() => window.close(), 600);
    setTimeout(() => setCanClose(true), 1500);
  }, []);

  const cancelAndClose = useCallback(() => {
    for (const a of aborts.current.values()) a.abort();
    link.current?.cancel();
    finished.current = true;
    window.close();
    setTimeout(() => setCanClose(true), 300);
  }, []);

  // ---- downloads ---------------------------------------------------------------------------------
  const checkComplete = useCallback(async () => {
    if (finished.current || completing.current) return;
    const rs = rowsRef.current;
    if (!rs.length || rs.some((r) => r.status === "downloading" || r.status === "failed")) return;
    // The tool tab is not answering: nothing is "added" until it does (onToolBack checks again).
    if (link.current?.toolLost) return;
    // "Added" only once the tool tab says it has everything (its ack). No ack: the files may have gone
    // nowhere (the tab was closed or reloaded), so the rows stay under the lost-tool banner, and
    // onToolBack tries again if the tab answers.
    completing.current = true;
    const acked = await link.current?.finish();
    completing.current = false;
    if (finished.current) return;
    if (!acked) return setToolLost(true);
    finished.current = true;
    setView({ k: "done" });
    link.current?.close();
    closeSoon();
  }, [closeSoon]);

  const downloadOne = useCallback(
    async (p: Picked) => {
      const l = link.current!;
      // Stopped while still queued: never starts.
      if (stopped.current.has(p.id)) return void checkComplete();
      const ctrl = new AbortController();
      aborts.current.set(p.id, ctrl);
      patchRow(p.id, { status: "downloading", loaded: 0, note: undefined });
      try {
        const req = await p.request();
        let last = 0;
        const file = await downloadFile(
          req,
          (loaded, total) => {
            patchRow(p.id, { loaded, total });
            const now = performance.now();
            if (now - last > 100 || loaded === total) {
              last = now;
              l.send({ t: "progress", id: p.id, name: p.name, loaded, total });
            }
          },
          ctrl.signal,
        );
        patchRow(p.id, { status: "done", loaded: file.size, total: file.size });
        setLive(`${p.name} done`);
        l.send({ t: "files", files: [{ id: p.id, file }] });
      } catch (e) {
        if (ctrl.signal.aborted) patchRow(p.id, { status: "stopped", note: windowCopy.stopped });
        else if (p.native && e instanceof DownloadError && e.status === 403 && e.reason === "exportSizeLimitExceeded") {
          // Drive refuses to export a document over its size limit (AC-141); any other refusal is a plain "can't open".
          patchRow(p.id, { status: "skipped", note: windowCopy.tooBigToExport });
          l.send({ t: "skipped", items: [{ name: p.name, reason: "export", id: p.id }] });
        } else if ((e instanceof DownloadError && e.kind === "access") || (e instanceof CloudError && e.code === "denied")) {
          patchRow(p.id, { status: "skipped", note: windowCopy.cantOpen });
          l.send({ t: "skipped", items: [{ name: p.name, reason: "access", id: p.id }] });
        } else {
          patchRow(p.id, { status: "failed", note: windowCopy.stopped });
          l.send({ t: "failed", id: p.id, name: p.name });
        }
      } finally {
        aborts.current.delete(p.id);
        void checkComplete();
      }
    },
    [checkComplete, patchRow],
  );

  const handlePicked = useCallback(
    async (list: Picked[], prm: Params) => {
      const items = prm.multiple ? list : list.slice(0, 1);
      const maxMb = Math.round(prm.max / 1024 / 1024);
      const skipped: { name: string; reason: "size" | "type" }[] = [];
      const go: Picked[] = [];
      const initial: Row[] = [];
      for (const it of items) {
        const lower = it.name.toLowerCase();
        if (!prm.accept.some((e) => lower.endsWith(e))) {
          skipped.push({ name: it.name, reason: "type" });
          initial.push({ id: it.id, name: it.name, loaded: 0, total: it.size, status: "skipped", note: windowCopy.wrongType });
        } else if (it.size > prm.max) {
          // Checked against the size the provider reports, before any download (AC-147).
          skipped.push({ name: it.name, reason: "size" });
          initial.push({ id: it.id, name: it.name, loaded: 0, total: it.size, status: "skipped", note: windowCopy.overSize(maxMb) });
        } else {
          go.push(it);
          picked.current.set(it.id, it);
          initial.push({ id: it.id, name: it.name, loaded: 0, total: it.size, status: "downloading" });
        }
      }
      setRowsBoth(() => initial);
      setView({ k: "rows" });
      const l = link.current!;
      if (skipped.length) l.send({ t: "skipped", items: skipped });
      // Announce every file first, in pick order, so the tool can lay its cards out in order.
      for (const it of go) l.send({ t: "progress", id: it.id, name: it.name, loaded: 0, total: it.size });
      if (!go.length) return void checkComplete();
      await runPool(go, 2, downloadOne);
    },
    [checkComplete, downloadOne, setRowsBoth],
  );

  const fail = useCallback((e: unknown) => {
    const code = e instanceof CloudError ? e.code : "unreachable";
    // A sign-in that was to leave the page failed instead: the heartbeat resumes, so the tool hears this.
    link.current?.back();
    link.current?.send({ t: "error", code });
    setView({ k: code === "denied" ? "denied" : "unreachable" });
  }, []);

  /** Inside the tap (or at once for OneDrive): the SDK call must start synchronously. */
  const start = useCallback(() => {
    const a = adapter.current;
    const prm = params;
    if (!a || !prm || finished.current) return;
    if (prm.mode === "save") {
      if (!saveFile.current) {
        pendingSave.current = true;
        setView({ k: "busy", phase: "connecting" });
        return;
      }
      void doSave(a, saveFile.current, prm);
      return;
    }
    a.pick().then(
      (r) => {
        if (r === "cancel") cancelAndClose();
        else void handlePicked(r, prm);
      },
      (e) => fail(e),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cancelAndClose, fail, handlePicked, params]);

  async function doSave(a: Adapter, file: File, prm: Params) {
    if (!a.save) return fail(new CloudError("unreachable"));
    setView({ k: "saving", name: file.name, pct: 0 });
    try {
      const r = await a.save(file, (loaded, total) => {
        setView({ k: "saving", name: file.name, pct: total ? Math.round((loaded / total) * 100) : 0 });
        link.current?.send({ t: "saveProgress", loaded, total });
      });
      link.current?.send({ t: "saved", name: r.name, link: r.link });
      finished.current = true;
      setView({ k: "saved", name: r.name });
      await link.current?.finish();
      link.current?.close();
      closeSoon();
    } catch (e) {
      fail(e);
    }
    void prm;
  }

  // ---- set up: params, channel, adapter (after the disclosure is on screen) -----------------------
  useEffect(() => {
    // Nothing here may reach back into the tool tab: cut the opener first (OneDrive's window shares
    // the tool tab's COOP group, so the browser keeps it there).
    try {
      window.opener = null;
    } catch {}
    // Back from Google's top-level picker on the bare redirect URL: the window's own URL comes back
    // (replaceState, no reload) and the hash with its token is gone before anything reads it.
    if ((route === "google" || route === "mock") && onepick.isReturn(window.location.hash, route) && !onepick.takeReturn(route)) {
      setView({ k: "invalid" });
      return;
    }
    if ((route === "onedrive" || route === "mock") && isSignInResponse(window.location.hash, window.location.search)) {
      // Back from a full-page sign-in on the bare redirect URL: hand the response over and return to
      // the window's own URL (with its request), where the adapter finishes the sign-in.
      setView({ k: "busy", phase: "connecting" });
      completeRedirect(route).then(
        (went) => !went && setView({ k: "invalid" }),
        (e) => setView({ k: e instanceof CloudError && e.code === "denied" ? "denied" : "invalid" }),
      );
      return;
    }
    const parsed = parseWindowParams(route, window.location.search) as Params | null;
    // `tool` names the tool in "Added to …": only a real tool's title is shown.
    const prm = parsed && toolTitles.includes(parsed.tool) ? parsed : null;
    if (!prm) {
      setView({ k: "invalid" });
      return;
    }
    setParams(prm);
    document.title = windowCopy.windowTitle(prm.provider);
    const l = new WindowLink(prm.req, {
      onCancel: () => {
        for (const a of aborts.current.values()) a.abort();
        finished.current = true;
        window.close();
      },
      onStop: (id) => {
        stopped.current.add(id);
        const a = aborts.current.get(id);
        if (a) a.abort();
        else {
          patchRow(id, { status: "stopped", note: windowCopy.stopped });
          void checkComplete();
        }
      },
      onRetry: (id) => {
        const p = picked.current.get(id);
        if (p && rowsRef.current.find((r) => r.id === id)?.status === "failed") void downloadOne(p);
      },
      onSave: (file) => {
        if (prm.mode !== "save" || saveFile.current) return;
        saveFile.current = file;
        if (pendingSave.current && adapter.current) {
          pendingSave.current = false;
          void doSave(adapter.current, file, prm);
        }
      },
      onToolLost: () => {
        if (finished.current) return;
        // Idle (before anything was picked): nothing to keep, the full view. Busy: a banner over it.
        if (viewRef.current.k === "before") setView({ k: "lost" });
        else setToolLost(true);
      },
      onToolBack: () => {
        setToolLost(false);
        if (viewRef.current.k === "lost") setView({ k: "before" });
        else void checkComplete();
      },
    });
    link.current = l;
    l.start();
    const ctx: AdapterCtx = {
      params: prm,
      setPhase: (phase) => setView({ k: "busy", phase }),
      frame: (spec, title = providerName[prm.provider]) =>
        new Promise((resolve) => {
          if (!spec) {
            frameEl.current = null;
            setView({ k: "rows" });
            return resolve(null);
          }
          frameWait.current = resolve;
          setView({ k: "frame", spec, title });
        }),
      leaving: () => l.away(SIGN_IN_AWAY_MS),
      mockPick: () =>
        new Promise<Picked[] | "cancel">((resolve, reject) => {
          mockResolve.current = (r) => {
            mockResolve.current = null;
            if (r === "cancel") resolve("cancel");
            else if (r === "denied" || r === "unreachable") reject(new CloudError(r));
            else resolve(r);
          };
          setView({ k: "mock" });
        }),
    };
    let alive = true;
    // Let the disclosure paint first, then load the provider's code.
    const raf = requestAnimationFrame(() => {
      void loadAdapter(prm.route, ctx)
        .then(async (a) => {
          adapter.current = a;
          await a.prepare();
          if (!alive) return;
          // OneDrive goes straight on (redirect sign-in): its button never turns live, so it can't flicker.
          if (a.needsTap) setReady(true);
          if (!a.needsTap) {
            if (prm.mode === "save") {
              pendingSave.current = !saveFile.current;
              if (saveFile.current) void doSave(a, saveFile.current, prm);
              else setView({ k: "busy", phase: "connecting" });
            } else
              a.pick().then(
                (r) => (r === "cancel" ? cancelAndClose() : void handlePicked(r, prm)),
                (e) => fail(e),
              );
          } else setView({ k: "before" });
        })
        .catch((e) => alive && fail(e));
    });
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route]);

  // Focus: the berry button on arrival (an Enter press is the gesture the SDK needs), the h1 when done.
  useEffect(() => {
    if (view.k === "before" && ready) primary.current?.focus();
    else if (view.k === "done" || view.k === "saved" || view.k === "lost" || view.k === "denied" || view.k === "unreachable") heading.current?.focus();
  }, [view.k, ready]);

  // A form-POSTed picker (OneDrive v8) is submitted once its iframe exists.
  useEffect(() => {
    if (view.k !== "frame") return;
    if ("post" in view.spec) formRef.current?.submit();
    frameWait.current?.(frameEl.current);
    frameWait.current = null;
  }, [view]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancelAndClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cancelAndClose]);

  const provider = params?.provider;
  const name = provider ? providerName[provider] : "";
  const privacy = provider && (
    <p className="ip-cw__privacy" data-testid="cloud-privacy">
      <ShieldIcon size={18} />
      {params?.mode === "save" ? windowCopy.savingPrivacy(provider) : windowCopy.windowPrivacy(provider)}
    </p>
  );
  const mark = provider && <ProviderArt provider={provider} size={56} />;
  const h1 = (text: string) => (
    <h1 ref={heading} tabIndex={-1} className="ip-cw__title">
      {text}
    </h1>
  );

  let body: ReactNode;
  switch (view.k) {
    case "invalid":
    case "lost":
      body = (
        <>
          {mark}
          {h1(windowCopy.lostTitle)}
          <p className="ip-cw__text">{windowCopy.lostBody}</p>
          <Button variant="outline" onClick={cancelAndClose}>
            {windowCopy.closeWindow}
          </Button>
        </>
      );
      break;
    case "before":
      body = (
        <>
          {mark}
          {h1(name)}
          {params?.mode === "save" && saveFile.current && <p className="ip-cw__text">{saveFile.current.name}</p>}
          <Button ref={primary} variant="primary" size="lg" className="ip-cw__btn" busy={!ready} disabled={!params} onClick={start} data-testid="cloud-open">
            {provider ? windowCopy.open(provider) : ""}
          </Button>
          {privacy}
        </>
      );
      break;
    case "busy":
      body = (
        <>
          {mark}
          {h1(name)}
          {view.phase === "signing" ? (
            <>
              <Button variant="primary" size="lg" className="ip-cw__btn" busy disabled>
                {windowCopy.signingIn}
              </Button>
              <p className="ip-cw__text">{provider === "google" ? windowCopy.finishInGoogle : `Finish in the ${name} window.`}</p>
            </>
          ) : (
            <p role="status" className="flex items-center gap-2">
              <span className="ip-busy-ring ip-cw__ring" aria-hidden="true" />
              {view.phase === "connecting" ? windowCopy.connecting : `Finish in the ${name} window.`}
            </p>
          )}
          {privacy}
        </>
      );
      break;
    case "mock":
      body = (
        <>
          {mark}
          {h1(name)}
          <MockPicker multiple={!!params?.multiple} onChoose={(r) => mockResolve.current?.(r)} />
          {privacy}
        </>
      );
      break;
    case "rows":
    case "frame": {
      const active = rows.filter((r) => r.status !== "skipped").length;
      body = (
        <>
          {h1(windowCopy.getting(rows.length || active))}
          <div className="ip-cw__rows" aria-busy={rows.some((r) => r.status === "downloading") || undefined}>
            {rows.map((r) => (
              <div key={r.id} className="ip-cw__row" data-testid="cloud-row-file">
                <span className="ip-cw__name">{r.name}</span>
                <span className={r.status === "skipped" || r.status === "failed" || r.status === "stopped" ? "ip-cw__meta ip-cw__meta--bad" : "ip-cw__meta"}>
                  {r.status === "done" ? windowCopy.done : r.note ?? transferCopy.cardBytes(r.loaded, r.total)}
                </span>
                {(r.status === "downloading" || r.status === "done") && (
                  <ProgressBar label={transferCopy.downloadingLabel(r.name)} value={r.total ? Math.round((r.loaded / r.total) * 100) : r.status === "done" ? 100 : 0} />
                )}
                {r.status === "failed" && picked.current.get(r.id) && (
                  <Button variant="line" size="sm" className="ip-cw__retry col-span-2" onClick={() => void downloadOne(picked.current.get(r.id)!)}>
                    {transferCopy.retry}
                  </Button>
                )}
              </div>
            ))}
          </div>
          <p className="ip-cw__text">{windowCopy.keepOpen}</p>
          <Button variant="outline" onClick={cancelAndClose}>
            {transferCopy.cancel}
          </Button>
        </>
      );
      break;
    }
    case "done":
      body = (
        <>
          <span className="ip-cw__tick">
            <CheckIcon size={28} />
          </span>
          {h1(windowCopy.addedTo(params?.tool ?? "BerryPDF"))}
          <p className="ip-cw__text">{canClose ? windowCopy.canClose : windowCopy.closesItself}</p>
        </>
      );
      break;
    case "saving":
      body = (
        <>
          {mark}
          {provider && h1(windowCopy.savingTitle(provider))}
          <div className="ip-cw__rows">
            <div className="ip-cw__row">
              <span className="ip-cw__name">{view.name}</span>
              <span className="ip-cw__meta">{view.pct}%</span>
              <ProgressBar label={`Saving ${view.name}`} value={view.pct} />
            </div>
          </div>
          {privacy}
        </>
      );
      break;
    case "saved":
      body = (
        <>
          <span className="ip-cw__tick">
            <CheckIcon size={28} />
          </span>
          {provider && h1(windowCopy.savedTitle(provider))}
          <p className="ip-cw__text">{canClose ? windowCopy.canClose : windowCopy.closesItself}</p>
        </>
      );
      break;
    case "denied":
    case "unreachable":
      body = (
        <>
          {mark}
          {h1(view.k === "denied" ? windowCopy.deniedTitle : provider ? windowCopy.unreachableTitle(provider) : "")}
          <p className="ip-cw__text">{view.k === "denied" ? windowCopy.deniedWindowBody : windowCopy.unreachableWindowBody}</p>
          <Button
            variant="primary"
            size="lg"
            className="ip-cw__btn"
            onClick={() => {
              setView({ k: "before" });
              start();
            }}
          >
            {transferCopy.tryAgain}
          </Button>
        </>
      );
      break;
  }

  return (
    <div className="ip-cw" data-testid="cloud-window" data-view={view.k}>
      <LiveRegion message={live} />
      <header className="ip-cw__top">
        <BerryMark size={26} />
        <span>BerryPDF</span>
        {name && <span className="ip-cw__sub">· {name}</span>}
        <button type="button" className="mp-iconbtn mp-iconbtn--plain ip-cw__close size-11" aria-label={windowCopy.closeAria} title={windowCopy.closeAria} onClick={cancelAndClose}>
          <CloseIcon size={20} />
        </button>
      </header>
      {toolLost && view.k !== "lost" && (
        <p role="status" className="ip-cw__banner" data-testid="cloud-lost-banner">
          {windowCopy.lostBanner}
        </p>
      )}
      {view.k === "frame" ? (
        <main id="main" className="flex flex-1 flex-col">
          {"post" in view.spec ? (
            <>
              <iframe ref={frameEl} name="ip-cloud-picker" title={view.title} className="ip-cw__picker" />
              <form ref={formRef} method="post" target="ip-cloud-picker" action={view.spec.post.action} className="hidden">
                {Object.entries(view.spec.post.fields).map(([k, v]) => (
                  <input key={k} type="hidden" name={k} value={v} />
                ))}
              </form>
            </>
          ) : (
            <iframe ref={frameEl} src={view.spec.url} title={view.title} className="ip-cw__picker" />
          )}
        </main>
      ) : (
        <main id="main" className="ip-cw__main">
          <section className="ip-cw__card" aria-labelledby={undefined} aria-busy={view.k === "rows" && rows.some((r) => r.status === "downloading") ? true : undefined}>
            {body}
          </section>
        </main>
      )}
    </div>
  );
}
