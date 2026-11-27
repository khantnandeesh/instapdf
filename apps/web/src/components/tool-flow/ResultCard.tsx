"use client";
import "./layout.css";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type Ref } from "react";
import { swap } from "@/lib/motion/flow";
import { formatBytes } from "@/lib/pdf/naming";
import { entryBlob, storedZipEntries, type ZipEntrySlice } from "@/lib/pdf/zip-entries";
import { openPdf } from "@/lib/pdf/pdfjs";
import { renderPage } from "@/lib/pdf/thumbnails";
import type { FlowTool } from "@/tools/registry";
import { Button, buttonClasses } from "../ui/Button";
import { cx } from "../ui/cx";
import { IconButton } from "../ui/IconButton";
import { CheckIcon, DownloadIcon, DownloadSimpleIcon, FilesIcon, ShareIcon, ShieldIcon } from "../ui/icons";
import { LinkButton } from "../ui/LinkButton";
import { Notice } from "../ui/Notice";
import { copy } from "./copy";
import { slotCopy } from "./slot-copy";
import { PrivacyNote } from "./notes";
import type { ToolOutput } from "./types";
import { cloudUi, loadCloud } from "../cloud/tool-cloud";

/*
 * F23: every check is `process.env.NEXT_PUBLIC_CLOUD_SOURCES === "1"` written out (a build-time constant),
 * shaped so that builds without cloud sources fold to main's exact code.
 */

/** F23: the cloud chunk for the result (Save to cloud and the origin privacy line). */
function useResultCloud() {
  const [ui, setUi] = useState(cloudUi);
  useEffect(() => {
    if (!ui) loadCloud().then(setUi, () => {});
  }, [ui]);
  return ui;
}

/**
 * The result's one Download (F25 §7, AC-646): in the action slot, in the primary's former box (the top
 * row from 1024px, the bottom dock below), with Save to Drive beside it when cloud sources are on. It
 * takes focus once it is a real link. The arrow turns into a tick for 2.4s on a click (motion.md T13).
 */
export function ResultDownload({
  output,
  tool,
  announce,
  onSaved,
  sizeAs,
}: {
  output: ToolOutput;
  tool: FlowTool;
  announce: (message: string) => void;
  /** The primary's label: Download is sized to fit it too, so it takes the primary's exact box (eval G-3). */
  sizeAs?: string;
  /** F23: a copy went to a cloud; the result's privacy line names it. */
  onSaved: (line: string) => void;
}) {
  // eslint-disable-next-line react-hooks/rules-of-hooks -- the flag is a build-time constant: the same call on every render
  const ui = process.env.NEXT_PUBLIC_CLOUD_SOURCES === "1" ? useResultCloud() : null;
  const SaveToCloud = process.env.NEXT_PUBLIC_CLOUD_SOURCES === "1" ? ui?.SaveToCloud : undefined;
  const download = useRef<HTMLAnchorElement>(null);
  // Created in an effect and revoked in its cleanup, so StrictMode's double mount never leaves the link
  // pointing at a revoked URL.
  const [url, setUrl] = useState<string | undefined>();
  useEffect(() => {
    const u = URL.createObjectURL(output.blob);
    setUrl(u);
    return () => {
      URL.revokeObjectURL(u);
      setUrl(undefined);
    };
  }, [output.blob]);
  const focused = useRef(false);
  useEffect(() => {
    if (url && !focused.current) {
      focused.current = true;
      download.current?.focus({ preventScroll: true });
    }
  }, [url]);
  const [downloaded, setDownloaded] = useState(false);
  const arrow = useRef<HTMLSpanElement>(null);
  const tick = useRef<HTMLSpanElement>(null);
  const shownTick = useRef(false);
  // A layout effect: the crossfade starts from the commit that swaps the icons' CSS.
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
  const file = useMemo(() => (SaveToCloud ? new File([output.blob], output.name, { type: output.type }) : null), [SaveToCloud, output]);
  return (
    <>
      {/* F23: Save to Drive, a 48 px icon button before Download; from 1024 it sits in the status's place, and
          below 1024 in the dock row's room left of the slot (layout.css .ip-slot__drive). */}
      {process.env.NEXT_PUBLIC_CLOUD_SOURCES === "1" && SaveToCloud && file && (
        <span className="ip-slot__drive">
          <SaveToCloud file={file} toolName={tool.flow.title} announce={announce} onSaved={onSaved} />
        </span>
      )}
      <a
        ref={download}
        href={url}
        download={output.name}
        aria-describedby="ip-result-summary"
        onClick={() => {
          setDownloaded(true);
          announce("Downloaded");
        }}
        className={buttonClasses("primary", "lg", "ip-slot__main ip-slot__download")}
        data-testid="save-main"
      >
        <span className="ip-slot__size" data-size={sizeAs}>
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
            {copy.download}
          </span>
        </span>
      </a>
    </>
  );
}

