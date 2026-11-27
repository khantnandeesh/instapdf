"use client";
import { useRef } from "react";
import { useDebouncedAnnounce, useRemembered } from "@/components/page-select/hooks";
import { MoreOptions } from "@/components/page-select/MoreOptions";
import { Step } from "@/components/page-select/Step";
import { usePageSelection } from "@/components/page-select/usePageSelection";
import { ToolFlow } from "@/components/tool-flow/ToolFlow";
import type { FlowApi, ProcessFn, ReadyFile } from "@/components/tool-flow/types";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { PAGE_IMAGE_DPI, type PageImageDpi, type PageImageFormat, type PageImageOptions, type PageImageSource } from "@/lib/pdf/page-images";
import { flowTool } from "@/tools/registry";
import { toImageCopy as c } from "./copy";

const tool = flowTool("pdf-to-jpg");

type Remembered = PageImageOptions;
const defaults: Remembered = { format: "jpg", dpi: 150, grey: false, singleTiff: false };
const FORMATS: { value: PageImageFormat; label: string }[] = [
  { value: "jpg", label: "JPG" },
  { value: "png", label: "PNG" },
  { value: "tiff", label: "TIFF" },
];
const SIZES = PAGE_IMAGE_DPI.map((dpi) => ({ value: String(dpi), label: c.sizes[dpi].label, title: c.sizes[dpi].title }));
const check = (s: Record<string, unknown>): Partial<Remembered> => ({
  ...(FORMATS.some((f) => f.value === s.format) ? { format: s.format as PageImageFormat } : {}),
  ...(PAGE_IMAGE_DPI.includes(s.dpi as PageImageDpi) ? { dpi: s.dpi as PageImageDpi } : {}),
  ...(typeof s.grey === "boolean" ? { grey: s.grey } : {}),
  ...(typeof s.singleTiff === "boolean" ? { singleTiff: s.singleTiff } : {}),
});

/** The pages to draw from each file: the picked ones, or every page when nothing is picked. */
export function imageSources(files: readonly ReadyFile[], sets: Record<string, number[] | undefined>, anyPicked: boolean): PageImageSource[] {
  return files.map((f) => ({
    name: f.name,
    source: f.source,
    password: f.password,
    pageCount: f.pageCount,
    pages: anyPicked ? [...(sets[f.id] ?? [])].sort((a, b) => a - b) : Array.from({ length: f.pageCount }, (_, i) => i),
  }));
}

/** PDF to image (spec F12 §2): the picked pages, or all of them, as JPG, PNG or TIFF. */
export function PdfToImageTool() {
  const apiRef = useRef<FlowApi | null>(null);
  const announce = useDebouncedAnnounce(apiRef);
  const s = usePageSelection((state, files) => {
    const picked = files.reduce((n, f) => n + (state.sets[f.id]?.length ?? 0), 0);
    if (files.length) announce(c.live(picked, files.reduce((n, f) => n + f.pageCount, 0)));
  });
  const [opts, setOpts, optsLive] = useRemembered("pdf-to-jpg", defaults, check);
  // Nothing picked means every page.
  const pages = s.count || s.total;

  const process: ProcessFn = async (files, signal, onProgress) => {
    const now = s.current();
    const { pagesToImages } = await import("@/lib/pdf/page-images");
    return pagesToImages(imageSources(files, now.state.sets, now.count > 0), optsLive.current, signal, onProgress);
  };
  const changed = (opts.grey ? 1 : 0) + (opts.format === "tiff" && opts.singleTiff ? 1 : 0);

  return (
    <ToolFlow
      tool={tool}
      apiRef={apiRef}
      process={process}
      onFilesChange={s.onFilesChange}
      onReset={s.reset}
      readyStatus={() => c.status(pages, s.total)}
      primaryLabel={() => c.primary(pages)}
      gridHint={c.gridHint}
      decoratePage={(file, index) => {
        const picked = (s.state.sets[file.id] ?? []).includes(index);
        return { pendingDelta: 0, inScope: picked, picked, pressed: picked, label: c.tile(index + 1, file.pageCount) };
      }}
      onTileActivate={(file, index, mods) => s.activate(file.id, index, mods.shift)}
      onPageKey={(_file, _index, key, e) => {
        if (key === "Escape") {
          s.clear();
          return true;
        }
        if ((key === "a" || key === "A") && (e?.ctrlKey || e?.metaKey)) {
          s.selectAll();
          return true;
        }
        return false;
      }}
      renderMore={(ctx) => (
        <MoreOptions
          changed={changed}
          disabled={ctx.disabled}
          content={{
            toggles: [
              { id: "grey", label: c.grey, value: opts.grey, onChange: (grey) => setOpts({ grey }) },
              ...(opts.format === "tiff" ? [{ id: "single-tiff", label: c.singleTiff, value: opts.singleTiff, onChange: (singleTiff: boolean) => setOpts({ singleTiff }) }] : []),
            ],
          }}
        />
      )}
      renderOptions={() => (
        <div className="flex min-w-0 items-center gap-3 dock-side:flex-col dock-side:items-stretch dock-side:gap-3.5 max-sm:flex-1 max-sm:flex-wrap">
          <Step n={1}>{c.stepFormat}</Step>
          <SegmentedControl look="tabs" label={c.format} value={opts.format} options={FORMATS} onChange={(format) => setOpts({ format })} className="shrink-0" />
          <Step n={2}>{c.stepSize}</Step>
          <SegmentedControl look="tabs" label={c.size} value={String(opts.dpi)} options={SIZES} onChange={(v) => setOpts({ dpi: Number(v) as PageImageDpi })} className="shrink-0" />
        </div>
      )}
    />
  );
}
