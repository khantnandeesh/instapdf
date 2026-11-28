"use client";
import { formatBytes } from "@/lib/pdf/naming";
import { IconButton } from "../ui/IconButton";
import { CloseIcon, LockIcon } from "../ui/icons";
import { Spinner } from "../ui/Spinner";
import { copy } from "./copy";
import { TilePage, TileRemove } from "../tile/parts";
import { PageThumb } from "./Thumbnail";
import type { LoadedFile } from "./types";

/** Files view: one card per file. (F3 adds drag reordering through `reorderable`.) */
export function FileGrid({ files, onRemove }: { files: LoadedFile[]; onRemove: (file: LoadedFile) => void; reorderable?: boolean }) {
  return (
    <div role="list" aria-label="Files" className="ip-tile-grid" data-testid="file-grid">
      {files.map((f) => (
        <FileCard key={f.id} file={f} onRemove={() => onRemove(f)} />
      ))}
    </div>
  );
}

export function FileCard({ file, onRemove }: { file: LoadedFile; onRemove: () => void }) {
  const meta =
    file.status === "loading" ? "Reading…" : file.status === "locked" ? "Password needed" : `${file.damaged ? copy.damaged : copy.pages(file.pageCount)} · ${formatBytes(file.size)}`;
  return (
    <div role="listitem" className="group/tile ip-tile flex min-w-0 flex-col gap-1" data-testid="file-card">
      <div className="ip-tile__box relative grid place-items-center">
        {file.status === "ready" && file.pages ? (
          <TilePage size={file.pages[0]}>
            <PageThumb fileId={file.id} index={0} />
          </TilePage>
        ) : file.status === "loading" ? (
          <Spinner size={24} label={`Reading ${file.name}`} className="text-brand-strong" />
        ) : (
          <LockIcon size={28} className="text-muted" />
        )}
        <TileRemove label={`Remove ${file.name}`} className="max-lg:hidden" onClick={onRemove} />
      </div>
      {/* Below 1024 px the remove button sits beside the name, never on the page (PT-1 rule 6). */}
      <span className="mt-0.5 flex min-w-0 items-center gap-1">
        <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink" title={file.name}>
          {file.name}
        </span>
        <IconButton label={`Remove ${file.name}`} variant="soft" className="size-11 shrink-0 lg:hidden" icon={<CloseIcon size={18} />} onClick={onRemove} />
      </span>
      <span className="text-sm text-muted tabular-nums" data-testid="file-meta">
        {meta}
      </span>
    </div>
  );
}
