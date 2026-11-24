"use client";
import "@/components/berry/berry-loader.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatBytes } from "@/lib/pdf/naming";
import { openPdf } from "@/lib/pdf/pdfjs";
import { renderPage } from "@/lib/pdf/thumbnails";
import type { FlowTool } from "@/tools/registry";
import { Button, buttonClasses } from "../ui/Button";
import { BerryLoader } from "../berry/Berry";
import { CheckIcon, DownloadIcon, FilesIcon, ShareIcon } from "../ui/icons";
import { Notice } from "../ui/Notice";
import { copy } from "./copy";
import { PrivacyNote } from "./notes";
import type { ToolOutput } from "./types";

export function ResultCard({
  output,
  tool,
  continueTargets,
  onContinue,
  onStartOver,
  onBack,
  announce,
}: {
  output: ToolOutput;
  tool: FlowTool;
  continueTargets: FlowTool[];
  onContinue: (target: FlowTool) => void;
  onStartOver: () => void;
  onBack: () => void;
  announce: (message: string) => void;
}) {
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
  const [downloaded, setDownloaded] = useState(false);
  useEffect(() => {
    if (!downloaded) return;
    const t = setTimeout(() => setDownloaded(false), 1500);
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
  const summary = `${formatBytes(output.size)} · ${copy.pages(pageCount)}`;
  const titleId = "ip-result-title";

  return (
    // BerryPDF Panel: one centred white panel (20px radius, sand outline, soft pink shadow);
    // Download is the single berry action. A leaf-green tick says "done" (success, not category).
    <section aria-labelledby={titleId} className="mp-panel mp-pop-in mx-auto w-full max-w-[760px] p-5 sm:p-10" data-testid="result">
      <h2 id={titleId} className="flex items-center gap-3 font-display text-[22px] leading-[1.2] font-semibold text-ink-black">
        <span className="mp-tick-in grid size-10 place-items-center rounded-full bg-[var(--mp-alert-ok-bg)] text-leaf">
          <CheckIcon size={24} />
        </span>
        {copy.resultTitle(isZip)}
      </h2>
      <div className="mt-[30px] flex flex-col items-center gap-[30px] sm:flex-row sm:items-start">
        <ResultPreview output={output} />
        <div className="flex w-full min-w-0 flex-1 flex-col gap-4">
          <div>
            <p className="text-tile-title break-all text-ink-black" data-testid="result-name">
              {output.name}
            </p>
            <p id="ip-result-summary" className="text-sm text-muted tabular-nums">
              {summary}
            </p>
          </div>
          {isZip && output.entries && <EntryList entries={output.entries} />}
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
                {downloaded ? <CheckIcon /> : <DownloadIcon />}
                Download
              </span>
            </a>
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
          </div>
          <div className="flex flex-col gap-2">
            <PrivacyNote runtime={tool.runtime} context="result" />
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

function EntryList({ entries }: { entries: { name: string; pageCount: number }[] }) {
  const shown = entries.slice(0, 6);
  return (
    <ul className="space-y-1 text-sm" data-testid="result-entries">
      {shown.map((e, i) => (
        <li key={i} className="flex gap-2">
          <span className="min-w-0 truncate" title={e.name}>
            {e.name}
          </span>
          <span className="shrink-0 text-muted tabular-nums">{copy.pages(e.pageCount)}</span>
        </li>
      ))}
      {entries.length > 6 && <li className="text-muted">+{entries.length - 6} more</li>}
    </ul>
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
      canvas.className = "ip-fade-in block max-h-full max-w-full shadow-paper";
      canvas.style.width = `${canvas.width / Math.min(2, window.devicePixelRatio || 1)}px`;
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
    <div className="mp-tray relative grid size-[200px] shrink-0 place-items-center p-4 sm:size-[240px]">
      {isPdf ? <span ref={host} className="grid h-full w-full place-items-center" /> : <FilesIcon size={64} className="text-brand-strong" />}
      {!ready && isPdf && <BerryLoader size="sm" className="absolute" />}
    </div>
  );
}
