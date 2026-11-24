"use client";
import "../cloud.css";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { BerryMark } from "@/components/berry/Berry";
import { Button } from "@/components/ui/Button";
import { CheckIcon, CloseIcon, ShieldIcon } from "@/components/ui/icons";
import { LiveRegion } from "@/components/ui/LiveRegion";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { DownloadError, downloadFile, runPool } from "@/lib/cloud/download";
import { parseWindowParams, type WindowParams } from "@/lib/cloud/protocol";
import { providerName, type CloudProvider, type CloudRoute } from "@/lib/cloud/providers";
import { WindowLink } from "@/lib/cloud/window-link";
import { cloudCopy } from "../copy";
import { ProviderMark } from "../ProviderMark";
import { MockPicker, type MockChoice } from "./MockPicker";
import { CloudError, type Adapter, type AdapterCtx, type FrameSpec, type Phase, type Picked } from "./adapters/types";

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

async function loadAdapter(route: CloudRoute, ctx: AdapterCtx): Promise<Adapter> {
  // One chunk per provider: MSAL ships only with the OneDrive window.
  if (route === "mock") return (await import("./adapters/mock")).createAdapter(ctx);
  if (route === "dropbox") return (await import("./adapters/dropbox")).createAdapter(ctx);
  if (route === "google") return (await import("./adapters/google")).createAdapter(ctx);
  return (await import("./adapters/onedrive")).createAdapter(ctx);
}

/**
 * The /cloud/<provider> window (spec U-5, U-6, U-7, AC-168). Shows a one-line disclosure before
 * any provider code loads, then the provider's own sign-in and picker, downloads the chosen files
 * straight into this browser with per-file progress, hands them to the tool tab over the request's
 * BroadcastChannel and closes itself. In save mode it uploads the result the tool tab sends.
 */
