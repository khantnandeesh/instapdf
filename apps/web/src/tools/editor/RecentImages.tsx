"use client";
/**
 * The Image tool's first step when this device has used images before (AC-66): the last five, one
 * click to place again, each removable, and "Choose image" for a new file. They live in this
 * browser's IndexedDB (lib/editor/persist) and are never sent anywhere. With none saved, the
 * Image tool opens the file picker straight away and this never shows.
 */
import { useEffect, useMemo, useRef } from "react";
import { flushSync } from "react-dom";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import type { RecentImage } from "@/lib/editor/persist";
import { exit } from "@/lib/motion";
import { flip } from "@/lib/motion/flow";
import { CloseBold, ImageBold } from "./icons";

export function RecentImages({
  open,
  images,
  sheet,
  onPick,
  onRemove,
  onChoose,
  onClose,
}: {
  open: boolean;
  images: RecentImage[];
  /** Phones and tablets: a bottom sheet. */
  sheet: boolean;
  onPick: (img: RecentImage) => void;
  onRemove: (id: string) => void;
  onChoose: () => void;
  onClose: () => void;
}) {
  const list = useRef<HTMLUListElement>(null);
  const choose = useRef<HTMLButtonElement>(null);
  // One object URL per image while the list is open (none held while it is closed). Released a
  // moment after, so the closing fade still shows them.
  const urls = useMemo(
    () => new Map(open ? images.map((img) => [img.id, URL.createObjectURL(new Blob([img.bytes as Uint8Array<ArrayBuffer>], { type: img.mime }))]) : []),
    [images, open],
  );
  useEffect(() => () => void setTimeout(() => urls.forEach((u) => URL.revokeObjectURL(u)), 600), [urls]);

  const remove = async (id: string, el: HTMLElement | null) => {
    const last = images.length === 1;
    // Focus never falls to the page: to the next image, or to Choose image.
    const items = Array.from(list.current?.querySelectorAll<HTMLButtonElement>(".ed-recent__use") ?? []);
    const at = items.findIndex((b) => b.dataset.id === id);
    const next = items[at + 1] ?? items[at - 1];
    await exit(el, "thumb");
    flip(list.current, () => flushSync(() => onRemove(id)), "reorder");
    (last ? choose.current : next)?.focus();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      onCloseButton={onClose}
      title="Recent images"
      variant={sheet ? "sheet" : "default"}
      className="ed-recent"
      initialFocusRef={choose}
      footer={
        <Button ref={choose} variant="primary" iconStart={<ImageBold size={18} />} onClick={onChoose} data-testid="recent-choose">
          Choose image
        </Button>
      }
    >
      <ul ref={list} className="ed-recent__list" aria-label="Recent images" data-testid="recent-images">
        {images.map((img, i) => (
          <li key={img.id} className="ed-recent__item">
            <button type="button" className="ed-recent__use" data-id={img.id} aria-label={`Place recent image ${i + 1}`} onClick={() => onPick(img)}>
              {/* eslint-disable-next-line @next/next/no-img-element -- a local blob URL, not an optimisable asset */}
              <img src={urls.get(img.id)} alt="" draggable={false} />
            </button>
            <button type="button" className="ed-recent__x" aria-label={`Remove recent image ${i + 1}`} onClick={(e) => void remove(img.id, e.currentTarget.closest("li"))}>
              <CloseBold size={12} />
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
