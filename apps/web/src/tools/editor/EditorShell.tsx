"use client";
/**
 * The editor (focus mode, U-E2): fixed over the page with the rest of the page inert, its own
 * history entry (Back closes it), the canvas with every page, and the bars around it. Loaded as a
 * separate chunk once the user shows intent (AC-86).
 */
import { emptyForm } from "@/lib/forms/model";
import { FormsChrome, fieldKey, loadForms, nudgeAfterDownload } from "@/tools/forms/EditorForms";
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import type { MenuEntry } from "@/components/ui/Menu";
import { cx } from "@/components/ui/cx";
import { useLeaveGuard } from "@/components/tool-flow/useLeaveGuard";
import { buildInWorker, checkOwnerPassword, disposeBuild } from "@/lib/editor/build-client";
import { OwnerPasswordDialog, OwnerPermissionNotice } from "@/components/tool-flow/OwnerPassword";
import type { Permission } from "@/tools/registry";
import { disposeEngine, getEngineStatus, getShapingStatus, subscribeEngine } from "@/lib/editor/engine-client";
import { fontsForBuild, resolveFonts } from "@/lib/editor/fonts-browser";
import { screenDeltaToFrame, screenToFrame, displaySize } from "@/lib/editor/geometry";
import * as H from "@/lib/editor/history";
import { clampDelta, initialPages, isPristine, kindName, moveObject, newId, objectBounds, pageSize, totalRotation, type EditorObject, type PageEntry, type Pt } from "@/lib/editor/model";
import { clearDevice, deleteSession, loadSession, sha256, storageAvailable, writeSession, type LoadedSession } from "@/lib/editor/persist";
import { planSession, restoreVersions, writtenBy } from "@/lib/editor/persist-plan";
import { initialVersions } from "@/lib/editor/versions";
import type { OpenedPdf } from "@/lib/pdf/pdfjs";
import { assetsOf } from "@/lib/editor/asset-refs";
import { listChars } from "@/lib/editor/coverage";
import { missingInObjects } from "./coverage-browser";
import { addAsset, IMAGE_ACCEPT, imageError, imageFromFile, isImageFile, plainAssets, releaseAssets } from "./assets";
import { EnginePill } from "./EngineProgress";
import { fontLabel, resetDocFonts } from "./font-service";
import { resetDocFaces } from "./doc-face";
import { disposeMatcher } from "@/lib/font-library/match-client";
import { FontNotice } from "./FontMenu";
import { AnnotsToggle, DOCK_ORDER, MoreTools, PageChip, PageHeader, PrivacyChip, SaveChip, ToolDock, ToolRail, TopBar, TOOLS, ViewPill } from "./Chrome";
import { createController, TOOL_NAMES, type Controller, type Runtime, type Toast } from "./controller";
import { BASE_SCALE, EditorContext, MAX_ZOOM, MIN_ZOOM, ZOOM_STEPS, useCtl } from "./context";
import { BroomBold, CloseBold, FilePlusBold, FileUpBold, KeyboardBold, MinusBold, PlusBold, FitBold } from "./icons";
import { PageView, unionBox } from "./PageView";
import { SelectionBar, ToolOptions } from "./Properties";
import { SidePanel } from "./SidePanel";
import { createStore, shallowArray, useStore, type EditorState, type Placement, type ToolId } from "./store";

/** The library and user fonts the added text uses, for the download worker. */
async function buildFonts(objects: readonly EditorObject[]) {
  const ids = objects.flatMap((o) => (o.kind === "text" ? [o.font] : []));
  await resolveFonts(ids);
  // Names for the shaping engine, which embeds a font under the family it was registered as.
  return { ...fontsForBuild(ids), labels: Object.fromEntries([...new Set(ids)].map((id) => [id, fontLabel(id)])) };
}

const SignDialog = lazy(() => import("./SignDialog").then((m) => ({ default: m.SignDialog })));

export type ShellProps = {
  name: string;
  bytes: Uint8Array;
  pdf: OpenedPdf;
  password?: string;
  onClose: () => void;
  onOpenFile: (f: File) => void;
  onBlank: () => void;
};

const PANEL_KEY = "berrypdf:editor:panel";
const KEYS_KEY = "berrypdf:editor:single-keys";
const readLocal = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const writeLocal = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    // private mode: not remembered
  }
};

/** Largest zoom the document opens at on desktop (fit width up to this). */
const OPEN_ZOOM_CAP = 1.5;
const reducedMotion = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

function initialState(pages: PageEntry[], wide: boolean): EditorState {
  return {
    history: H.createHistory({ pages, objects: [], engine: 0 }),
    selection: [],
    tool: "select",
    locked: false,
    defaults: {
      text: { font: "arimo", size: null, bold: false, italic: false, underline: false, color: "#000000", align: "left" },
      mark: { type: "highlight", color: "#ffe14d" },
      draw: { marker: false, color: "#1a49c7", markerColor: "#ffe14d", width: "M" },
      shapes: { shape: "rect", stroke: "#c8102e", fill: null, width: 2 },
      whiteout: { fill: "page" },
      sign: { role: "signature" },
    },
    zoom: 1,
    fit: "width",
    current: 0,
    editing: null,
    draft: null,
    guides: null,
    readout: null,
    hideAnnots: false,
    placement: null,
    save: "idle",
    downloadedAt: 0,
    flash: null,
    texts: {},
    fresh: {},
    rasterRev: {},
    pdfRev: 0,
    engineReady: false,
    engineWanted: false,
    shaping: "idle",
    pendingLine: null,
    lineEdit: null,
    fontNotice: null,
    busy: null,
    panel: wide && (readLocal(PANEL_KEY) ?? (typeof innerWidth !== "undefined" && innerWidth >= 1600 ? "1" : "0")) === "1",
    panelTab: "pages",
    wide,
    readOnly: false,
    forms: { original: null, xfa: false, selected: null, draw: "text", proposals: [], detect: { phase: "idle" }, tabOrder: false, nudge: false, ready: false, signFor: null },
    lineFlash: null,
  };
}

/** Sizes every page from pdf.js (page dictionaries only; nothing is drawn yet). */
async function readGeometry(pdf: OpenedPdf): Promise<Runtime["src"]> {
  const out: Runtime["src"] = new Array(pdf.pageCount);
  const n = pdf.pageCount;
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(8, n) }, async () => {
      while (next < n) {
        const i = next++;
        const p = await pdf.doc.getPage(i + 1);
        const v = p.view;
        out[i] = { view: [v[0], v[1], v[2], v[3]], rotate: p.rotate };
      }
    }),
  );
  return out;
}

