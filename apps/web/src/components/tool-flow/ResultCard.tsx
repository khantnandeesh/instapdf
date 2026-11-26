"use client";
import "@/components/berry/berry-loader.css";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type Ref } from "react";
import { swap } from "@/lib/motion/flow";
import { formatBytes } from "@/lib/pdf/naming";
import { entryBlob, storedZipEntries, type ZipEntrySlice } from "@/lib/pdf/zip-entries";
import { openPdf } from "@/lib/pdf/pdfjs";
import { renderPage } from "@/lib/pdf/thumbnails";
import type { FlowTool } from "@/tools/registry";
import { Button, buttonClasses } from "../ui/Button";
import { BerryLoader } from "../berry/Berry";
import { cx } from "../ui/cx";
import { IconButton } from "../ui/IconButton";
import { CheckIcon, DownloadIcon, DownloadSimpleIcon, FilesIcon, ShareIcon, ShieldIcon } from "../ui/icons";
import { Notice } from "../ui/Notice";
import { copy } from "./copy";
import { PrivacyNote } from "./notes";
import type { ToolOutput } from "./types";
import { cloudUi, loadCloud } from "../cloud/tool-cloud";

/*
 * F23: every check is `process.env.NEXT_PUBLIC_CLOUD_SOURCES === "1"` written out (a build-time constant),
 * shaped so that builds without cloud sources fold to main's exact code.
 */

/**
 * F23: the cloud chunk for the result (Save to cloud), and the privacy line when a cloud is involved.
 * When any file came from a cloud the chunk is here already, so that line is right in the first draw
 * (AC-131); otherwise the chunk comes in its own time (it is idle-prefetched once files are in).
 */
function useResultCloud() {
  const [ui, setUi] = useState(cloudUi);
  useEffect(() => {
    if (!ui) loadCloud().then(setUi, () => {});
  }, [ui]);
  const [line, setLine] = useState(() => ui?.originPrivacyLine() ?? null);
  return { ui, line, setLine };
}

