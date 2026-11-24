"use client";
import { useEffect, useRef, useState } from "react";
import type { ThumbnailRenderer } from "@/lib/pdf/thumbnails";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { ChevronLeftIcon, ChevronRightIcon } from "../ui/icons";
import type { ReadyFile } from "./types";

/** Vertical space the dialog needs around the page box (padding, title, file name, gaps, footer, margin). */
const PREVIEW_CHROME_PX = 272;

/** Large view of one page, rendered on demand at full DPR. Arrow keys page through. */
export function PagePreviewDialog({
  target,
  renderer,
  rotationFor,
  onNavigate,
  onClose,
  fallbackFocus,
}: {
  target: { file: ReadyFile; index: number } | null;
  renderer: ThumbnailRenderer | null;
  rotationFor: (file: ReadyFile, index: number) => number;
  onNavigate: (index: number) => void;
  onClose: () => void;
  fallbackFocus: () => HTMLElement | null;
}) {
  const host = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState(600);
  // Fit the first screen: the page box plus the dialog's title, description, footer and margins
  // (about 270px) stay inside the viewport, so Previous / Next / Close are never below the fold.
  useEffect(() => {
    const fit = () => setSize(Math.round(Math.max(200, Math.min(window.innerHeight - PREVIEW_CHROME_PX, window.innerWidth * 0.85, 900))));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [target]);
  useEffect(() => {
    if (!target || !renderer) return;
    const el = host.current;
    el?.replaceChildren();
    return renderer.request(target.file.id, target.index, size, -1, (canvas) => {
      canvas.className = "ip-fade-in block h-full w-full";
      host.current?.replaceChildren(canvas);
    });
  }, [target, renderer, size]);

  const file = target?.file;
  const index = target?.index ?? 0;
  const count = file?.pageCount ?? 0;
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
          <Button variant="ghost" iconStart={<ChevronLeftIcon />} disabled={index <= 0} onClick={() => onNavigate(index - 1)}>
            Previous
          </Button>
          <Button variant="ghost" iconEnd={<ChevronRightIcon />} disabled={index >= count - 1} onClick={() => onNavigate(index + 1)}>
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
            if (e.key === "ArrowRight" && index < count - 1) onNavigate(index + 1);
            if (e.key === "ArrowLeft" && index > 0) onNavigate(index - 1);
          }}
          tabIndex={0}
          role="img"
          aria-label={`Page ${index + 1} of ${file.name}`}
        >
          <span
            className="relative block bg-paper shadow-paper transition-transform duration-(--dur-move)"
            style={{
              width: (file.pages[index].width * size) / Math.max(file.pages[index].width, file.pages[index].height),
              maxWidth: "100%",
              aspectRatio: `${file.pages[index].width} / ${file.pages[index].height}`,
              transform: `rotate(${rotationFor(file, index)}deg)`,
            }}
          >
            <span ref={host} className="block h-full w-full" />
          </span>
        </div>
      )}
    </Dialog>
  );
}
