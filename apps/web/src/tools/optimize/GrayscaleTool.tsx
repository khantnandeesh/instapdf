"use client";
import { useRemembered } from "@/components/page-select/hooks";
import { Group } from "@/components/page-select/OptionGroup";
import { ToolFlow } from "@/components/tool-flow/ToolFlow";
import type { ProcessFn } from "@/components/tool-flow/types";
import { Select } from "@/components/ui/Select";
import type { GrayWhat } from "@/lib/pdf/grayscale-run";
import { flowTool } from "@/tools/registry";
import { grayscaleCopy as c } from "./copy";
import "../doc-tools/doc-tools.css";

const tool = flowTool("grayscale-pdf");

type Remembered = { what: GrayWhat };
const defaults: Remembered = { what: "all" };
const OPTIONS: { value: GrayWhat; label: string }[] = [
  { value: "all", label: c.all },
  { value: "vector", label: c.vector },
  { value: "pictures", label: c.pictures },
];
const SHORT = OPTIONS.map((o) => ({ value: o.value, label: c.short[o.value] }));
const check = (s: Record<string, unknown>): Partial<Remembered> => (OPTIONS.some((o) => o.value === s.what) ? { what: s.what as GrayWhat } : {});

/**
 * Grayscale (spec F13 §1): every colour becomes a grey level, in the file itself. Text stays text;
 * pictures are decoded in this tab and written back as grey pictures.
 */
export function GrayscaleTool() {
  const [opts, setOpts, optsLive] = useRemembered(tool.slug, defaults, check);
  const process: ProcessFn = async (files, signal, onProgress) => {
    const { toGrayscale } = await import("@/lib/pdf/grayscale-run");
    return toGrayscale(
      files.map((f) => ({ name: f.name, source: f.source, password: f.password, pageCount: f.pageCount })),
      optsLive.current.what,
      tool.flow.outputName?.(files.map((f) => f.name)) ?? "",
      signal,
      onProgress,
    );
  };
  const what = (where: string) => <Select id={`gray-what-${where}`} label={c.what} hideLabel value={opts.what} options={where === "bar" ? SHORT : OPTIONS} onChange={(v) => setOpts({ what: v })} />;
  return (
    <ToolFlow
      tool={tool}
      process={process}
      renderOptions={() => (
        <div className="flex min-w-0 items-center gap-3 dock-side:flex-col dock-side:items-stretch dock-bar:flex-1">
          <div className="ip-opt-bar min-w-0 dock-bar:flex-1">{what("bar")}</div>
          <div className="ip-opt-side">
            <Group n={1} title={c.step}>
              {what("side")}
              <p className="ip-doc-note">{c.note[opts.what]}</p>
            </Group>
          </div>
        </div>
      )}
    />
  );
}
