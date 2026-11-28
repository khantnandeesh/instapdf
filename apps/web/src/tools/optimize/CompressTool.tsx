"use client";
import { useRemembered } from "@/components/page-select/hooks";
import { MoreOptions } from "@/components/page-select/MoreOptions";
import { Group } from "@/components/page-select/OptionGroup";
import { ToolFlow } from "@/components/tool-flow/ToolFlow";
import type { ProcessFn } from "@/components/tool-flow/types";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { warmPlainImages } from "@/lib/pdf/pdfjs";
import { warmWorker } from "@/lib/pdf/worker-client";
import { flowTool } from "@/tools/registry";
import { compressCopy as c } from "./compress-copy";
import "../doc-tools/doc-tools.css";

const tool = flowTool("compress-pdf");

/** JPEG quality behind each name. Regular is what most files want: clean on screen, a fraction of the size. */
export const QUALITIES = { low: 45, regular: 65, good: 80, best: 92 } as const;
type Quality = keyof typeof QUALITIES;
/** The most pixels an inch a picture keeps at the size the page shows it. */
const PPIS = ["72", "100", "150", "220", "300", "keep"] as const;
type Ppi = (typeof PPIS)[number];
type Remembered = { quality: Quality; ppi: Ppi; gray: boolean };
const defaults: Remembered = { quality: "regular", ppi: "72", gray: false };
const QUALITY_KEYS = Object.keys(QUALITIES) as Quality[];
const check = (s: Record<string, unknown>): Partial<Remembered> => ({
  ...(QUALITY_KEYS.includes(s.quality as Quality) ? { quality: s.quality as Quality } : {}),
  ...(PPIS.includes(s.ppi as Ppi) ? { ppi: s.ppi as Ppi } : {}),
  ...(typeof s.gray === "boolean" ? { gray: s.gray } : {}),
});

/**
 * Compress (spec F6): the pictures of a PDF are scaled to the size they are shown at and packed
 * again, in this tab; the file is then written without anything it does not use. Text and drawings
 * are not touched. Nothing is uploaded.
 */
export function CompressTool() {
  const [opts, setOpts, optsLive] = useRemembered(tool.slug, defaults, check);
  const process: ProcessFn = async (files, signal, onProgress) => {
    const { compressPdfs } = await import("@/lib/pdf/compress-run");
    const o = optsLive.current;
    return compressPdfs(
      files.map((f) => ({ name: f.name, source: f.source, password: f.password, pageCount: f.pageCount })),
      { quality: QUALITIES[o.quality], ppi: o.ppi === "keep" ? null : Number(o.ppi), gray: o.gray },
      tool.flow.outputName?.(files.map((f) => f.name)) ?? "",
      signal,
      onProgress,
    );
  };
  const quality = (where: string) => (
    <Select id={`compress-quality-${where}`} label={c.quality} hideLabel={where === "bar"} value={opts.quality} options={QUALITY_KEYS.map((value) => ({ value, label: (where === "bar" ? c.short : c.qualities)[value] }))} onChange={(v) => setOpts({ quality: v })} />
  );
  const ppi = (where: string) => <Select id={`compress-ppi-${where}`} label={c.ppi} value={opts.ppi} options={PPIS.map((value) => ({ value, label: c.ppis[value] }))} onChange={(v) => setOpts({ ppi: v })} />;
  const gray = (where: string) => ({ id: `compress-gray-${where}`, label: c.gray, value: opts.gray, onChange: (gray: boolean) => setOpts({ gray }) });
  return (
    <ToolFlow
      tool={tool}
      process={process}
      warm={() => {
        warmWorker(["compressScan", "jpegEncode", "compress"]);
        void import("@/lib/pdf/compress-run");
        warmPlainImages();
      }}
      renderMore={(ctx) => <MoreOptions changed={Number(opts.ppi !== defaults.ppi) + Number(opts.gray)} disabled={ctx.disabled} content={{ togglesTitle: c.extras, toggles: [gray("more")], extra: ppi("more") }} />}
      renderOptions={() => (
        <div className="flex min-w-0 items-center gap-3 dock-side:flex-col dock-side:items-stretch dock-bar:flex-1">
          <div className="ip-opt-bar min-w-0 dock-bar:flex-1">{quality("bar")}</div>
          <div className="ip-opt-side">
            <Group n={1} title={c.step}>
              {quality("side")}
              {ppi("side")}
              <p className="ip-doc-note">{c.note}</p>
            </Group>
            <Group n={2} title={c.extras}>
              <Switch {...(({ value, ...t }) => ({ ...t, checked: value }))(gray("side"))} spread />
              <p className="ip-doc-note">{c.extrasNote}</p>
            </Group>
          </div>
        </div>
      )}
    />
  );
}
