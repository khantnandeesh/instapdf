"use client";
import { useId } from "react";
import { retryDownload, stopDownload } from "./intake-engine";
import type { CloudDownload } from "./tool-cloud";
import { ProgressBar } from "../ui/ProgressBar";
import { Button } from "../ui/Button";
import { CloseIcon, ErrorIcon, RotateRightIcon } from "../ui/icons";
import { transferCopy } from "./transfer-copy";
import { ProviderMark } from "./ProviderMark";

/**
 * One card per file on its way from a provider (spec U-5 "Downloading", U-7): the provider mark on a
 * white page, a jam bar with the percent, the name and "1.4 of 3.3 MB", and a Stop button.
 * A failed download keeps its card with Retry (no picker again, AC-150) and Remove.
 */
export type CloudDownloadsProps = { downloads: CloudDownload[] };

export function CloudDownloads({ downloads }: CloudDownloadsProps) {
  if (!downloads.length) return null;
  const onStop = stopDownload;
  const onRetry = retryDownload;
  return (
    <div role="list" aria-label="Files on their way" className="ip-dl-list" data-testid="cloud-downloads">
      {downloads.map((d) => (
        <DownloadCard key={d.key} d={d} onStop={onStop} onRetry={onRetry} />
      ))}
    </div>
  );
}

function DownloadCard({ d, onStop, onRetry }: { d: CloudDownload; onStop: (key: string) => void; onRetry: (key: string) => void }) {
  const metaId = useId();
  const failed = d.status === "failed";
  const pct = d.total > 0 ? Math.min(100, Math.round((d.loaded / d.total) * 100)) : d.status === "arrived" ? 100 : 0;
  return (
    <div role="listitem" aria-busy={failed ? undefined : true} aria-describedby={failed ? metaId : undefined} className={failed ? "ip-dl ip-dl--failed" : "ip-dl"} data-testid="cloud-download">
      <div className="ip-dl__page">
        <span className="ip-dl__paper">{failed ? <ErrorIcon size={32} /> : <ProviderMark provider={d.provider} size={36} />}</span>
        <button
          type="button"
          className="mp-iconbtn ip-dl__x size-[34px]"
          aria-label={failed ? transferCopy.remove(d.name) : transferCopy.stop(d.name)}
          title={failed ? transferCopy.remove(d.name) : transferCopy.stop(d.name)}
          onClick={() => onStop(d.key)}
        >
          <CloseIcon size={16} />
        </button>
      </div>
      {failed ? (
        <Button variant="line" size="sm" className="self-center" iconStart={<RotateRightIcon size={14} />} onClick={() => onRetry(d.key)}>
          {transferCopy.retry}
        </Button>
      ) : (
        <div className="ip-dl__bar">
          <ProgressBar label={transferCopy.downloadingLabel(d.name)} value={pct} valueText={`${pct}%, ${transferCopy.cardBytes(d.loaded, d.total)}`} />
          <span aria-hidden="true">{transferCopy.cardPercent(pct)}</span>
        </div>
      )}
      <p className="ip-dl__name" title={d.name}>
        {d.name}
      </p>
      <p id={metaId} className="ip-dl__meta">
        {failed ? transferCopy.cardStopped : transferCopy.cardBytes(d.loaded, d.total)}
      </p>
    </div>
  );
}
