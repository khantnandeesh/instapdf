"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatBytes } from "@/lib/pdf/naming";
import { openPdf } from "@/lib/pdf/pdfjs";
import { renderPage } from "@/lib/pdf/thumbnails";
import type { FlowTool } from "@/tools/registry";
import { Button, buttonClasses } from "../ui/Button";
import { cx } from "../ui/cx";
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
  const url = useMemo(() => URL.createObjectURL(output.blob), [output.blob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  useEffect(() => download.current?.focus(), []);
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
    <section aria-labelledby={titleId} className="ip-settle mx-auto w-full max-w-[760px] rounded-xl bg-surface-raised p-5 shadow-sm sm:p-8" data-testid="result">
      <h2 id={titleId} className="flex items-center gap-3 text-xl font-semibold">
        <span className="grid size-8 place-items-center rounded-full bg-success-soft text-success">
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <path className="ip-draw" d="m5 12.5 4.5 4.5L19 7.5" />
          </svg>
        </span>
        {copy.resultTitle(isZip)}
      </h2>
      <div className="mt-6 flex flex-col items-center gap-6 sm:flex-row sm:items-start">
        <ResultPreview output={output} />
        <div className="flex w-full min-w-0 flex-1 flex-col gap-4">
          <div>
            <p className="text-lg font-semibold break-all" data-testid="result-name">
              {output.name}
            </p>
            <p id="ip-result-summary" className="text-sm text-fg-muted tabular-nums">
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
                variant="secondary"
                size="lg"
                className="max-sm:w-full"
                iconStart={<ShareIcon />}
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
              <h3 className="text-sm font-semibold">{copy.resultContinue}</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {continueTargets.map((t) => (
                  <Button key={t.slug} size="sm" variant="secondary" onClick={() => onContinue(t)}>
                    {t.name}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="mt-6 flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="ghost" onClick={onStartOver} className="max-sm:w-full">
          Start over
        </Button>
        <button type="button" onClick={onBack} className="h-11 rounded-md px-2 text-sm font-medium text-primary underline-offset-4 hover:underline max-sm:w-full">
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
          <span className="shrink-0 text-fg-muted tabular-nums">{copy.pages(e.pageCount)}</span>
        </li>
      ))}
      {entries.length > 6 && <li className="text-fg-muted">+{entries.length - 6} more</li>}
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
    <div className={cx("grid size-[200px] shrink-0 place-items-center rounded-lg bg-surface-sunken p-3 sm:size-[240px]", !ready && isPdf && "ip-pulse")}>
      {isPdf ? <span ref={host} className="grid h-full w-full place-items-center" /> : <FilesIcon size={64} className="text-fg-muted" />}
    </div>
  );
}
