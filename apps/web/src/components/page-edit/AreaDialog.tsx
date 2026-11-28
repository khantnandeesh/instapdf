"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { renderSize } from "@/components/tool-flow/preview-fit";
import type { FlowApi, LoadedFile } from "@/components/tool-flow/types";
import type { Area } from "@/lib/pdf/area";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { ChevronLeftIcon, ChevronRightIcon } from "../ui/icons";
import { IconButton } from "../ui/IconButton";
import { AreaSelect } from "./AreaSelect";

/** The page is drawn once at this size (CSS px, longer side) and scaled by the layout. */
const DRAW = 640;

export const areaDialogCopy = { prev: "Previous page", next: "Next page", done: "Done" };

/**
 * A dialog with one page and a box to drag on it (Split by text, Crop). The box applies at once;
 * `status` is the line under the page that says what the box does on the page shown, and `action`
 * an extra button beside Done. The arrows step through the file's pages.
 */
export function AreaDialog({
  open,
  onClose,
  file,
  api,
  area,
  onChange,
  title,
  help,
  areaLabel,
  status,
  action,
  maxPages = Infinity,
}: {
  open: boolean;
  onClose: () => void;
  file: LoadedFile | undefined;
  api: FlowApi | null;
  area: Area;
  onChange: (area: Area) => void;
  title: string;
  help: string;
  areaLabel: string;
  status: (index: number) => ReactNode;
  action?: (index: number) => ReactNode;
  /** Show only the file's first pages (Rename reads the first page). */
  maxPages?: number;
}) {
  const [at, setAt] = useState(0);
  const host = useRef<HTMLSpanElement>(null);
  const done = useRef<HTMLButtonElement>(null);
  const count = Math.min(file?.pageCount ?? 0, maxPages);
  const index = Math.min(at, Math.max(0, count - 1));
  const size = file?.pages?.[index] ?? { width: 1, height: 1.414 };
  const id = file?.id;

  useEffect(() => {
    if (!open || !id || !api) return;
    host.current?.replaceChildren();
    return api.renderPage(id, index, renderSize(DRAW, window.devicePixelRatio), (canvas) => {
      canvas.className = "block h-full w-full";
      host.current?.replaceChildren(canvas);
    });
  }, [open, id, index, api]);

  // As wide as the dialog allows, or as wide as about half the screen's height allows: the dialog always fits.
  const width = `min(100%, calc(52dvh * ${size.width / size.height}))`;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      onCloseButton={onClose}
      title={title}
      description={help}
      initialFocusRef={done}
      footer={
        <>
          {action?.(index)}
          <Button ref={done} variant="primary" onClick={onClose}>
            {areaDialogCopy.done}
          </Button>
        </>
      }
    >
      <div className="flex flex-col items-center gap-3">
        <AreaSelect value={area} onChange={onChange} label={areaLabel} className="ip-area--page">
          <span ref={host} aria-hidden="true" className="block" style={{ aspectRatio: `${size.width} / ${size.height}`, width, minWidth: width }} />
        </AreaSelect>
        <div className="flex w-full items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-sm text-ink" aria-live="polite" data-testid="area-text">
            {status(index)}
          </p>
          {count > 1 && (
            <div className="flex shrink-0 items-center gap-1">
              <IconButton label={areaDialogCopy.prev} size="sm" disabled={index === 0} onClick={() => setAt(index - 1)} icon={<ChevronLeftIcon size={16} />} />
              <span className="ip-area__count text-sm text-ink">
                {index + 1} / {count}
              </span>
              <IconButton label={areaDialogCopy.next} size="sm" disabled={index >= count - 1} onClick={() => setAt(index + 1)} icon={<ChevronRightIcon size={16} />} />
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
