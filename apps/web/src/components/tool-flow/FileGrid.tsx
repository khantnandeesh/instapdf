"use client";
import { formatBytes } from "@/lib/pdf/naming";
import { IconButton } from "../ui/IconButton";
import { CloseIcon, LockIcon } from "../ui/icons";
import { Spinner } from "../ui/Spinner";
import { copy } from "./copy";
import { pageBoxStyle } from "./PageTile";
import { PageThumb } from "./Thumbnail";
import type { LoadedFile } from "./types";

/** Files view: one card per file. (F3 adds drag reordering through `reorderable`.) */
export function FileGrid({ files, onRemove }: { files: LoadedFile[]; onRemove: (file: LoadedFile) => void; reorderable?: boolean }) {
  return (
    <div role="list" aria-label="Files" className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,var(--ip-thumb-size))] sm:gap-4" data-testid="file-grid">
      {files.map((f) => (
        <FileCard key={f.id} file={f} onRemove={() => onRemove(f)} />
      ))}
    </div>
  );
}

export function FileCard({ file, onRemove }: { file: LoadedFile; onRemove: () => void }) {
  const meta =
    file.status === "loading" ? "Reading…" : file.status === "locked" ? "Password needed" : `${copy.pages(file.pageCount)} · ${formatBytes(file.size)}`;
  return (
    <div role="listitem" className="ip-settle flex min-w-0 flex-col gap-1" data-testid="file-card">
      <div className="ip-paper-lit relative grid aspect-square w-(--ip-thumb-size) place-items-center rounded-lg bg-well max-sm:w-full">
        {file.status === "ready" && file.pages ? (
          <span className="ip-paper relative block overflow-hidden shadow-paper" style={pageBoxStyle(file.pages[0])}>
            <PageThumb fileId={file.id} index={0} />
          </span>
        ) : file.status === "loading" ? (
          <Spinner size={24} label={`Reading ${file.name}`} className="text-primary-ink" />
        ) : (
          <LockIcon size={28} className="text-fg-muted" />
        )}
        <IconButton
          label={`Remove ${file.name}`}
          size="sm"
          variant="raised"
          className="absolute top-1 right-1 shadow-md"
          icon={<CloseIcon size={18} />}
          onClick={onRemove}
        />
      </div>
      <span className="truncate text-sm font-medium" title={file.name}>
        {file.name}
      </span>
      <span className="text-xs text-fg-muted tabular-nums" data-testid="file-meta">
        {meta}
      </span>
    </div>
  );
}