export function CloudWindow({ route }: { route: CloudRoute }) {
  const [params, setParams] = useState<Params | null>(null);
  const [view, setView] = useState<View>({ k: "before" });
  const [ready, setReady] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [canClose, setCanClose] = useState(false);
  const [live, setLive] = useState("");
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
    if (finished.current) return;
    const rs = rowsRef.current;
    if (!rs.length || rs.some((r) => r.status === "downloading" || r.status === "failed")) return;
    finished.current = true;
    setView({ k: "done" });
    await link.current?.finish();
    link.current?.close();
    closeSoon();
  }, [closeSoon]);

  const downloadOne = useCallback(
    async (p: Picked) => {
      const l = link.current!;
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
        if (ctrl.signal.aborted) patchRow(p.id, { status: "stopped", note: cloudCopy.stopped });
        else if ((e instanceof DownloadError && e.kind === "access") || (e instanceof CloudError && e.code === "denied")) {
          patchRow(p.id, { status: "skipped", note: cloudCopy.cantOpen });
          l.send({ t: "skipped", items: [{ name: p.name, reason: "access", id: p.id }] });
        } else {
          patchRow(p.id, { status: "failed", note: cloudCopy.stopped });
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
          initial.push({ id: it.id, name: it.name, loaded: 0, total: it.size, status: "skipped", note: cloudCopy.wrongType });
        } else if (it.size > prm.max) {
          // Checked against the size the provider reports, before any download (AC-147).
          skipped.push({ name: it.name, reason: "size" });
          initial.push({ id: it.id, name: it.name, loaded: 0, total: it.size, status: "skipped", note: cloudCopy.overSize(maxMb) });
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
    const prm = parseWindowParams(route, window.location.search) as Params | null;
    if (!prm) {
      setView({ k: "invalid" });
      return;
    }
    setParams(prm);
    document.title = cloudCopy.windowTitle(prm.provider);
    const l = new WindowLink(prm.req, {
      onCancel: () => {
        for (const a of aborts.current.values()) a.abort();
        finished.current = true;
        window.close();
      },
      onStop: (id) => {
        const a = aborts.current.get(id);
        if (a) a.abort();
        else {
          patchRow(id, { status: "stopped", note: cloudCopy.stopped });
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
        if (!finished.current) setView({ k: "lost" });
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
      leaving: () => l.away(10 * 60 * 1000),
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
      {params?.mode === "save" ? cloudCopy.savingPrivacy(provider) : cloudCopy.windowPrivacy(provider)}
    </p>
  );
  const mark = provider && <ProviderMark provider={provider} size={56} />;
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
          {h1(cloudCopy.lostTitle)}
          <p className="ip-cw__text">{cloudCopy.lostBody}</p>
          <Button variant="outline" onClick={cancelAndClose}>
            {cloudCopy.closeWindow}
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
            {provider ? cloudCopy.open(provider) : ""}
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
                {cloudCopy.signingIn}
              </Button>
              <p className="ip-cw__text">{provider === "google" ? cloudCopy.finishInGoogle : `Finish in the ${name} window.`}</p>
            </>
          ) : (
            <p role="status" className="flex items-center gap-2">
              <span className="ip-busy-ring text-brand" aria-hidden="true" />
              {view.phase === "connecting" ? cloudCopy.connecting : `Finish in the ${name} window.`}
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
          {h1(cloudCopy.getting(rows.length || active))}
          <div className="ip-cw__rows" aria-busy={rows.some((r) => r.status === "downloading") || undefined}>
            {rows.map((r) => (
              <div key={r.id} className="ip-cw__row" data-testid="cloud-row-file">
                <span className="ip-cw__name">{r.name}</span>
                <span className={r.status === "skipped" || r.status === "failed" || r.status === "stopped" ? "ip-cw__meta ip-cw__meta--bad" : "ip-cw__meta"}>
                  {r.status === "done" ? cloudCopy.done : r.note ?? cloudCopy.cardBytes(r.loaded, r.total)}
                </span>
                {(r.status === "downloading" || r.status === "done") && (
                  <ProgressBar label={cloudCopy.downloadingLabel(r.name)} value={r.total ? Math.round((r.loaded / r.total) * 100) : r.status === "done" ? 100 : 0} />
                )}
                {r.status === "failed" && picked.current.get(r.id) && (
                  <Button variant="line" size="sm" className="col-span-2 justify-self-start" onClick={() => void downloadOne(picked.current.get(r.id)!)}>
                    {cloudCopy.retry}
                  </Button>
                )}
              </div>
            ))}
          </div>
          <p className="ip-cw__text">{cloudCopy.keepOpen}</p>
          <Button variant="outline" onClick={cancelAndClose}>
            {cloudCopy.cancel}
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
          {h1(cloudCopy.addedTo(params?.tool ?? "BerryPDF"))}
          <p className="ip-cw__text">{canClose ? cloudCopy.canClose : cloudCopy.closesItself}</p>
        </>
      );
      break;
    case "saving":
      body = (
        <>
          {mark}
          {provider && h1(cloudCopy.savingTitle(provider))}
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
          {provider && h1(cloudCopy.savedTitle(provider))}
          <p className="ip-cw__text">{canClose ? cloudCopy.canClose : cloudCopy.closesItself}</p>
        </>
      );
      break;
    case "denied":
    case "unreachable":
      body = (
        <>
          {mark}
          {h1(view.k === "denied" ? cloudCopy.deniedTitle : provider ? cloudCopy.unreachableTitle(provider) : "")}
          <p className="ip-cw__text">{view.k === "denied" ? cloudCopy.deniedWindowBody : cloudCopy.unreachableWindowBody}</p>
          <Button
            variant="primary"
            size="lg"
            className="ip-cw__btn"
            onClick={() => {
              setView({ k: "before" });
              start();
            }}
          >
            {cloudCopy.tryAgain}
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
        <button type="button" className="mp-iconbtn mp-iconbtn--plain ip-cw__close size-11" aria-label={cloudCopy.closeAria} title={cloudCopy.closeAria} onClick={cancelAndClose}>
          <CloseIcon size={20} />
        </button>
      </header>
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