export function EditorShell(props: ShellProps) {
  // Engine state on the shell element (for tests and styling), without re-rendering the editor per percent.
  const shellEl = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const put = () => {
      const el = shellEl.current;
      if (!el) return;
      const s = getEngineStatus();
      el.dataset.engine = s.state;
      el.dataset.shaping = getShapingStatus().state;
      if (s.cached) el.dataset.engineCached = "true";
      else delete el.dataset.engineCached;
    };
    put();
    return subscribeEngine(put);
  });
  const [host] = useState(() => {
    const el = document.createElement("div");
    el.className = "ed-host";
    return el;
  });
  const [ctl, setCtl] = useState<Controller | null>(null);
  const [failed, setFailed] = useState(false);
  const [announce, setAnnounce] = useState("");
  const [toast, setToast] = useState<Toast | null>(null);
  const [recovery, setRecovery] = useState<LoadedSession | null>(null);

  // Focus mode: fixed over the page, everything else inert, the page under it does not scroll.
  useLayoutEffect(() => {
    document.body.appendChild(host);
    const others = Array.from(document.body.children).filter((el) => el !== host && !el.hasAttribute("inert"));
    others.forEach((el) => el.setAttribute("inert", ""));
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      others.forEach((el) => el.removeAttribute("inert"));
      html.style.overflow = prev;
      host.remove();
    };
  }, [host]);

  const say = useCallback((msg: string) => setAnnounce((a) => (a === msg ? `${msg} ` : msg)), []);
  const showToast = useCallback((t: Omit<Toast, "key">) => setToast({ ...t, key: Date.now() }), []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast((x) => (x === toast ? null : x)), toast.action ? 8000 : toast.tone === "danger" ? 7000 : 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // Open: page sizes, then the controller; the engine and the device store in the background.
  useEffect(() => {
    let alive = true;
    let made: Controller | null = null;
    (async () => {
      const src = await readGeometry(props.pdf);
      if (!alive) return;
      const wide = matchMedia("(min-width: 1024px)").matches;
      const rt: Runtime = { name: props.name, password: props.password, hash: null, versions: initialVersions(props.bytes), pdf: props.pdf.doc, shown: 0, src, assets: {}, held: new Set(), clip: null, wasEncrypted: props.pdf.wasEncrypted };
      // Owner-restricted (no modify): read-only until the owner password is entered (U-E9). A file
      // opened with a password opens at once, read-only, and unlocks if that was the owner password
      // (checked in the background: the check loads the download worker).
      const restricted = props.pdf.denied.includes("modify");
      const store = createStore({ ...initialState(initialPages(src), wide), readOnly: restricted });
      resetDocFonts();
      resetDocFaces();
      if (restricted && props.password)
        void checkOwnerPassword(props.bytes.slice(), props.password).then(
          (owner) => alive && owner && store.set({ readOnly: false }),
          () => undefined,
        );
      made = createController(store, rt, { announce: say, toast: showToast });
      setCtl(made);
      // Form fields: read in the build worker, only when pdf.js says the file has some.
      void loadForms(made, props.bytes, props.password).catch(() => {}); // a form that can’t be read stays drawn on the page
      say(`${props.name} opened, ${src.length} ${src.length === 1 ? "page" : "pages"}`);
      // Viewing and every object tool work at once; only Edit text waits for the engine.
      if (!props.pdf.wasEncrypted) {
        made.engineAllowed = true;
        if (getEngineStatus().state !== "idle") made.startEngine();
      }
      // Encrypted files are never kept on the device: their content would sit there decrypted.
      if (props.pdf.wasEncrypted) return store.set({ save: "off" });
      const [hash, ok] = await Promise.all([sha256(props.bytes), storageAvailable()]);
      if (!alive) return;
      if (!ok) return store.set({ save: "off" }); // no device store: nothing to save to
      rt.hash = hash;
      const saved = await loadSession(hash).catch(() => null);
      if (alive && saved && saved.record.history.index > 0) setRecovery(saved);
    })().catch(() => alive && setFailed(true));
    return () => {
      alive = false;
      if (made) releaseAssets(made.rt.assets);
      disposeEngine();
      disposeMatcher();
      disposeBuild();
    };
    // Opened once per file: the route remounts the shell for another file.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const body = (
    <div className="ed-shell" role="region" aria-label={`Editing ${props.name}`} data-testid="editor-shell" ref={shellEl}>
      {ctl ? (
        <EditorContext.Provider value={ctl}>
          <Frame {...props} recovery={recovery} setRecovery={setRecovery} toast={toast} setToast={setToast} />
        </EditorContext.Provider>
      ) : (
        <div className="ed-opening">
          <header className="ed-top ed-glass">
            <h2 className="ed-file truncate">{props.name}</h2>
          </header>
          <div className="grid flex-1 place-items-center">
            {failed ? (
              <div className="flex flex-col items-center gap-3 text-center">
                <p className="text-sm text-muted">This file couldn’t be opened.</p>
                <Button variant="soft" onClick={props.onClose}>
                  Close
                </Button>
              </div>
            ) : (
              <span className="ed-loader" aria-label="Opening" role="progressbar" />
            )}
          </div>
        </div>
      )}
      <div aria-live="polite" aria-atomic="true" className="sr-only" data-testid="live">
        {announce}
      </div>
    </div>
  );
  return createPortal(body, host);
}

type FrameProps = ShellProps & {
  recovery: LoadedSession | null;
  setRecovery: (s: LoadedSession | null) => void;
  toast: Toast | null;
  setToast: (t: Toast | null) => void;
};

function Frame({ recovery, setRecovery, toast, setToast, onClose, onOpenFile, onBlank, bytes: original, pdf }: FrameProps) {
  const ctl = useCtl();
  const { store, rt } = ctl;
  const pages = useStore(store, (s) => H.current(s.history).pages, shallowArray);
  const wide = useStore(store, (s) => s.wide);
  const zoom = useStore(store, (s) => s.zoom);
  const fit = useStore(store, (s) => s.fit);
  const panel = useStore(store, (s) => s.panel);
  const tool = useStore(store, (s) => s.tool);
  const placement = useStore(store, (s) => s.placement);
  const selectionObjs = useStore(store, (s) => {
    const objs = H.current(s.history).objects;
    return s.selection.map((id) => objs.find((o) => o.id === id)).filter((o): o is EditorObject => !!o);
  }, shallowArray);
  const dirty = useStore(store, (s) => s.history.index !== s.downloadedAt && !isPristine(H.current(s.history), s.forms.original ?? undefined));
  const [scroller, setScroller] = useState<HTMLElement | null>(null);
  const column = useRef<HTMLDivElement>(null);
  const [sign, setSign] = useState<{ role: "signature" | "initials" } | null>(null);
  const [sheet, setSheet] = useState<"more" | "pages" | null>(null);
  const [shortcuts, setShortcuts] = useState(false);
  const [confirm, setConfirm] = useState<"close" | "clear" | null>(null);
  /** Opening another file (or a blank one) while there are edits not downloaded: asks first. */
  const [replace, setReplace] = useState<{ run: () => void; label: string } | null>(null);
  const [missingAsk, setMissingAsk] = useState<{ chars: string[]; unchecked: boolean; name?: string } | null>(null);
  const readOnly = useStore(store, (s) => s.readOnly);
  const [ownerOpen, setOwnerOpen] = useState(false);
  const [ownerError, setOwnerError] = useState<string | undefined>();
  const [ownerBusy, setOwnerBusy] = useState(false);
  const unlockOwner = async (password: string) => {
    setOwnerBusy(true);
    try {
      const ok = await checkOwnerPassword(original.slice(), password);
      if (!ok) return setOwnerError("That isn’t the owner password.");
      setOwnerOpen(false);
      setOwnerError(undefined);
      store.set({ readOnly: false });
      ctl.toast({ text: "Unlocked. You can edit this file now.", tone: "success" });
    } catch {
      setOwnerError("That couldn’t be checked. Please try again.");
    } finally {
      setOwnerBusy(false);
    }
  };
  const [singleKeys, setSingleKeys] = useState(() => readLocal(KEYS_KEY) !== "0");
  const imageInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const closing = useRef(false);
  const scale = BASE_SCALE * zoom;

  useLeaveGuard(dirty);

  // ---- layout width ----
  useEffect(() => {
    const mq = matchMedia("(min-width: 1024px)");
    const on = () => store.set({ wide: mq.matches, panel: mq.matches && store.get().panel });
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [store]);

  // ---- zoom ----
  // Fit uses one reference page (the current one, else the first), as pdf.js does: a single
  // over-wide page doesn't shrink the rest. Pages wider than the column are then scaled down on
  // their own while a fit is on (AC-83), so there is never sideways page scroll.
  const [avail, setAvail] = useState(0);
  const innerSize = useCallback(() => {
    if (!scroller) return null;
    const cs = getComputedStyle(scroller);
    const w = scroller.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - (wide ? 32 : 0);
    const h = scroller.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - (wide ? 32 : 0);
    return { w, h };
  }, [scroller, wide]);
  const fitZoom = useCallback(
    (f: "width" | "page") => {
      const inner = innerSize();
      if (!inner) return 1;
      const ps = H.current(store.get().history).pages;
      const ref = ps[store.get().current] ?? ps[0];
      const d = ref ? displaySize(ref.view, totalRotation(ref), 1) : { width: 612, height: 792 };
      const zw = inner.w / (Math.max(1, d.width) * BASE_SCALE);
      const z = f === "width" ? zw : Math.min(zw, inner.h / (Math.max(1, d.height) * BASE_SCALE));
      return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
    },
    [innerSize, store],
  );
  /** Set by a zoom the user picks (buttons, keys, pinch); a fit clears it. */
  const [manualZoom, setManualZoom] = useState(false);
  /** The scale a page is drawn at: the zoom, or smaller for a page wider than the column unless the user zoomed in. */
  const pageScale = useCallback(
    (p: PageEntry) => {
      if (manualZoom || avail <= 0) return scale;
      const w = displaySize(p.view, totalRotation(p), 1).width;
      return Math.min(scale, avail / Math.max(1, w));
    },
    [manualZoom, avail, scale],
  );
  const anchor = useRef<{ ratio: number; at: number } | null>(null);
  const zoomTo = useCallback(
    (z: number | "in" | "out", at?: number) => {
      const s = store.get();
      const cur = s.zoom;
      let next = typeof z === "number" ? z : z === "in" ? (ZOOM_STEPS.find((v) => v > cur + 0.001) ?? MAX_ZOOM) : ([...ZOOM_STEPS].reverse().find((v) => v < cur - 0.001) ?? MIN_ZOOM);
      next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, next));
      if (scroller) {
        const y = at ?? scroller.clientHeight / 2;
        anchor.current = { ratio: (scroller.scrollTop + y) / Math.max(1, scroller.scrollHeight), at: y };
      }
      store.set({ zoom: next, fit: null });
      setManualZoom(true);
      say(`Zoom ${Math.round(next * 100)}%`);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, scroller],
  );
  const say = ctl.announce;
  const fitTo = useCallback(
    (f: "width" | "page") => {
      if (scroller) anchor.current = { ratio: (scroller.scrollTop + scroller.clientHeight / 2) / Math.max(1, scroller.scrollHeight), at: scroller.clientHeight / 2 };
      store.set({ fit: f, zoom: fitZoom(f) });
      setManualZoom(false);
    },
    [store, fitZoom, scroller],
  );
  // First fit: fit width, so the page fills the view (M12). On very wide screens the zoom is
  // capped, so a line of text stays a readable length.
  const fitted = useRef(false);
  useLayoutEffect(() => {
    if (!scroller || fitted.current) return;
    fitted.current = true;
    const inner = innerSize();
    if (inner) setAvail(inner.w);
    const z = fitZoom("width");
    if (wide && z > OPEN_ZOOM_CAP) store.set({ zoom: OPEN_ZOOM_CAP, fit: null });
    else store.set({ zoom: z, fit: "width" });
  }, [scroller, wide, fitZoom, store, innerSize]);
  useEffect(() => {
    if (!scroller) return;
    const ro = new ResizeObserver(() => {
      const inner = innerSize();
      if (inner) setAvail(inner.w);
      const f = store.get().fit;
      if (f) store.set({ zoom: fitZoom(f) });
    });
    ro.observe(scroller);
    return () => ro.disconnect();
  }, [scroller, fitZoom, store, innerSize]);
  useLayoutEffect(() => {
    const a = anchor.current;
    if (!a || !scroller) return;
    anchor.current = null;
    scroller.scrollTop = a.ratio * scroller.scrollHeight - a.at;
  }, [scale, scroller]);

  // Ctrl/Cmd + wheel zooms around the pointer; two fingers pinch-zoom and pan (AC-94).
  useEffect(() => {
    if (!scroller) return;
    // Ctrl+wheel: while the wheel turns, the pages (bitmaps, text layer and objects together) are
    // only scaled with a transform; the zoom is applied, and the pages re-rendered, once it rests.
    let wheeling: { z: number; f: number; at: number; timer: number } | null = null;
    const settle = () => {
      if (!wheeling) return;
      const { z, f, at } = wheeling;
      wheeling = null;
      // Dropped before the zoom is measured; the new layout comes in the same frame (no paint between).
      if (column.current) column.current.style.transform = "";
      if (Math.abs(f - 1) > 0.001) zoomTo(z * f, at);
    };
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const col = column.current;
      if (!col) return;
      if (!wheeling) {
        const r = col.getBoundingClientRect();
        // Pages are centred in the column, so they grow from its centre line; vertically, around the pointer.
        col.style.transformOrigin = `${r.width / 2}px ${e.clientY - r.top}px`;
        wheeling = { z: store.get().zoom, f: 1, at: e.clientY - scroller.getBoundingClientRect().top, timer: 0 };
      }
      const w = wheeling;
      w.f = Math.max(MIN_ZOOM / w.z, Math.min(MAX_ZOOM / w.z, w.f * Math.exp(-e.deltaY * 0.0025)));
      col.style.transform = `scale(${w.f})`;
      clearTimeout(w.timer);
      w.timer = window.setTimeout(settle, 160);
    };
    let pinch: { d: number; z: number; cx: number; cy: number; f: number } | null = null;
    const pts = (e: TouchEvent) => {
      const [a, b] = [e.touches[0], e.touches[1]];
      return { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), cx: (a.clientX + b.clientX) / 2, cy: (a.clientY + b.clientY) / 2 };
    };
    const start = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      const p = pts(e);
      pinch = { d: p.d, z: store.get().zoom, cx: p.cx, cy: p.cy, f: 1 };
    };
    const move = (e: TouchEvent) => {
      if (!pinch || e.touches.length !== 2) return;
      if (e.cancelable) e.preventDefault();
      const p = pts(e);
      scroller.scrollLeft -= p.cx - pinch.cx;
      scroller.scrollTop -= p.cy - pinch.cy;
      pinch.cx = p.cx;
      pinch.cy = p.cy;
      const f = Math.max(MIN_ZOOM / pinch.z, Math.min(MAX_ZOOM / pinch.z, p.d / pinch.d));
      pinch.f = f;
      const col = column.current;
      if (col) {
        const r = col.getBoundingClientRect();
        col.style.transformOrigin = `${p.cx - r.left}px ${p.cy - r.top}px`;
        col.style.transform = `scale(${f})`;
      }
    };
    const end = (e: TouchEvent) => {
      if (!pinch || e.touches.length >= 2) return;
      const { z, f, cy } = pinch;
      pinch = null;
      // Dropped before the zoom is measured; the new layout comes in the same frame (no paint between).
      if (column.current) column.current.style.transform = "";
      if (Math.abs(f - 1) > 0.02) zoomTo(z * f, cy - scroller.getBoundingClientRect().top);
    };
    scroller.addEventListener("wheel", wheel, { passive: false });
    scroller.addEventListener("touchstart", start, { passive: true });
    scroller.addEventListener("touchmove", move, { passive: false });
    scroller.addEventListener("touchend", end);
    scroller.addEventListener("touchcancel", end);
    return () => {
      if (wheeling) clearTimeout(wheeling.timer);
      scroller.removeEventListener("wheel", wheel);
      scroller.removeEventListener("touchstart", start);
      scroller.removeEventListener("touchmove", move);
      scroller.removeEventListener("touchend", end);
      scroller.removeEventListener("touchcancel", end);
    };
  }, [scroller, store, zoomTo]);

  // ---- current page and navigation ----
  useEffect(() => {
    if (!scroller) return;
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const slots = column.current?.children;
        if (!slots?.length) return;
        const line = scroller.scrollTop + scroller.clientHeight * 0.35;
        let lo = 0;
        let hi = slots.length - 1;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          const el = slots[mid] as HTMLElement;
          if (el.offsetTop + el.offsetHeight < line) lo = mid + 1;
          else hi = mid;
        }
        if (store.get().current !== lo) store.set({ current: lo });
      });
    };
    scroller.addEventListener("scroll", on, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", on);
      cancelAnimationFrame(raf);
    };
  }, [scroller, store]);

  const goto = useCallback(
    (i: number) => {
      const el = column.current?.children[i] as HTMLElement | undefined;
      if (!el || !scroller) return;
      store.set({ current: i });
      scroller.scrollTo({ top: el.offsetTop - 12, behavior: reducedMotion() ? "auto" : "smooth" });
    },
    [scroller, store],
  );

  useEffect(() => {
    ctl.revealPage = (pageId, objectId) => {
      const i = H.current(store.get().history).pages.findIndex((p) => p.id === pageId);
      if (i < 0) return;
      requestAnimationFrame(() => {
        const obj = objectId ? document.querySelector<HTMLElement>(`[data-obj-id="${objectId}"]`) : null;
        if (obj && scroller) {
          const r = obj.getBoundingClientRect();
          const s = scroller.getBoundingClientRect();
          if (r.top < s.top + 56 || r.bottom > s.bottom - 80) obj.scrollIntoView({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" });
          store.set({ current: i });
        } else {
          const el = column.current?.children[i] as HTMLElement | undefined;
          const s = scroller?.getBoundingClientRect();
          const r = el?.getBoundingClientRect();
          if (el && s && r && (r.bottom < s.top + 40 || r.top > s.bottom - 40)) goto(i);
          else store.set({ current: i });
        }
      });
    };
    return () => {
      ctl.revealPage = null;
    };
  }, [ctl, store, scroller, goto]);

  // ---- images ----
  /** Places an image asset on a page: at a point (drop) or centred in the visible part. */
  const placeImage = useCallback(
    (assetId: string, pageIndex: number, point?: Pt) => {
      const doc = H.current(store.get().history);
      const entry = doc.pages[pageIndex];
      const a = rt.assets[assetId];
      if (!entry || !a) return;
      const { w: pw, h: ph } = pageSize(entry);
      let w = Math.min(pw * 0.5, a.w);
      let h = (w * a.h) / Math.max(1, a.w);
      if (h > ph * 0.5) {
        h = ph * 0.5;
        w = (h * a.w) / Math.max(1, a.h);
      }
      const c = point ?? visibleCentre(entry, pageIndex);
      const box = { x: c[0] - w / 2, y: c[1] - h / 2, w, h };
      const [dx, dy] = clampDelta(box, 0, 0, { w: pw, h: ph });
      const id = newId();
      ctl.add([{ kind: "image", id, page: entry.id, x: box.x + dx, y: box.y + dy, w, h, rot: (360 - totalRotation(entry)) % 360, asset: assetId, opacity: 1 }], "Add image");
      ctl.announce(`Image placed on page ${pageIndex + 1}. Arrow keys move it.`);
      requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-obj-id="${id}"]`)?.focus({ preventScroll: true }));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctl, store, rt, scale],
  );
  const pageGeom = (entry: PageEntry, index: number) => {
    const el = column.current?.querySelector<HTMLElement>(`[data-testid="page-${index + 1}"]`);
    if (!el) return null;
    const { w, h } = pageSize(entry);
    const k = pageScale(entry);
    return { rect: el.getBoundingClientRect(), W: w * k, H: h * k, rot: totalRotation(entry), k };
  };
  const toFrameAt = (entry: PageEntry, index: number, x: number, y: number): Pt | null => {
    const g = pageGeom(entry, index);
    if (!g) return null;
    const [fx, fy] = screenToFrame(x - g.rect.left, y - g.rect.top, g.W, g.H, g.rot);
    return [fx / g.k, fy / g.k];
  };
  const visibleCentre = (entry: PageEntry, index: number): Pt => {
    const { w, h } = pageSize(entry);
    const g = pageGeom(entry, index);
    const s = scroller?.getBoundingClientRect();
    if (!g || !s) return [w / 2, h / 2];
    const top = Math.max(g.rect.top, s.top);
    const bottom = Math.min(g.rect.bottom, s.bottom);
    const p = toFrameAt(entry, index, g.rect.left + g.rect.width / 2, bottom > top ? (top + bottom) / 2 : g.rect.top + g.rect.height / 2);
    return p ? [Math.min(w, Math.max(0, p[0])), Math.min(h, Math.max(0, p[1]))] : [w / 2, h / 2];
  };

  const loadImage = useCallback(
    async (file: File): Promise<string | null> => {
      try {
        return await imageFromFile(rt, file);
      } catch (e) {
        ctl.toast({ text: imageError(e), tone: "danger" });
        return null;
      }
    },
    [rt, ctl],
  );

  useEffect(() => {
    ctl.pickImage = () => imageInput.current?.click();
    ctl.openSign = (role) => setSign({ role: role ?? store.get().defaults.sign.role });
    return () => {
      ctl.pickImage = null;
      ctl.openSign = null;
    };
  }, [ctl, store]);

  // ---- download (AC-44) ----
  const download = useCallback(
    async (name?: string, force = false) => {
      const s = store.get();
      if (s.busy === "save") return;
      if (s.editing) store.set({ editing: null });
      if (s.lineEdit) await ctl.commitLine();
      // Added text with characters no font can print: say so before the file is made (AC-75).
      if (!force && !s.readOnly) {
        const { chars, unchecked } = await missingInObjects(H.current(store.get().history).objects);
        if (chars.length || unchecked) return setMissingAsk({ chars, unchecked, name });
      }
      store.set({ busy: "save" });
      const at = store.get().history.index;
      const doc = H.current(store.get().history);
      const file = name ?? ctl.outputName();
      try {
        const base = ctl.bytesOf(doc.engine);
        let out: Uint8Array;
        if (s.readOnly) out = original; // nothing changed: the file as it came, its restrictions intact
        else try {
          out = await buildInWorker({
            bytes: base.slice(),
            password: rt.password,
            pages: doc.pages,
            objects: doc.objects,
            assets: plainAssets(rt.assets, assetsOf(doc.objects)),
            fonts: await buildFonts(doc.objects),
            forms: doc.forms ? { state: doc.forms, original: s.forms.original ?? emptyForm() } : undefined,
          });
        } catch (err) {
          if (!isPristine(doc, s.forms.original ?? undefined)) throw err;
          out = base;
        }
        const url = URL.createObjectURL(new Blob([out as Uint8Array<ArrayBuffer>], { type: "application/pdf" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = file;
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30_000);
        store.set({ downloadedAt: at });
        const empty = nudgeAfterDownload(ctl);
        ctl.toast({ text: `Downloaded · ${file} · 0 B uploaded${rt.wasEncrypted && !s.readOnly ? " · no password" : ""}${empty ? ` · ${empty} required ${empty === 1 ? "field is" : "fields are"} empty` : ""}`, tone: "success" });
        ctl.announce(`Downloaded ${file}`);
      } catch {
        ctl.toast({ text: "The PDF couldn’t be made. Your edits are still here; please try again.", tone: "danger" });
      } finally {
        store.set({ busy: null });
      }
    },
    [ctl, store, rt, original],
  );
  useEffect(() => {
    ctl.download = (n) => void download(n);
    return () => {
      ctl.download = null;
    };
  }, [ctl, download]);

  // ---- autosave to this device (AC-45, AC-81) ----
  // Each save writes a small record and only the blobs not written yet (persist-plan). A failed
  // save leaves the last good record as it was (the write is one transaction), says so once, and
  // tries again later. `written` and the version keys are shared with restore, so a restored
  // session reuses its blobs; the first write otherwise sweeps what an earlier page left.
  const recoveryRef = useRef(recovery);
  recoveryRef.current = recovery;
  // `fresh`: this page hasn't written for the file yet. The device then still holds the saved
  // record's blobs (a restore reuses them) and maybe strays, which the first write sweeps.
  const persisted = useRef<{ written: Set<string>; keys: WeakMap<Uint8Array, string>; fresh: boolean }>(null);
  persisted.current ??= { written: new Set(), keys: new WeakMap(), fresh: true };
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let last = store.get().history;
    let savingSince = 0;
    let warned = false;
    const p = persisted.current!;
    const { written, keys } = p;
    const keyOf = (b: Uint8Array) => {
      let k = keys.get(b);
      if (!k) keys.set(b, (k = newId("v")));
      return k;
    };
    const blocked = () => !rt.hash || pdf.wasEncrypted;
    const fail = () => {
      store.set({ save: "off" });
      if (!warned) {
        warned = true;
        ctl.toast({ text: "Changes aren’t being kept on this device right now.", tone: "info" });
      }
      clearTimeout(retry);
      retry = setTimeout(() => void save(), 30_000);
    };
    const save = async (rewrite = false) => {
      const s = store.get();
      if (blocked()) return;
      const h = s.history;
      if (!h.entries.length || (h.index === 0 && isPristine(H.current(h), s.forms.original ?? undefined))) {
        written.clear();
        await deleteSession(rt.hash!);
        p.fresh = false;
        store.set({ save: "idle" });
        return;
      }
      const plan = planSession({ hash: rt.hash!, name: rt.name, history: h, versions: rt.versions, assets: plainAssets(rt.assets), written, keyOf, sweep: p.fresh });
      // Too big to keep even the last step: the last good record stays.
      if (!plan) return fail();
      const result = await writeSession(plan);
      if (result === "stale" && !rewrite) {
        // Another tab's first write swept blobs this page had written: write them all again, but
        // without a sweep of our own, which would delete that tab's blobs and start it over too
        // (two tabs would keep rewriting each other's). Only a page's first write sweeps.
        written.clear();
        return save(true);
      }
      if (result !== "ok") return fail();
      p.fresh = false;
      plan.put.forEach(([k]) => written.add(k));
      plan.drop.forEach((k) => written.delete(k));
      warned = false;
      const wait = Math.max(0, 300 - (Date.now() - savingSince));
      setTimeout(() => store.get().history === h && store.set({ save: "saved" }), wait);
    };
    const unsub = store.subscribe(() => {
      const h = store.get().history;
      if (h === last) return;
      last = h;
      // Editing while the restore offer is up starts fresh (the offer can still be taken from the toast).
      const rec = recoveryRef.current;
      if (rec) {
        setRecovery(null);
        ctl.toast({ text: "Started fresh. Earlier changes were set aside.", tone: "info", action: { label: "Restore", run: () => void restore(rec) } });
      }
      if (blocked()) return;
      savingSince = Date.now();
      store.set({ save: "saving" });
      clearTimeout(timer);
      timer = setTimeout(() => void save(), 500);
    });
    return () => {
      unsub();
      clearTimeout(timer);
      clearTimeout(retry);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, rt, ctl]);

  async function restore(s: LoadedSession) {
    setRecovery(null);
    store.set({ busy: "edit" });
    const ids = Object.keys(s.assets);
    ids.forEach((id) => rt.held.add(id)); // not swept before the history that uses them is in
    try {
      // No wait for the engine: showVersion switches the view, and the engine opens the shown bytes.
      const versions = restoreVersions(s.record, original, s.blobs);
      if (!versions) throw new Error("blobs");
      // Nothing written by this page yet: the record's blobs are what the device holds, so the
      // next save reuses them. (After a write they were replaced: they are written again.)
      const p = persisted.current!;
      if (p.fresh) {
        const seen = writtenBy(s.record, versions);
        seen.written.forEach((k) => p.written.add(k));
        seen.keys.forEach(([b, k]) => p.keys.set(b, k));
      }
      for (const [id, a] of Object.entries(s.assets)) if (!rt.assets[id]) await addAsset(rt, a, id);
      rt.versions = versions;
      const h = s.record.history;
      const target = H.current(h).engine;
      if (target !== rt.shown) await ctl.showVersion(target);
      store.set({ history: h, selection: [], editing: null, downloadedAt: -1 });
      const n = `${h.index} ${h.index === 1 ? "change" : "changes"}`;
      ctl.announce(`Restored ${n}`);
      ctl.toast({ text: `Restored ${n}`, tone: "success" });
    } catch {
      ctl.toast({ text: "Those changes couldn’t be restored.", tone: "danger" });
    } finally {
      ids.forEach((id) => rt.held.delete(id));
      store.set({ busy: null });
    }
  }

  // ---- closing (Back closes the editor, after the leave check) ----
  const finishClose = useCallback(() => {
    closing.current = true;
    if ((history.state as { berryEditor?: boolean } | null)?.berryEditor) history.back();
    else onClose();
  }, [onClose]);
  const unsaved = () => store.get().history.index !== store.get().downloadedAt && !isPristine(H.current(store.get().history), store.get().forms.original ?? undefined);
  const requestOpen = (run: () => void, label: string) => (unsaved() ? setReplace({ run, label }) : run());
  const requestClose = useCallback(() => {
    if (store.get().history.index !== store.get().downloadedAt && !isPristine(H.current(store.get().history), store.get().forms.original ?? undefined)) setConfirm("close");
    else finishClose();
  }, [store, finishClose]);
  useEffect(() => {
    history.pushState({ ...(history.state ?? {}), berryEditor: true }, "");
    const pop = () => {
      if (closing.current) return onClose();
      const s = store.get();
      if (s.history.index !== s.downloadedAt && !isPristine(H.current(s.history), s.forms.original ?? undefined)) {
        history.pushState({ ...(history.state ?? {}), berryEditor: true }, "");
        setConfirm("close");
      } else {
        closing.current = true;
        onClose();
      }
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, [onClose, store]);

  // ---- keyboard (U-E10) ----
  useEffect(() => {
    const typing = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
    };
    const onKey = (e: KeyboardEvent) => {
      const s = store.get();
      const t = e.target as HTMLElement | null;
      if (t?.closest("dialog[open], [data-popover]:popover-open, [role=menu]")) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key;
      if (mod && k.toLowerCase() === "s") {
        e.preventDefault();
        void download();
        return;
      }
      if (typing(t)) return;
      if (fieldKey(ctl, e)) return e.preventDefault();
      if (mod && !e.altKey && (k === "z" || k === "Z")) {
        e.preventDefault();
        void (e.shiftKey ? ctl.redo() : ctl.undo());
        return;
      }
      if (mod && (k === "y" || k === "Y")) {
        e.preventDefault();
        void ctl.redo();
        return;
      }
      if (mod && (k === "=" || k === "+")) return e.preventDefault(), zoomTo("in");
      if (mod && k === "-") return e.preventDefault(), zoomTo("out");
      if (mod && k === "0") return e.preventDefault(), zoomTo(1);
      const sel = s.selection;
      if (mod && (k === "d" || k === "D") && sel.length) {
        e.preventDefault();
        ctl.duplicate(sel, e.altKey);
        return;
      }
      if (mod && (k === "c" || k === "C") && sel.length) {
        const objs = ctl.objectsById(sel);
        rt.clip = { objs, page: objs[0].page };
        ctl.announce(`Copied ${objs.length === 1 ? kindName(objs[0]).toLowerCase() : `${objs.length} objects`}`);
        return;
      }
      if (mod && (k === "]" || k === "[") && sel.length) {
        e.preventDefault();
        ctl.reorder(sel, k === "]" ? 1 : -1);
        return;
      }
      if (k === "Escape") {
        ctl.dropPendingEdit();
        // Spec order: a placement is cancelled; else the selection goes first, then the tool
        // (unlock / back to Select). A sticky tool stays armed while only a selection is dropped.
        if (s.placement) {
          ctl.setTool("select");
          ctl.announce("Select tool");
        } else if (sel.length) {
          ctl.select([]);
          ctl.announce("Deselected");
          if (t?.closest("[data-obj-id]")) document.querySelector<HTMLElement>("[data-testid=canvas]")?.focus({ preventScroll: true });
        } else if (s.tool !== "select" && s.tool !== "edit") {
          ctl.setTool("select");
          ctl.announce("Select tool");
        }
        return;
      }
      if ((k === "Delete" || k === "Backspace") && sel.length) {
        e.preventDefault();
        ctl.remove(sel);
        return;
      }
      const inWidget = !!t?.closest("[role=listbox], [role=toolbar], [role=tablist], [role=radiogroup], [role=slider], [role=spinbutton]");
      if (k.startsWith("Arrow") && sel.length && !inWidget && !mod) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const sx = k === "ArrowLeft" ? -step : k === "ArrowRight" ? step : 0;
        const sy = k === "ArrowUp" ? -step : k === "ArrowDown" ? step : 0;
        const objs = ctl.objectsById(sel);
        const entry = H.current(s.history).pages.find((p) => p.id === objs[0]?.page);
        if (!entry) return;
        const [fx, fy] = screenDeltaToFrame(sx, sy, totalRotation(entry));
        const [dx, dy] = clampDelta(unionBox(objs.map(objectBounds)), fx, fy, pageSize(entry));
        if (!dx && !dy) return;
        ctl.update(sel, (o) => moveObject(o, dx, dy), `Move ${objs.length === 1 ? kindName(objs[0]).toLowerCase() : `${objs.length} objects`}`, `nudge:${sel.join(",")}`);
        ctl.announce(`Moved ${step} pt`);
        return;
      }
      if (!inWidget && !mod && !e.altKey) {
        const n = H.current(s.history).pages.length;
        if (k === "PageDown" || k === "PageUp" || ((k === "Home" || k === "End") && t?.closest(".ed-canvas"))) {
          e.preventDefault();
          goto(k === "Home" ? 0 : k === "End" ? n - 1 : Math.max(0, Math.min(n - 1, s.current + (k === "PageDown" ? 1 : -1))));
          return;
        }
      }
      if (k === "F6") {
        e.preventDefault();
        const regions = Array.from(document.querySelectorAll<HTMLElement>(".ed-shell [data-region]"));
        const i = regions.findIndex((r) => r.contains(document.activeElement));
        const next = regions[(i + (e.shiftKey ? -1 : 1) + regions.length) % regions.length];
        next?.querySelector<HTMLElement>("[tabindex='0'], button:not([disabled]), [tabindex='-1'].ed-canvas")?.focus();
        if (next?.classList.contains("ed-canvas")) next.focus();
        return;
      }
      if (k === "?" && !mod) {
        e.preventDefault();
        setShortcuts(true);
        return;
      }
      if (!mod && !e.altKey && singleKeys && k.length === 1) {
        const def = TOOLS.find((x) => x.key.toLowerCase() === k.toLowerCase());
        if (def && !s.readOnly) {
          e.preventDefault();
          if (def.id === "sign") ctl.openSign?.();
          else if (def.id === "image") ctl.pickImage?.();
          ctl.setTool(def.id as ToolId);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ctl, store, download, zoomTo, goto, singleKeys, rt]);

  // ---- paste and drop (AC-93) ----
  useEffect(() => {
    const paste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA)$/.test(t.tagName))) return;
      const files = Array.from(e.clipboardData?.files ?? []);
      const img = files.find(isImageFile);
      const s = store.get();
      if (img) {
        e.preventDefault();
        if (s.readOnly) return;
        void loadImage(img).then((id) => id && placeImage(id, s.current));
        return;
      }
      const clip = rt.clip;
      if (clip && !s.readOnly) {
        e.preventDefault();
        const doc = H.current(s.history);
        const entry = doc.pages[s.current] ?? doc.pages[0];
        const same = clip.page === entry.id;
        const { w, h } = pageSize(entry);
        const copies = clip.objs.map((o) => {
          const moved = same ? moveObject(o, 10, 10) : o;
          return { ...moved, id: newId(), page: entry.id } as EditorObject;
        });
        const b = unionBox(copies.map(objectBounds));
        const [dx, dy] = clampDelta(b, 0, 0, { w, h });
        const fixed = dx || dy ? copies.map((o) => moveObject(o, dx, dy)) : copies;
        ctl.add(fixed, `Paste ${fixed.length === 1 ? kindName(fixed[0]).toLowerCase() : `${fixed.length} objects`}`);
        if (same) rt.clip = { objs: fixed, page: entry.id };
        ctl.announce(`Pasted on page ${s.current + 1}`);
      }
    };
    window.addEventListener("paste", paste);
    return () => window.removeEventListener("paste", paste);
  }, [ctl, store, loadImage, placeImage, rt]);

  const [dropOn, setDropOn] = useState(false);
  const onDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDropOn(true);
  };
  const onDrop = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    setDropOn(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (/\.pdf$/i.test(file.name) || file.type === "application/pdf") {
      requestOpen(() => onOpenFile(file), file.name);
      return;
    }
    if (!isImageFile(file) || store.get().readOnly) return ctl.toast({ text: "Drop a PNG, JPEG, WebP, GIF or SVG image.", tone: "info" });
    const wrap = (e.target as HTMLElement).closest<HTMLElement>("[data-page-id]");
    const doc = H.current(store.get().history);
    const index = wrap ? doc.pages.findIndex((p) => p.id === wrap.dataset.pageId) : store.get().current;
    const entry = doc.pages[index];
    const p = wrap && entry ? toFrameAt(entry, index, e.clientX, e.clientY) : null;
    void loadImage(file).then((id) => id && placeImage(id, index, p ?? undefined));
  };

  // ---- menus ----
  const fileMenu: MenuEntry[] = [
    { id: "open", label: "Open another PDF", icon: <FileUpBold size={16} />, onSelect: () => fileInput.current?.click() },
    { id: "blank", label: "Blank page", icon: <FilePlusBold size={16} />, onSelect: () => requestOpen(onBlank, "a blank page") },
    { separator: true },
    { id: "keys", label: "Keyboard shortcuts", icon: <KeyboardBold size={16} />, onSelect: () => setShortcuts(true) },
    { id: "clear", label: "Clear from this device", icon: <BroomBold size={16} />, onSelect: () => setConfirm("clear") },
    { separator: true },
    { id: "close", label: "Close", icon: <CloseBold size={16} />, onSelect: requestClose },
  ];

  const pageList = pages.map((p, i) => ({ p, i, first: pages.findIndex((x) => x.src === p.src) === i }));
  const strip = !wide && (selectionObjs.length > 0 || tool !== "select" || !!placement);

  return (
    <div className={cx("ed-frame-root", wide ? "ed-wide" : "ed-narrow", strip && "ed-has-strip")} data-tool={tool}>
      <TopBar wide={wide} fileMenu={fileMenu} onClose={requestClose} />
      <div className="ed-body">
        {wide && <ToolRail />}
        {wide && (
          <aside className={cx("ed-panel", panel && "ed-panel--open")} aria-label="Pages panel" hidden={!panel} data-region="panel">
            {panel && <SidePanel onGo={goto} />}
          </aside>
        )}
        <div className="ed-stage">
          <div
            ref={setScroller}
            className={cx("ed-canvas ed-scroll", dropOn && "ed-canvas--drop")}
            data-ip-scroll="pages"
            tabIndex={-1}
            aria-label="Pages"
            data-region="canvas"
            data-testid="canvas"
            onDragOver={onDragOver}
            onDragLeave={(e) => e.currentTarget === e.target && setDropOn(false)}
            onDrop={onDrop}
          >
            <div ref={column} className="ed-pages">
              {pageList.map(({ p, i, first }) => (
                <div key={p.id} className="ed-slot" data-index={i}>
                  {wide && <PageHeader pageId={p.id} index={i} total={pages.length} />}
                  <PageView entry={p} index={i} total={pages.length} scale={pageScale(p)} wide={wide} root={scroller} firstOfSrc={first} />
                </div>
              ))}
            </div>
          </div>
          {readOnly && <OwnerLock name={rt.name} denied={pdf.denied} onUnlock={() => setOwnerOpen(true)} />}
          {recovery && <RecoveryNotice s={recovery} onRestore={() => void restore(recovery)} onDiscard={() => (setRecovery(null), rt.hash && void deleteSession(rt.hash))} />}
          {placement && <ModeHint text={`Click to place ${placement.label.toLowerCase()} · Esc cancels`} />}
          {!placement && (tool === "text" || tool === "draw" || tool === "mark" || tool === "shapes" || tool === "whiteout") && <ModeHint text={`${TOOL_HINTS[tool]} · Esc to stop`} />}
          {!wide && <PageChip onOpen={() => setSheet("pages")} />}
          <EnginePill wide={wide} />
          <FormsChrome wide={wide} />
          <div className="ed-floor">
            {wide && <SaveChip />}
            <ViewPill pageCount={pages.length} onZoom={(z) => zoomTo(z)} onFit={fitTo} onGo={goto} />
          </div>
          <ToastView toast={toast} onDone={() => setToast(null)}>
            <FontNotice />
          </ToastView>
        </div>
      </div>
      {!wide && (
        <div className="ed-bottom">
          {strip && (
            <div className="ed-strip ed-glass" role="region" aria-label="Options" data-testid="context-strip">
              {selectionObjs.length ? <SelectionBar objs={selectionObjs} /> : <ToolOptions compact />}
            </div>
          )}
          <ToolDock onMore={() => setSheet("more")} />
        </div>
      )}

      <input ref={imageInput} type="file" accept={IMAGE_ACCEPT} className="sr-only" tabIndex={-1} aria-hidden="true" data-testid="image-input" onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (!f) return ctl.setTool("select");
        void loadImage(f).then((id) => {
          if (!id) return ctl.setTool("select");
          const a = rt.assets[id];
          const pl: Placement = { kind: "image", asset: id, aspect: a.w / Math.max(1, a.h), preview: a.url, label: "Image" };
          ctl.setTool("image");
          store.set({ placement: pl });
          ctl.announce("Click a page to place the image. Escape cancels.");
        });
      }} />
      <input ref={fileInput} type="file" accept=".pdf,application/pdf" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (f) requestOpen(() => onOpenFile(f), f.name);
      }} data-testid="open-input" />

      {sign && (
        <Suspense fallback={null}>
          <SignDialog
            open
            role={sign.role}
            onClose={() => {
              setSign(null);
              // Closed without signing: a signature field that asked for it stops waiting.
              store.set((st) => ({ forms: { ...st.forms, signFor: null } }));
              if (!store.get().placement) ctl.setTool("select");
            }}
            onPlace={(pl) => {
              setSign(null);
              ctl.setTool("sign");
              store.set((s) => ({ placement: pl, defaults: { ...s.defaults, sign: { role: pl.role ?? "signature" } } }));
              ctl.announce(`Click a page to place the ${pl.label.toLowerCase()}. Escape cancels.`);
            }}
          />
        </Suspense>
      )}

      <Dialog open={sheet === "more"} onClose={() => setSheet(null)} title="More tools" variant="sheet" onCloseButton={() => setSheet(null)}>
        <div className="flex flex-col gap-4 pb-2">
          <MoreTools onDone={() => setSheet(null)} />
          <div className="flex flex-col">
            <PrivacyChip />
            <button type="button" className="ed-objrow" onClick={() => (setSheet(null), setShortcuts(true))}>
              <KeyboardBold size={16} /> Keyboard shortcuts
            </button>
            <button type="button" className="ed-objrow" onClick={() => (setSheet(null), setConfirm("clear"))}>
              <BroomBold size={16} /> Clear from this device
            </button>
          </div>
        </div>
      </Dialog>
      <Dialog open={sheet === "pages"} onClose={() => setSheet(null)} title="Pages" variant="sheet" onCloseButton={() => setSheet(null)}>
        <div className="flex items-center justify-center gap-1 pb-2">
          <button type="button" className="ed-ctl" aria-label="Zoom out" onClick={() => zoomTo("out")}>
            <MinusBold size={18} />
          </button>
          <span className="w-14 text-center text-sm tabular-nums">{Math.round(zoom * 100)}%</span>
          <button type="button" className="ed-ctl" aria-label="Zoom in" onClick={() => zoomTo("in")}>
            <PlusBold size={18} />
          </button>
          <button type="button" className="ed-ctl" aria-label="Fit width" aria-pressed={fit === "width"} onClick={() => fitTo("width")}>
            <FitBold size={18} />
          </button>
          <AnnotsToggle />
        </div>
        {sheet === "pages" && <SidePanel sheet onGo={goto} onPicked={() => setSheet(null)} />}
      </Dialog>

      <ShortcutsDialog open={shortcuts} onClose={() => setShortcuts(false)} singleKeys={singleKeys} setSingleKeys={(v) => (setSingleKeys(v), writeLocal(KEYS_KEY, v ? "1" : "0"))} />

      <Dialog
        open={confirm === "close"}
        onClose={() => setConfirm(null)}
        title="Close without downloading?"
        description="Your changes stay on this device. Open the same file again to restore them."
        footer={
          <>
            <Button variant="plain" onClick={() => setConfirm(null)} data-autofocus>
              Keep editing
            </Button>
            <Button variant="primary" onClick={() => (setConfirm(null), finishClose())}>
              Close
            </Button>
          </>
        }
      />
      <OwnerPasswordDialog
        open={ownerOpen}
        fileName={rt.name}
        denied={pdf.denied}
        error={ownerError}
        busy={ownerBusy}
        onSubmit={(pw) => void unlockOwner(pw)}
        onClose={() => (setOwnerOpen(false), setOwnerError(undefined))}
      />
      <Dialog
        open={!!missingAsk}
        onClose={() => setMissingAsk(null)}
        title={missingAsk?.chars.length ? "Some characters won’t print" : "Couldn’t check your text"}
        description={
          missingAsk?.chars.length
            ? `No font here can draw ${listChars(missingAsk.chars)}. They come out as “?” in the downloaded copy.${missingAsk.unchecked ? " Some of your text couldn’t be checked." : ""}`
            : "The font lists didn’t load, so we couldn’t check that every character of your added text prints. Any that can’t come out as “?”."
        }
        footer={
          <>
            <Button variant="plain" onClick={() => setMissingAsk(null)} data-autofocus>
              Keep editing
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                const n = missingAsk?.name;
                setMissingAsk(null);
                void download(n, true);
              }}
            >
              Download anyway
            </Button>
          </>
        }
      />
      <Dialog
        open={!!replace}
        onClose={() => setReplace(null)}
        title={replace ? `Open ${replace.label} without downloading?` : "Open without downloading?"}
        description="Your changes to this file aren’t downloaded. They stay on this device: open it again to restore them."
        footer={
          <>
            <Button variant="plain" onClick={() => setReplace(null)} data-autofocus>
              Keep editing
            </Button>
            <Button variant="primary" onClick={() => (replace?.run(), setReplace(null))}>
              Open
            </Button>
          </>
        }
      />
      <Dialog
        open={confirm === "clear"}
        onClose={() => setConfirm(null)}
        title="Clear from this device?"
        description="Removes saved changes and saved signatures from this browser. What’s open now stays."
        footer={
          <>
            <Button variant="plain" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setConfirm(null);
                void clearDevice().then(() => {
                  store.set({ save: store.get().save === "off" ? "off" : "idle" });
                  ctl.toast({ text: "Cleared from this device", tone: "success" });
                });
              }}
            >
              Clear
            </Button>
          </>
        }
      />
    </div>
  );
}

const TOOL_HINTS: Partial<Record<ToolId, string>> = {
  text: "Click to type, drag for a box",
  draw: "Drag to draw",
  mark: "Drag across text",
  shapes: "Click or drag",
  whiteout: "Drag over what to hide",
};

function ModeHint({ text }: { text: string }) {
  return (
    <div className="ed-hint ed-glass" aria-hidden="true" data-testid="mode-hint">
      {text}
    </div>
  );
}

/** Owner-restricted file: why it's read-only, and the owner-password way out (U-E9). */
function OwnerLock({ name, denied, onUnlock }: { name: string; denied: Permission[]; onUnlock: () => void }) {
  return (
    <div className="ed-owner" data-testid="owner-lock">
      <OwnerPermissionNotice fileName={name} denied={denied} onEnterPassword={onUnlock} />
    </div>
  );
}

function RecoveryNotice({ s, onRestore, onDiscard }: { s: LoadedSession; onRestore: () => void; onDiscard: () => void }) {
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    btn.current?.focus({ preventScroll: true });
  }, []);
  const n = s.record.history.index;
  const time = new Date(s.record.savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return (
    <div className="ed-recover ed-glass" role="alert" data-testid="recovery">
      <span>
        Restore {n} {n === 1 ? "change" : "changes"} from {time}?
      </span>
      <Button ref={btn} variant="primary" size="sm" onClick={onRestore}>
        Restore
      </Button>
      <Button variant="plain" size="sm" onClick={onDiscard}>
        Discard
      </Button>
    </div>
  );
}

function ToastView({ toast, onDone, children }: { toast: Toast | null; onDone: () => void; children?: ReactNode }) {
  return (
    <div className="ed-toasts">
      {/* The font notice has controls and is announced once by the controller: not in the live region. */}
      {children}
      <div className="ed-toasts__live" role="status" aria-live="polite">
      {toast && (
        <div key={toast.key} className={cx("ed-toast ed-glass", `ed-toast--${toast.tone}`)} data-testid="editor-notice">
          <span>{toast.text}</span>
          {toast.action && (
            <button
              type="button"
              className="ed-toast__act"
              onClick={() => {
                toast.action!.run();
                onDone();
              }}
            >
              {toast.action.label}
            </button>
          )}
          <button type="button" className="ed-toast__x" aria-label="Dismiss" onClick={onDone}>
            <CloseBold size={14} />
          </button>
        </div>
      )}
      </div>
    </div>
  );
}

const SHORTCUTS: [string, string][] = [
  ["Undo / Redo", "Ctrl+Z / Ctrl+Shift+Z"],
  ["Download", "Ctrl+S"],
  ["Delete selected", "Delete"],
  ["Nudge 1 pt / 10 pt", "Arrows / Shift+Arrows"],
  ["Duplicate (next page)", "Ctrl+D (Ctrl+Alt+D)"],
  ["Copy / Paste", "Ctrl+C / Ctrl+V"],
  ["Forward / Backward", "Ctrl+] / Ctrl+["],
  ["Zoom in / out / 100%", "Ctrl++ / Ctrl+− / Ctrl+0"],
  ["Next / previous page", "Page Down / Page Up"],
  ["Stop, deselect", "Esc"],
  ["Move between areas", "F6"],
];

function ShortcutsDialog({ open, onClose, singleKeys, setSingleKeys }: { open: boolean; onClose: () => void; singleKeys: boolean; setSingleKeys: (v: boolean) => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Keyboard shortcuts" onCloseButton={onClose} wide>
      <div className="grid gap-4 sm:grid-cols-2">
        <dl className="ed-keys">
          {TOOLS.filter((t) => DOCK_ORDER.includes(t.id)).map((t) => (
            <div key={t.id}>
              <dt>{TOOL_NAMES[t.id]}</dt>
              <dd>
                <kbd>{t.key}</kbd>
              </dd>
            </div>
          ))}
        </dl>
        <dl className="ed-keys">
          {SHORTCUTS.map(([a, b]) => (
            <div key={a}>
              <dt>{a}</dt>
              <dd>
                <kbd>{b}</kbd>
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <label className="mt-4 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={singleKeys} onChange={(e) => setSingleKeys(e.target.checked)} />
        Single-key tool shortcuts
      </label>
    </Dialog>
  );
}

