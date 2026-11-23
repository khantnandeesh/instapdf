"use client";
import { useEffect, useRef, useState } from "react";
import type { ThumbnailRenderer } from "@/lib/pdf/thumbnails";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { ChevronLeftIcon, ChevronRightIcon } from "../ui/icons";
import type { ReadyFile } from "./types";

export type PreviewTarget = { items: { file: ReadyFile; index: number; rotation: number }[]; at: number };

/**
 * Large view of one page, rendered on demand at full DPR. Previous / Next
 * and the arrow keys move through `items` (a file's pages in Rotate, a
 * card's pages in Merge).
 */
export function PagePreviewDialog({
  target: preview,
  renderer,
  onNavigate,
  onClose,
  fallbackFocus,
}: {
  target: PreviewTarget | null;
  renderer: ThumbnailRenderer | null;
  onNavigate: (at: number) => void;
  onClose: () => void;
  fallbackFocus: () => HTMLElement | null;
}) {
  const item = preview?.items[preview.at];
  const target = item ? { file: item.file, index: item.index } : null;
  const at = preview?.at ?? 0;
  const total = preview?.items.length ?? 0;
  const host = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState(600);
  useEffect(() => {
    setSize(Math.round(Math.min(window.innerHeight * 0.7, window.innerWidth * 0.85)));
  }, [preview]);
  useEffect(() => {
    if (!target || !renderer) return;
    const el = host.current;
    el?.replaceChildren();
    return renderer.request(target.file.id, target.index, size, -1, (canvas) => {
      canvas.className = "ip-fade-in block h-full w-full";
      host.current?.replaceChildren(canvas);
    });
  }, [target?.file.id, target?.index, renderer, size]); // eslint-disable-line react-hooks/exhaustive-deps

  const file = target?.file;
  const index = target?.index ?? 0;
  const count = file?.pageCount ?? 0;
  const rotation = item?.rotation ?? 0;
  return (
    <Dialog
      open={!!target}
      wide
      onClose={onClose}
      fallbackFocus={fallbackFocus}
      title={file ? `Page ${index + 1} of ${count}` : ""}
      description={file?.name}
      footer={
        <>
          <Button variant="ghost" iconStart={<ChevronLeftIcon />} disabled={at <= 0} onClick={() => onNavigate(at - 1)}>
            Previous
          </Button>
          <Button variant="ghost" iconEnd={<ChevronRightIcon />} disabled={at >= total - 1} onClick={() => onNavigate(at + 1)}>
            Next
          </Button>
          <Button variant="primary" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      {file && (
        <div
          className="grid place-items-center"
          style={{ height: size, maxWidth: "100%" }}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" && at < total - 1) onNavigate(at + 1);
            if (e.key === "ArrowLeft" && at > 0) onNavigate(at - 1);
          }}
          tabIndex={0}
          role="img"
          aria-label={`Page ${index + 1} of ${file.name}`}
        >
          <span
            className="relative block bg-paper shadow-paper transition-transform duration-(--ip-duration-base)"
            style={{
              width: (file.pages[index].width * size) / Math.max(file.pages[index].width, file.pages[index].height),
              maxWidth: "100%",
              aspectRatio: `${file.pages[index].width} / ${file.pages[index].height}`,
              transform: `rotate(${rotation}deg)`,
            }}
          >
            <span ref={host} className="block h-full w-full" />
          </span>
        </div>
      )}
    </Dialog>
  );
}
