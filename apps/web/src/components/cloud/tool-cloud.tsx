"use client";
/**
 * F23 cloud sources on tool pages: the only cloud code in a tool page's first-load JS. It holds the
 * page's cloud state (the hub), draws the caret and the one-tap row at their final size, and opens a
 * provider's window inside the click. Everything else (the caret's menu, the intake, the download
 * cards, Save to cloud, Merge's menus) is one chunk, ui.ts, fetched only on intent: a pointer over a
 * cloud control, focus on one, a tap, or files arriving. Nothing preloads it (scripts/first-load-budget.mjs
 * counts preloads too).
 *
 * The cloud stylesheet comes in here, with the page's own CSS: the cloud chunk then has none, so the
 * webpack runtime on every page keeps a single lazy stylesheet, as before F23.
 *
 * Builds without cloud sources (next.config.ts CLOUD_ON) swap this module for tool-cloud.off.ts and
 * never call it (AC-120).
 */
import "./cloud.css";
import { useEffect, useState } from "react";
import { buildNames, buildProviders, providerName, type CloudProvider } from "@/lib/cloud/names";
import { popupFeatures } from "@/lib/cloud/popup";
import type { CloudFlow } from "./editor-flow";
import type { FlowNoticeInput } from "../tool-flow/types";
import { cx } from "../ui/cx";
import { ChevronDownIcon } from "../ui/icons";
import { cloudCopy } from "./copy";
import type { Intake } from "./intake-engine";
import { ProviderMark } from "./ProviderMark";

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
  /** The tool page's flow config (the editor's landing passes its own subset, editor-flow.ts). */
  tool: { flow: CloudFlow };
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
  /**
   * The tool's own "from this device" button: focused when the person chose "Choose from this device"
   * in a provider window that couldn't open. It can't be opened for them: the click was in the other
   * window, and a file chooser needs a click in this tab.
   */
  devicePicker?: () => HTMLElement | null;
};

/** What the tool page shows of the cloud intake (set by the engine). */
export type CloudState = {
  downloads: CloudDownload[];
  /** "Getting 2 files from Dropbox…" while files are on their way; null otherwise. */
  busy: string | null;
};

type UI = typeof import("./ui");

/** One per tool page, stable for its life: the intake's state and inputs, and the intake once made. */
export type CloudHub = {
  s: CloudState;
  set: (s: CloudState) => void;
  deps?: CloudDeps;
  intake?: Intake;
  /** The cloud chunk, once here. */
  ui?: UI;
  /** Fetches the cloud chunk (once; loadCloud). */
  load: () => Promise<UI>;
  /** Redraws the page (the cloud chunk is here). */
  draw: () => void;
};

/** A blank window opened in the click before the cloud chunk was here: the intake sends it on. Null: blocked. */
export type PreOpened = { win: Window | null };

/** The tap the cloud chunk is on its way for: the latest choice, and the one window opened for it. */
let early: { p: CloudProvider; trigger: HTMLElement; pre?: PreOpened } | undefined;
/** A blank window at the cloud window's usual size, in the click. Offline: none (the intake says why). */
const blank = (): PreOpened | undefined => (navigator.onLine === false ? undefined : { win: window.open("", "", popupFeatures(window)) });

const providers = buildProviders();

/** The tool page's hub (one ToolFlow per page), for the parts that live outside it (Save to cloud, Merge's menus). */
let current: CloudHub | undefined;
export const pageHub = () => current;

let ui: UI | undefined;
let loading: Promise<UI> | undefined;
/** Fetches the cloud chunk once (again after a failed fetch), whoever asks for it, and redraws the tool page with it. */
export const loadCloud = (): Promise<UI> =>
  (loading ??= import("./ui").then(
    (m) => {
      ui = m;
      current?.draw();
      return m;
    },
    (e: unknown) => {
      loading = undefined;
      throw e;
    },
  ));
/** Fetches the chunk ahead of a likely use (a failed fetch is tried again on the next). */
const warm = (hub: CloudHub) => void hub.load().catch(() => {});
/** The chunk could not be fetched for a choice the person made: no connection (the intake would say the same). */
const offline = (hub: CloudHub, name: string) => hub.deps?.pushNotice({ tone: "info", title: cloudCopy.offline, body: cloudCopy.offlineBody(name) });
/** The cloud chunk if it is already here. */
export const cloudUi = () => ui;

/** The page's cloud hub: the same object for the page's life, with the latest state on `s`. */
export function useCloud() {
  const [s, set] = useState<CloudState>({ downloads: [], busy: null });
  const [, redraw] = useState(0);
  const [hub] = useState<CloudHub>(() => ({ s, set, load: loadCloud, draw: () => redraw(1) }));
  hub.s = s;
  hub.ui = ui;
  current = hub;
  useEffect(() => {
    current = hub;
    return () => {
      // Close every window this tab opened when the tool goes away.
      hub.intake?.dispose();
      if (current === hub) current = undefined;
    };
  }, [hub]);
  return hub;
}

/**
 * A pick from this device (ToolFlow's own pickers) makes "This device" the last used source (U-12):
 * lib/cloud/last-used.ts writeLast("device"), written out so that module stays in the cloud chunk.
 */
export function pickedFromDevice() {
  try {
    localStorage.setItem("berrypdf:cloud-last", "device");
  } catch {}
  document.documentElement.removeAttribute("data-cloud-last");
}