/**
 * The result (F25 §7): the stage becomes it. From 1024px the output preview on the left (at least 85%
 * of the stage's height, at the page's aspect) and the info column on the right (max 420px, centred);
 * below, the preview fills the width up to 55dvh with the info under it. Download is not here: it is in
 * the action slot (`ResultDownload`).
 */
export function ResultCard({
  output,
  tool,
  continueTargets,
  onContinue,
  onStartOver,
  onBack,
  announce,
  cloudLine,
  ref,
}: {
  output: ToolOutput;
  tool: FlowTool;
  continueTargets: FlowTool[];
  onContinue: (target: FlowTool) => void;
  onStartOver: () => void;
  onBack: () => void;
  announce: (message: string) => void;
  /** F23: the privacy line after a copy went to a cloud. */
  cloudLine?: string | null;
  /** The result's root (ToolFlow fades it out on Back to editing, T12). */
  ref?: Ref<HTMLElement>;
}) {
  // eslint-disable-next-line react-hooks/rules-of-hooks -- the flag is a build-time constant: the same call on every render
  const ui = process.env.NEXT_PUBLIC_CLOUD_SOURCES === "1" ? useResultCloud() : null;
  // eslint-disable-next-line react-hooks/rules-of-hooks -- as above
  const [originLine] = process.env.NEXT_PUBLIC_CLOUD_SOURCES === "1" ? useState(() => ui?.originPrivacyLine() ?? null) : [null];
  const line = process.env.NEXT_PUBLIC_CLOUD_SOURCES === "1" ? (cloudLine ?? originLine ?? ui?.originPrivacyLine() ?? null) : null;
  const isZip = output.type === "application/zip";
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
  // "5 pages, 21 KB." A ZIP says how many files it holds (spec F4/F5 UI P-3 "Result").
  const base = isZip && output.entries ? `${copy.files(output.entries.length)}, ${formatBytes(output.size)}.` : `${copy.pages(pageCount)}, ${formatBytes(output.size)}.`;
  const summary = output.note ? `${base} ${output.note}` : base;
  const titleId = "ip-result-title";

  return (
    <section ref={ref} aria-labelledby={titleId} className="ip-result" data-testid="result">
      <ResultPreview output={output} />
      <div className="ip-result__info">
        <h2 id={titleId} className="flex items-center gap-3 font-display text-[22px] leading-[1.2] font-semibold text-ink-black">
          <span className="mp-tick-in grid size-10 shrink-0 place-items-center rounded-full bg-[var(--mp-alert-ok-bg)] text-leaf">
            <CheckIcon size={24} />
          </span>
          {copy.resultTitle(isZip)}
        </h2>
        <div>
          <p className="font-display text-[17px] leading-[1.3] font-semibold break-all text-ink-black" data-testid="result-name">
            {output.name}
          </p>
          <p id="ip-result-summary" className="text-sm text-muted tabular-nums">
            {summary}
          </p>
        </div>
        {isZip && output.entries && <EntryList output={output} entries={output.entries} announce={announce} />}
        {canShare && (
          <Button
            variant="line"
            className="self-start max-sm:w-full"
            iconStart={<ShareIcon size={16} />}
            onClick={() => {
              navigator.share({ files: [file] }).catch(() => {});
            }}
          >
            Share
          </Button>
        )}
        <div className="flex flex-col gap-2">
          {process.env.NEXT_PUBLIC_CLOUD_SOURCES === "1" && tool.runtime === "client" && line ? (
            // F23: the privacy line names the cloud the files came from or went to (PrivacyNote's look).
            <p className="flex items-center gap-2 text-sm text-ink" data-testid="privacy-result">
              <ShieldIcon size={18} className="shrink-0 text-brand-strong" />
              {line}
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
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <LinkButton onClick={onBack} className="text-[16px]">
            {slotCopy.backToEditing}
          </LinkButton>
          <Button variant="ghost" onClick={onStartOver}>
            {slotCopy.startOver}
          </Button>
        </div>
      </div>
    </section>
  );
}

const ROWS = 4;
const ROWS_PHONE = 3;

/**
 * The ZIP's entries (spec F4/F5 UI P-13, decision 7): up to 4 rows (3 on phones), then "Show all {n}",
 * which grows the list in place. Each row downloads its own file, sliced from the ZIP (stored entries,
 * nothing is copied), so a phone gets one part in one tap without unzipping.
 */
function EntryList({ output, entries, announce }: { output: ToolOutput; entries: { name: string; pageCount: number }[]; announce: (message: string) => void }) {
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
    <div className="rounded-[14px] border-[1.5px] border-sand bg-surface px-3 py-1" data-testid="result-well">
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
        <LinkButton
          onClick={() => {
            // The first row not shown yet: the 4th row on phones (it is rendered but hidden), else the 5th.
            const rows = [...(list.current?.children ?? [])] as HTMLElement[];
            const hidden = rows.findIndex((r) => r.offsetParent === null);
            revealAt.current = hidden >= 0 ? hidden : rows.length;
            setAll(true);
          }}
          className={cx("text-[15px]", more <= 0 && "sm:hidden")}
        >
          {copy.showAll(entries.length)}
        </LinkButton>
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

/**
 * The output's first page, big (F25 §7): fitted whole into the preview box (no crop), drawn at the device
 * pixel ratio with a hairline edge. A ZIP shows its first part's first page and a quiet "1 / n files".
 */
function ResultPreview({ output }: { output: ToolOutput }) {
  const host = useRef<HTMLSpanElement>(null);
  const isZip = output.type === "application/zip";
  const count = isZip ? (output.entries?.length ?? 0) : 0;
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    let destroy: (() => void) | undefined;
    (async () => {
      let blob: Blob = output.blob;
      if (isZip) {
        const slices = await storedZipEntries(output.blob);
        const first = slices?.[0];
        if (!first) throw new Error("no entry");
        blob = entryBlob(output.blob, first);
      }
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const r = await openPdf(bytes);
      if (!r.ok) throw new Error("unreadable");
      if (!alive) {
        void r.pdf.task.destroy(); // unmounted while opening: nothing will clean up later
        return;
      }
      destroy = () => void r.pdf.task.destroy();
      const box = host.current;
      // The longest side the box can hold; CSS fits the canvas into the box at the page's aspect.
      const size = Math.min(1600, Math.max(240, box?.clientWidth ?? 0, box?.clientHeight ?? 0));
      const canvas = await renderPage(r.pdf.doc, 0, size);
      if (!alive) return;
      canvas.className = "ip-fade-in shadow-paper outline outline-1 outline-sand";
      canvas.setAttribute("role", "img");
      canvas.setAttribute("aria-label", isZip ? "Preview of page 1 of the first file" : "Preview of page 1 of the result");
      canvas.dataset.testid = "result-preview";
      host.current?.replaceChildren(canvas);
    })().catch(() => alive && setFailed(true));
    return () => {
      alive = false;
      destroy?.();
    };
  }, [output, isZip]);
  return (
    <div className="ip-result__preview" data-testid="result-preview-box">
      {failed ? <FilesIcon size={64} className="text-brand-strong" /> : <span ref={host} className="ip-result__host" />}
      {isZip && count > 1 && (
        <span className="ip-result__counter" data-testid="result-counter">
          {slotCopy.partsCounter(count)}
        </span>
      )}
    </div>
  );
}
