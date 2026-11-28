"use client";
import { useRemembered } from "@/components/page-select/hooks";
import { MoreOptions } from "@/components/page-select/MoreOptions";
import { Group } from "@/components/page-select/OptionGroup";
import { ToolFlow } from "@/components/tool-flow/ToolFlow";
import type { ProcessFn } from "@/components/tool-flow/types";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import type { GrayWhat } from "@/lib/pdf/grayscale-run";
import { warmWorker } from "@/lib/pdf/worker-client";
import { flowTool } from "@/tools/registry";
import { grayscaleCopy as c } from "./copy";
import "../doc-tools/doc-tools.css";

const tool = flowTool("grayscale-pdf");

type Remembered = { what: GrayWhat; blackText: boolean; smaller: boolean };
const defaults: Remembered = { what: "all", blackText: false, smaller: false };
const OPTIONS: { value: GrayWhat; label: string }[] = [
  { value: "all", label: c.all },
  { value: "vector", label: c.vector },
  { value: "pictures", label: c.pictures },
];
const SHORT = OPTIONS.map((o) => ({ value: o.value, label: c.short[o.value] }));
const check = (s: Record<string, unknown>): Partial<Remembered> => ({
  ...(OPTIONS.some((o) => o.value === s.what) ? { what: s.what as GrayWhat } : {}),
  ...(typeof s.blackText === "boolean" ? { blackText: s.blackText } : {}),
  ...(typeof s.smaller === "boolean" ? { smaller: s.smaller } : {}),
});

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
      { blackText: optsLive.current.blackText, smaller: optsLive.current.smaller },
      tool.flow.outputName?.(files.map((f) => f.name)) ?? "",
      signal,
      onProgress,
    );
  };
  const what = (where: string) => <Select id={`gray-what-${where}`} label={c.what} hideLabel value={opts.what} options={where === "bar" ? SHORT : OPTIONS} onChange={(v) => setOpts({ what: v })} />;
  const extras = (where: string) => [
    { id: `gray-black-${where}`, label: c.blackText, value: opts.blackText, onChange: (blackText: boolean) => setOpts({ blackText }) },
    { id: `gray-small-${where}`, label: c.smaller, value: opts.smaller, onChange: (smaller: boolean) => setOpts({ smaller }) },
  ];
  return (
    <ToolFlow
      tool={tool}
      process={process}
      warm={() => {
        warmWorker();
        void import("@/lib/pdf/grayscale-run");
      }}
      renderMore={(ctx) => <MoreOptions changed={Number(opts.blackText) + Number(opts.smaller)} disabled={ctx.disabled} content={{ togglesTitle: c.extras, toggles: extras("more") }} />}
      renderOptions={() => (
        <div className="flex min-w-0 items-center gap-3 dock-side:flex-col dock-side:items-stretch dock-bar:flex-1">
          <div className="ip-opt-bar min-w-0 dock-bar:flex-1">{what("bar")}</div>
          <div className="ip-opt-side">
            <Group n={1} title={c.step}>
              {what("side")}
              <p className="ip-doc-note">{c.note[opts.what]}</p>
            </Group>
            <Group n={2} title={c.extras}>
              {extras("side").map((t) => (
                <Switch key={t.id} id={t.id} label={t.label} checked={t.value} onChange={t.onChange} spread />
              ))}
              <p className="ip-doc-note">{c.extrasNote}</p>
            </Group>
          </div>
        </div>
      )}
    />
  );
}
