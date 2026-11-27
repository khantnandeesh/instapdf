"use client";
import { useEffect } from "react";
import { useRemembered } from "@/components/page-select/hooks";
import { ToolFlow } from "@/components/tool-flow/ToolFlow";
import { ChevronDownIcon } from "@/components/ui/icons";
import type { MenuEntry } from "@/components/ui/Menu";
import { Select } from "@/components/ui/Select";
import { cx } from "@/components/ui/cx";
import { sortPages, type SortKey } from "@/lib/page-list";
import { IMAGE_PAGE_SIZES, setImagePreviewLayout, type ImageLayout, type ImagePageSizeName } from "@/lib/pdf/images";
import { ORGANIZE_OPTIONS } from "@/lib/pdf/merge-options";
import { pdfOutputName } from "@/lib/pdf/naming";
import { mergeCopy } from "@/tools/merge/copy";
import { AddMenus, EditorDialogs, EditWorkspace, usePrefetchEditing } from "@/tools/merge/editing";
import { fullHistory } from "@/tools/merge/full-history";
import { PlainMenuButton, SortGlyph, toolbarButton, usePageWorkspace } from "@/tools/merge/workspace";
import { flowTool } from "@/tools/registry";
import { fromImageCopy as c } from "./copy";

const tool = flowTool("jpg-to-pdf");

/** In the grid every image is its own page: the tile shows the whole image, whatever page size is chosen. */
const PREVIEW: ImageLayout = { size: "fit", orientation: "auto", margin: 0 };

type Remembered = { size: ImagePageSizeName; orientation: ImageLayout["orientation"]; margin: "0" | "36" | "72" };
const defaults: Remembered = { size: "a4", orientation: "auto", margin: "0" };
const SIZES = (["fit", ...Object.keys(IMAGE_PAGE_SIZES)] as ImagePageSizeName[]).map((value) => ({ value, label: c.sizes[value] }));
const ORIENTATIONS = (["auto", "portrait", "landscape"] as const).map((value) => ({ value, label: c.orientations[value] }));
const MARGINS = (["0", "36", "72"] as const).map((value) => ({ value, label: c.margins[value] }));
const check = (s: Record<string, unknown>): Partial<Remembered> => ({
  ...(SIZES.some((o) => o.value === s.size) ? { size: s.size as ImagePageSizeName } : {}),
  ...(ORIENTATIONS.some((o) => o.value === s.orientation) ? { orientation: s.orientation as Remembered["orientation"] } : {}),
  ...(MARGINS.some((o) => o.value === s.margin) ? { margin: s.margin as Remembered["margin"] } : {}),
});

const menuButton = `${toolbarButton} max-xl:size-11 max-xl:px-0`;

/**
 * Image to PDF (spec F12 §3): Organize's workspace for pictures. Each image (or TIFF frame) is one
 * page; drag to reorder, rotate, remove, then choose the page size, orientation and margin.
 */
export function ImageToPdfTool() {
  const ws = usePageWorkspace({ tool, history: fullHistory });
  usePrefetchEditing();
  const { pagesRef, sourcesRef } = ws;
  const [opts, setOpts, optsLive] = useRemembered("jpg-to-pdf", defaults, check);

  useEffect(() => {
    setImagePreviewLayout(PREVIEW);
    return () => setImagePreviewLayout(undefined);
  }, []);

  const sortBy = (key: SortKey) => ws.reorder(sortPages(pagesRef.current, sourcesRef.current, key), "sort", mergeCopy.sorted[key]);
  const sortItems = (): MenuEntry[] => {
    const enough = ws.readyPages.length >= 2;
    return (["name-asc", "name-desc", "date-asc", "date-desc"] as const).map((k) => ({ id: k, label: mergeCopy.sortItems[k], disabled: !enough, onSelect: () => sortBy(k) }));
  };

  const changed = (Object.keys(defaults) as (keyof Remembered)[]).filter((k) => opts[k] !== defaults[k] && !(k === "orientation" && opts.size === "fit")).length;
  // The same three fields twice: one compact row from 1280 px, labelled and stacked behind Options below it.
  const selects = (id: string, compact: boolean) => (
    <>
      <Select id={`${id}-size`} label={c.size} hideLabel={compact} value={opts.size} options={SIZES} onChange={(size) => setOpts({ size })} />
      <Select id={`${id}-margin`} label={c.margin} hideLabel={compact} value={opts.margin} options={MARGINS} onChange={(margin) => setOpts({ margin })} />
      {/* A page that fits its image has no orientation to choose; the slot stays so nothing shifts. */}
      <div className={cx(opts.size === "fit" && "invisible")} aria-hidden={opts.size === "fit" || undefined} inert={opts.size === "fit"}>
        <Select id={`${id}-orientation`} label={c.orientation} hideLabel={compact} value={opts.orientation} options={ORIENTATIONS} onChange={(orientation) => setOpts({ orientation })} />
      </div>
    </>
  );

  return (
    <>
      <ToolFlow
        tool={tool}
        {...ws.flowProps}
        process={ws.runList(
          () => pagesRef.current,
          () => {
            const o = optsLive.current;
            return { ...ORGANIZE_OPTIONS, bookmarks: "remove", imageLayout: { size: o.size, orientation: o.orientation, margin: Number(o.margin) } };
          },
          (first) => pdfOutputName(first ?? "images.pdf"),
        )}
        copyOverrides={{ pickerButton: c.pickerButton, pickerHint: c.pickerHint, limits: c.limits, limitsFull: c.limitsFull, statusEmpty: c.statusEmpty, errorType: c.errorType }}
        readyStatus={() => c.status(ws.readyPages.length)}
        renderWorkspace={(w) => <EditWorkspace ws={ws} w={w} labels={{ pages: { list: c.pagesLabel }, segments: { list: c.filesLabel } }} />}
        toolbarStart={(w) => (
          <PlainMenuButton label={c.sort} items={sortItems()} disabled={w.dimmed} className={menuButton} title={c.sort} data-testid="sort-menu">
            <SortGlyph />
            <span className="max-xl:sr-only">{c.sort}</span>
            <ChevronDownIcon size={16} className="max-xl:hidden" />
          </PlainMenuButton>
        )}
        toolbarEnd={(w) => <AddMenus ws={ws} w={w} loaded={[]} />}
        dockStart={ws.renderHistory}
        optionsBadge={changed ? mergeCopy.changed(changed) : undefined}
        rowOptionsComplete
        rowOptions={() => <div className="flex items-center gap-2 [&>div]:w-[150px]">{selects("i2p-row", true)}</div>}
        renderOptions={() => <div className="flex flex-col gap-3.5">{selects("i2p", false)}</div>}
      />
      <EditorDialogs ws={ws} />
    </>
  );
}
