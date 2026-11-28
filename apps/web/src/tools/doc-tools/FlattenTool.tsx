"use client";
import { useRemembered } from "@/components/page-select/hooks";
import { Group } from "@/components/page-select/OptionGroup";
import { ToolFlow } from "@/components/tool-flow/ToolFlow";
import type { ProcessFn } from "@/components/tool-flow/types";
import { Select } from "@/components/ui/Select";
import { PICTURE_DPI, type PictureDpi } from "@/lib/pdf/picture-dpi";
import { runInWorker } from "@/lib/pdf/worker-client";
import { flowTool } from "@/tools/registry";
import { flattenCopy as c } from "./copy";
import "./doc-tools.css";

const tool = flowTool("flatten-pdf");

type What = "both" | "fields" | "pictures";
type Remembered = { what: What; dpi: PictureDpi };
const defaults: Remembered = { what: "both", dpi: 150 };
const OPTIONS: { value: What; label: string }[] = [
  { value: "both", label: c.both },
  { value: "fields", label: c.fields },
  { value: "pictures", label: c.pictures },
];
const QUALITIES = PICTURE_DPI.map((dpi) => ({ value: String(dpi), label: c.dpi[dpi] }));
const SHORT = OPTIONS.map((o) => ({ value: o.value, label: c.short[o.value] }));
const SHORT_QUALITIES = PICTURE_DPI.map((dpi) => ({ value: String(dpi), label: `${dpi} dpi` }));
const check = (s: Record<string, unknown>): Partial<Remembered> => ({
  ...(OPTIONS.some((o) => o.value === s.what) ? { what: s.what as What } : {}),
  ...(PICTURE_DPI.includes(s.dpi as PictureDpi) ? { dpi: s.dpi as PictureDpi } : {}),
});

/**
 * Flatten (spec F10 §2): form fields, and annotations when asked, are drawn into the pages for good.
 * Text stays text, unless whole pages are asked for as pictures (§2b): those are drawn in this tab.
 */
export function FlattenTool() {
  const [opts, setOpts, optsLive] = useRemembered(tool.slug, defaults, check);
  const process: ProcessFn = async (files, signal, onProgress) => {
    const zipName = tool.flow.outputName?.(files.map((f) => f.name)) ?? "";
    if (optsLive.current.what === "pictures") {
      const { flattenToPictures } = await import("@/lib/pdf/flatten-images");
      return flattenToPictures(files.map((f) => ({ name: f.name, source: f.source, password: f.password, pageCount: f.pageCount })), optsLive.current.dpi, zipName, signal, onProgress);
    }
    const out = await runInWorker(
      { kind: "flatten", zipName, annotations: optsLive.current.what === "both", files: files.map((f) => ({ name: f.name, source: f.source, password: f.password })) },
      { signal, onProgress },
    );
    return { name: out.name, type: out.type, blob: out.blob, size: out.blob.size, pageCount: out.pageCount, entries: out.entries, wasEncrypted: out.wasEncrypted, warnings: out.warnings };
  };
  const what = (where: string) => <Select id={`flatten-what-${where}`} label={c.what} hideLabel value={opts.what} options={where === "bar" ? SHORT : OPTIONS} onChange={(v) => setOpts({ what: v })} />;
  // Always there, so nothing moves when the choice changes; it only applies to pictures.
  const quality = (where: string) => (
    <Select id={`flatten-dpi-${where}`} label={c.quality} hideLabel disabled={opts.what !== "pictures"} value={String(opts.dpi)} options={where === "bar" ? SHORT_QUALITIES : QUALITIES} onChange={(v) => setOpts({ dpi: Number(v) as PictureDpi })} />
  );
  return (
    <ToolFlow
      tool={tool}
      process={process}
      renderOptions={() => (
        <div className="flex min-w-0 items-center gap-3 dock-side:flex-col dock-side:items-stretch dock-bar:flex-1">
          <div className="ip-opt-bar ip-doc-two min-w-0 dock-bar:flex-1">
            {what("bar")}
            {quality("bar")}
          </div>
          <div className="ip-opt-side">
            <Group n={1} title={c.step}>
              {what("side")}
              {quality("side")}
              <p className="ip-doc-note">{c.note[opts.what]}</p>
            </Group>
          </div>
        </div>
      )}
    />
  );
}
