/**
 * View models for Merge's two views, built from the page list. Lives with the
 * lazy grid chunks so the route's first load stays small (spec F3 M-10).
 */
import type { LoadedFile } from "@/components/tool-flow/types";
import { describeSourcePages, isBlank, pageLabel, segmentsOf, type PageRef, type SourceInfo } from "@/lib/page-list";
import { normalizeRotation } from "@/lib/pdf/rotation";
import { editCopy as c } from "@/tools/merge/copy-edit";
import type { CardView } from "./SegmentGrid";
import type { TileView } from "./EditablePageGrid";

export type ListModel = { pages: PageRef[]; sources: Record<string, SourceInfo>; files: Map<string, LoadedFile> };

const statusOf = (pending: boolean, file: LoadedFile | undefined) => (pending ? (file?.status === "locked" ? "locked" : "loading") : "ready") as CardView["status"];

/** One card per segment (files view). */
export function buildCards({ pages, sources, files }: ListModel): CardView[] {
  return segmentsOf(pages).map((seg) => {
    const src = seg.sourceId ? sources[seg.sourceId] : undefined;
    const file = seg.sourceId ? files.get(seg.sourceId) : undefined;
    const pending = seg.pages.some((p) => p.pending);
    const real = seg.pages.filter((p) => !isBlank(p) && !p.pending);
    const blank = seg.pages.filter(isBlank).length;
    const first = real[0];
    const part = src ? describeSourcePages(real.map((p) => p.sourceIndex), src.pageCount) : "";
    const name = src?.name ?? c.blankName;
    const rotation = first?.rotation ?? 0;
    return {
      key: seg.key,
      uids: seg.pages.map((p) => p.uid),
      letter: src?.letter ?? "",
      name,
      fileId: file?.id ?? null,
      status: statusOf(pending, file),
      thumbIndex: first?.sourceIndex ?? 0,
      thumbSize: first?.size ?? null,
      rotation,
      accessibleName: c.cardName(name, seg.pages.length, part, c.rotated(normalizeRotation(rotation))),
      meta: pending
        ? file?.status === "locked"
          ? "Password needed"
          : "Reading…"
        : c.cardMeta({ image: src?.kind === "image", pages: seg.pages.length, blank, part, total: src?.pageCount ?? 0 }),
    };
  });
}

/** One tile per page (pages view). */
export function buildTiles({ pages, sources, files }: ListModel, selection: ReadonlySet<string>, inserted: ReadonlySet<string>): TileView[] {
  return pages.map((p) => {
    const src = p.sourceId ? sources[p.sourceId] : undefined;
    const file = p.sourceId ? files.get(p.sourceId) : undefined;
    const label = p.pending ? (src?.letter ?? "") : pageLabel(p, sources);
    const rotated = c.rotated(normalizeRotation(p.rotation));
    return {
      uid: p.uid,
      label,
      accessibleName: isBlank(p) ? [c.blankName, rotated].filter(Boolean).join(", ") : p.pending ? `Reading ${src?.name ?? ""}` : c.tileName(label, p.sourceIndex + 1, src?.name ?? "", rotated),
      fileId: file?.id ?? null,
      sourceIndex: p.sourceIndex,
      size: p.size,
      rotation: p.rotation,
      blank: isBlank(p),
      status: statusOf(!!p.pending, file),
      selected: selection.has(p.uid),
      inserted: inserted.has(p.uid),
    };
  });
}