export function ResultCard({
  output,
  tool,
  continueTargets,
  onContinue,
  onStartOver,
  onBack,
  announce,
  ref,
}: {
  output: ToolOutput;
  tool: FlowTool;
  continueTargets: FlowTool[];
  onContinue: (target: FlowTool) => void;
  onStartOver: () => void;
  onBack: () => void;
  announce: (message: string) => void;
  /** The card's root (ToolFlow fades it out on Back to options, T12). */
  ref?: Ref<HTMLElement>;
}) {
  // F23: the privacy line when the files came from a cloud or a copy went to one.
  // eslint-disable-next-line react-hooks/rules-of-hooks -- the flag is a build-time constant: the same call on every render
  const cloud = process.env.NEXT_PUBLIC_CLOUD_SOURCES === "1" ? useResultCloud() : null;
  const SaveToCloud = process.env.NEXT_PUBLIC_CLOUD_SOURCES === "1" ? cloud!.ui?.SaveToCloud : undefined;
  const download = useRef<HTMLAnchorElement>(null);
  const isZip = output.type === "application/zip";
  // Created in an effect and revoked in its cleanup, so StrictMode's double
  // mount never leaves the link pointing at a revoked URL.
  const [url, setUrl] = useState<string | undefined>();
  useEffect(() => {
    const u = URL.createObjectURL(output.blob);
    setUrl(u);
    return () => {
      URL.revokeObjectURL(u);
      setUrl(undefined);
    };
  }, [output.blob]);
  // Focus lands on Download once it is a real link (it needs its href to be focusable).
  const focused = useRef(false);
  useEffect(() => {
    if (url && !focused.current) {
      focused.current = true;
      // No scroll jump: ToolFlow already brought the result to the top of the page.
      download.current?.focus({ preventScroll: true });
    }
  }, [url]);
  // Download success (motion.md T13): the download starts on the click; the arrow turns into a tick
  // (200ms, the one other overshoot) and back after 2.4s (120ms). The button stays enabled throughout.
  const [downloaded, setDownloaded] = useState(false);
  const arrow = useRef<HTMLSpanElement>(null);
  const tick = useRef<HTMLSpanElement>(null);
  const shownTick = useRef(false);
  // A layout effect: the crossfade starts from the commit that swaps the icons' CSS, so the tick never
  // shows at full opacity for a frame before its fade.
  useLayoutEffect(() => {
    if (downloaded === shownTick.current) return;
    shownTick.current = downloaded;
    if (downloaded) swap(arrow.current, tick.current, "tick");
    else swap(tick.current, arrow.current, "swap");
  }, [downloaded]);
  useEffect(() => {
    if (!downloaded) return;
    const t = setTimeout(() => setDownloaded(false), 2400);
    return () => clearTimeout(t);
  }, [downloaded]);

  const file = useMemo(() => new File([output.blob], output.name, { type: output.type }), [output]);
  const [canShare, setCanShare] = useState(false);
  useEffect(() => {
    try {
      setCanShare(typeof navigator.canShare === "function" && navigator.canShare({ files: [file] }));
    } catch {
      setCanShare(false);
    }
  }, [file]);

  const pageCount = output.pageCount ?? output.entries?.reduce((s, e) => s + e.pageCount, 0) ?? 0;
  // A ZIP says how many files it holds (spec F4/F5 UI P-3 "Result"); a PDF its pages.
  const summary = isZip && output.entries ? `${formatBytes(output.size)} · ${copy.files(output.entries.length)}` : `${formatBytes(output.size)} · ${copy.pages(pageCount)}`;
  const titleId = "ip-result-title";

  return (
    // BerryPDF Panel: one centred white panel (20px radius, sand outline, soft pink shadow);
    // Download is the single berry action. A leaf-green tick says "done" (success, not category).
    <section ref={ref} aria-labelledby={titleId} className="mp-panel mp-pop-in mx-auto w-full max-w-[760px] p-5 sm:p-10" data-testid="result">
      <h2 id={titleId} className="flex items-center gap-3 font-display text-[22px] leading-[1.2] font-semibold text-ink-black">
        <span className="mp-tick-in grid size-10 place-items-center rounded-full bg-[var(--mp-alert-ok-bg)] text-leaf">
          <CheckIcon size={24} />
        </span>
        {copy.resultTitle(isZip)}
      </h2>
      <div className="mt-[30px] flex flex-col items-center gap-[30px] sm:flex-row sm:items-start">
        {isZip && output.entries ? <EntryWell output={output} entries={output.entries} announce={announce} /> : <ResultPreview output={output} />}
        <div className="flex w-full min-w-0 flex-1 flex-col gap-4">
          <div>
            <p className="text-tile-title break-all text-ink-black" data-testid="result-name">
              {output.name}
            </p>
            <p id="ip-result-summary" className="text-sm text-muted tabular-nums">
              {summary}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              ref={download}
              href={url}
              download={output.name}
              aria-describedby="ip-result-summary"
              onClick={() => {
                setDownloaded(true);
                announce("Downloaded");
              }}
              className={buttonClasses("primary", "lg", "max-sm:w-full")}
            >
              <span className="inline-flex items-center gap-2">
                {/* Both icons share one cell; CSS shows one, lib/motion crossfades them. */}
                <span className="grid *:col-start-1 *:row-start-1">
                  <span ref={arrow} className={downloaded ? "opacity-0" : undefined}>
                    <DownloadIcon />
                  </span>
                  <span ref={tick} className={downloaded ? undefined : "opacity-0"}>
                    <CheckIcon />
                  </span>
                </span>
                Download
              </span>
            </a>
            {/* F23: Save to cloud before Share. Share is written out twice so that builds without cloud sources
                keep main's children exactly (the second branch is main's code). */}
            {process.env.NEXT_PUBLIC_CLOUD_SOURCES === "1" ? (
              <>
                {SaveToCloud && <SaveToCloud file={file} toolName={tool.flow.title} announce={announce} onSaved={cloud!.setLine} />}
                {canShare && (
                  <Button
                    variant="line"
                    className="self-center max-sm:w-full"
                    iconStart={<ShareIcon size={16} />}
                    onClick={() => {
                      navigator.share({ files: [file] }).catch(() => {});
                    }}
                  >
                    Share
                  </Button>
                )}
              </>
            ) : (
              canShare && (
                <Button
                  variant="line"
                  className="self-center max-sm:w-full"
                  iconStart={<ShareIcon size={16} />}
                  onClick={() => {
                    navigator.share({ files: [file] }).catch(() => {});
                  }}
                >
                  Share
                </Button>
              )
            )}
          </div>
          <div className="flex flex-col gap-2">
            {process.env.NEXT_PUBLIC_CLOUD_SOURCES === "1" && tool.runtime === "client" && cloud!.line ? (
              // F23: the privacy line names the cloud the files came from or went to (PrivacyNote's look).
              <p className="flex items-center gap-2 text-sm text-ink" data-testid="privacy-result">
                <ShieldIcon size={18} className="shrink-0 text-brand-strong" />
                {cloud!.line}
              </p>
            ) : (
              <PrivacyNote runtime={tool.runtime} context="result" />
            )}
            {output.wasEncrypted && <Notice tone="warning">{copy.resultUnencrypted}</Notice>}
          </div>
          {!isZip && continueTargets.length > 0 && (
            <div>
              <h3 className="font-display text-[15px] font-semibold text-ink">{copy.resultContinue}</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {continueTargets.map((t) => (
                  <Button key={t.slug} variant="soft" onClick={() => onContinue(t)}>
                    {t.name}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="mt-[30px] flex flex-col gap-2 border-t-[1.5px] border-sand pt-5 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="ghost" onClick={onStartOver} className="max-sm:w-full">
          Start over
        </Button>
        <button type="button" onClick={onBack} className="h-11 rounded-sm px-2 font-display text-[16px] font-medium text-brand-strong underline-offset-4 hover:underline max-sm:w-full">
          Back to options
        </button>
      </div>
    </section>
  );
}

const ROWS = 4;
const ROWS_PHONE = 3;

/**
 * The ZIP's entries in the preview well (spec F4/F5 UI P-3 "Result", decision 7): up to 4 rows (3 on
 * phones), then "Show all {n}", which grows the list in place (the page scrolls, not the list). Each
 * row downloads its own file, sliced from the ZIP (stored entries, nothing is copied), so a phone
 * gets one part in one tap without unzipping. Below 640 px the well sits under the Download button.
 */
function EntryWell({ output, entries, announce }: { output: ToolOutput; entries: { name: string; pageCount: number }[]; announce: (message: string) => void }) {
  const [all, setAll] = useState(false);
  const [slices, setSlices] = useState<ZipEntrySlice[] | null>(null);
  const list = useRef<HTMLUListElement>(null);
  // "Show all" removes itself: focus goes to the first row it revealed (its download button), not to body.
  const revealAt = useRef(-1);
  useEffect(() => {
    const at = revealAt.current;
    if (!all || at < 0) return;
    revealAt.current = -1;
    const row = list.current?.children[at] as HTMLElement | undefined;
    const target = row?.querySelector<HTMLElement>("[data-testid=entry-download]") ?? row;
    if (target === row) row?.setAttribute("tabindex", "-1");
    target?.focus();
  }, [all]);
  useEffect(() => {
    let alive = true;
    storedZipEntries(output.blob).then(
      (s) => alive && setSlices(s && s.length === entries.length ? s : null),
      () => alive && setSlices(null),
    );
    return () => {
      alive = false;
    };
  }, [output.blob, entries.length]);
  const shown = all ? entries : entries.slice(0, ROWS);
  const more = all ? 0 : entries.length - ROWS;
  return (
    <div className="mp-tray w-full shrink-0 p-3 max-sm:order-last sm:w-[240px]" data-testid="result-well">
      <ul ref={list} className="flex flex-col" data-testid="result-entries">
        {shown.map((e, i) => (
          <li key={i} className={cx("flex h-11 items-center gap-2 text-sm", !all && i >= ROWS_PHONE && "max-sm:hidden")}>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-ink" title={e.name}>
                {e.name}
              </span>
              <span className="block text-help text-muted tabular-nums">{copy.pages(e.pageCount)}</span>
            </span>
            {slices && <EntryDownload name={e.name} blob={() => entryBlob(output.blob, slices[i])} announce={announce} />}
          </li>
        ))}
      </ul>
      {(more > 0 || (!all && entries.length > ROWS_PHONE)) && (
        <button
          type="button"
          onClick={() => {
            // The first row not shown yet: the 4th row on phones (it is rendered but hidden), else the 5th.
            const rows = [...(list.current?.children ?? [])] as HTMLElement[];
            const hidden = rows.findIndex((r) => r.offsetParent === null);
            revealAt.current = hidden >= 0 ? hidden : rows.length;
            setAll(true);
          }}
          className={cx("mt-1 h-11 rounded-sm px-1 font-display text-[15px] font-medium text-brand-strong underline-offset-4 hover:underline", more <= 0 && "sm:hidden")}
        >
          {copy.showAll(entries.length)}
        </button>
      )}
    </div>
  );
}

/** One entry's 36px download button; the arrow turns into a tick for a moment (motion.md T13). */
function EntryDownload({ name, blob, announce }: { name: string; blob: () => Blob; announce: (message: string) => void }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(false), 2400);
    return () => clearTimeout(t);
  }, [done]);
  return (
    <IconButton
      label={copy.downloadEntry(name)}
      variant="raised"
      className="size-9 shrink-0"
      data-testid="entry-download"
      icon={done ? <CheckIcon size={18} className="mp-tick-in" /> : <DownloadSimpleIcon size={18} />}
      onClick={() => {
        const url = URL.createObjectURL(blob());
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        setDone(true);
        announce(copy.downloadedEntry(name));
      }}
    />
  );
}

/** Fixed square box: first page of the output, rendered locally from its bytes. */
function ResultPreview({ output }: { output: ToolOutput }) {
  const host = useRef<HTMLSpanElement>(null);
  const [ready, setReady] = useState(false);
  const isPdf = output.type === "application/pdf";
  useEffect(() => {
    if (!isPdf) return;
    let alive = true;
    let destroy: (() => void) | undefined;
    (async () => {
      const bytes = new Uint8Array(await output.blob.arrayBuffer());
      const r = await openPdf(bytes);
      if (!r.ok) return;
      if (!alive) {
        void r.pdf.task.destroy(); // unmounted while opening: nothing will clean up later
        return;
      }
      destroy = () => void r.pdf.task.destroy();
      const box = host.current?.parentElement?.clientWidth || 240;
      const canvas = await renderPage(r.pdf.doc, 0, box);
      if (!alive) return;
      // Fit the whole page in the square (width and height auto, both capped): a portrait page is
      // height-bound, a landscape one width-bound, and nothing is cropped. The host is a flex box of a
      // definite size, so the canvas's max-height resolves (in a grid its auto row grew to the canvas).
      canvas.className = "ip-fade-in block h-auto max-h-full w-auto max-w-full shadow-paper";
      canvas.setAttribute("role", "img");
      canvas.setAttribute("aria-label", "Preview of page 1 of the result");
      canvas.dataset.testid = "result-preview";
      host.current?.replaceChildren(canvas);
      setReady(true);
    })().catch(() => {});
    return () => {
      alive = false;
      destroy?.();
    };
  }, [output, isPdf]);
  return (
    <div className="mp-tray relative grid size-[200px] shrink-0 place-items-center p-2.5 sm:size-[240px] sm:p-4">
      {isPdf ? <span ref={host} className="flex h-full min-h-0 w-full min-w-0 items-center justify-center" /> : <FilesIcon size={64} className="text-brand-strong" />}
      {!ready && isPdf && <BerryLoader size="sm" className="absolute" />}
    </div>
  );
}
