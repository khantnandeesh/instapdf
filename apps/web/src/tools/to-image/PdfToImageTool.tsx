"use client";
import { useRemembered } from "@/components/page-select/hooks";
import { MoreOptions } from "@/components/page-select/MoreOptions";
import { Step } from "@/components/page-select/Step";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { PAGE_IMAGE_DPI, type PageImageDpi, type PageImageFormat, type PageImageOptions } from "@/lib/pdf/page-images";
import { flowTool } from "@/tools/registry";
import { toImageCopy as c } from "./copy";
import { PickPagesFlow } from "./PickPagesFlow";

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

/** PDF to image (spec F12 §2): the picked pages, or all of them, as JPG, PNG or TIFF. */
export function PdfToImageTool() {
  const [opts, setOpts, optsLive] = useRemembered("pdf-to-jpg", defaults, check);
  const changed = (opts.grey ? 1 : 0) + (opts.format === "tiff" && opts.singleTiff ? 1 : 0);
  return (
    <PickPagesFlow
      tool={tool}
      verb="converted"
      gridHint={c.gridHint}
      primaryLabel={c.primary}
      warm={() => void import("@/lib/pdf/page-images")}
      run={async (sources, signal, onProgress) => (await import("@/lib/pdf/page-images")).pagesToImages(sources, optsLive.current, signal, onProgress)}
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