/**
 * Opens a provider's window for the page: call it synchronously in the click (the browser allows a
 * window only then). Without the cloud chunk yet, a blank window opens here and the chunk sends it on
 * to the provider's page. Taps before the chunk is here share that one window and the last one wins:
 * one cloud window at a time, and no window is left behind waiting for a pick that was replaced.
 */
function pick(hub: CloudHub, p: CloudProvider, trigger: HTMLElement) {
  if (hub.ui) return hub.ui.openCloud(p, trigger);
  if (early) {
    Object.assign(early, { p, trigger });
    // Its window again, or a new one if it was closed (or blocked) meanwhile.
    const win = early.pre?.win;
    if (win && !win.closed) win.focus();
    else early.pre = blank();
    return;
  }
  const tap = (early = { p, trigger, pre: blank() });
  hub.load().then(
    (m) => {
      early = undefined;
      m.openCloud(tap.p, tap.trigger, {}, tap.pre);
    },
    () => {
      early = undefined;
      tap.pre?.win?.close();
      offline(hub, providerName[tap.p]);
    },
  );
}

/**
 * The caret half of the upload split button (spec U-2 E1/E2), at its final size before the cloud
 * chunk is here. A pointer over it (touch included: pointerenter comes first), focus or a press fetch
 * the chunk, which then draws the real menu button in its place (SourceCaret), focused if this one
 * was, and open if this one was pressed.
 */
export function CloudCaret({ hub, look, className, disabled }: { hub: CloudHub; look: "primary" | "tool"; className?: string; disabled?: boolean }) {
  const [start, setStart] = useState<"open" | "focus">();
  // Not swapped while a mouse button is down on it: the press then ends in a click here (no lost click).
  const [pressed, setPressed] = useState(false);
  // The toolbar's caret shows once files are in: fetch the chunk then (the result's Save to cloud needs it too).
  useEffect(() => {
    if (look === "tool") warm(hub);
  }, [hub, look]);
  if (!providers.length) return null;
  // In the toolbar of a single-file tool the clouds replace the file.
  const replace = look === "tool" && !hub.deps?.tool.flow.multiFile;
  const Real = pressed ? undefined : hub.ui?.SourceCaret;
  if (Real) return <Real look={look} replace={replace} className={className} disabled={disabled} start={start} />;
  const label = look === "primary" ? cloudCopy.caret() : cloudCopy.caretToolbar(replace);
  const load = () => warm(hub);
  return (
    <button
      type="button"
      aria-haspopup="menu"
      aria-expanded="false"
      aria-label={label}
      title={label}
      disabled={disabled}
      className={cx("mp-btn ip-split__caret", look === "primary" ? "mp-btn--lg" : "mp-btn--tool", className)}
      data-testid={look === "primary" ? "cloud-caret" : "cloud-caret-toolbar"}
      onPointerEnter={load}
      onPointerDown={() => {
        setPressed(true);
        load();
      }}
      onPointerLeave={(e) => e.pointerType !== "touch" && setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      onFocus={() => {
        setStart("focus");
        load();
      }}
      onBlur={() => setStart(undefined)}
      onClick={() => {
        setPressed(false);
        setStart("open");
        hub.load().catch(() => offline(hub, buildNames()));
      }}
    >
      <ChevronDownIcon size={look === "primary" ? 20 : 16} />
    </button>
  );
}

/**
 * One-tap provider buttons under the upload button (spec U-2 E1, AC-165), in the fixed order and at
 * their final 44 px height; the pre-paint script's html[data-cloud-last] moves the last used provider
 * first and shows its name (cloud.css), so nothing shifts after hydration. The chip's `title` and
 * its sr-only "(last used)" (a tooltip and a clipped span, no layout) are added after mount, only on
 * the provider that really was used last.
 */
export function CloudRow({ hub }: { hub: CloudHub }) {
  // The provider really used last (html[data-cloud-last], set before paint and after each pick): only
  // its button carries "(last used)", in the DOM as well as in its name, never the others (fresh profile: none).
  const [last, setLast] = useState<string>();
  useEffect(() => {
    const html = document.documentElement;
    const read = () => setLast(html.dataset.cloudLast);
    read();
    const watch = new MutationObserver(read);
    watch.observe(html, { attributes: true, attributeFilter: ["data-cloud-last"] });
    return () => watch.disconnect();
  }, []);
  if (!providers.length) return null;
  const load = () => warm(hub);
  return (
    <div role="group" aria-label={cloudCopy.rowLabel} className="ip-cloud-row" data-testid="cloud-row">
      {providers.map((p) => (
        <button
          key={p}
          type="button"
          className="ip-cloud-glyph"
          data-p={p}
          title={last === p ? `${providerName[p]}${cloudCopy.lastUsed}` : providerName[p]}
          onPointerEnter={load}
          onFocus={load}
          onClick={(e) => pick(hub, p, e.currentTarget)}
        >
          <ProviderMark provider={p} size={22} />
          <span className="ip-cloud-name">
            <span className="sr-only">Choose from </span>
            {providerName[p]}
          </span>
          {last === p && <span className="ip-cloud-last">{cloudCopy.lastUsed}</span>}
        </button>
      ))}
    </div>
  );
}
