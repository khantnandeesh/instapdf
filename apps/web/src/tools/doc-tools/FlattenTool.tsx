"use client";
import { useRemembered } from "@/components/page-select/hooks";
import { Group } from "@/components/page-select/OptionGroup";
import { ToolFlow } from "@/components/tool-flow/ToolFlow";
import type { ProcessFn } from "@/components/tool-flow/types";
import { Select } from "@/components/ui/Select";
import { runInWorker } from "@/lib/pdf/worker-client";
import { flowTool } from "@/tools/registry";
import { flattenCopy as c } from "./copy";
import "./doc-tools.css";

const tool = flowTool("flatten-pdf");

type What = "both" | "fields";
type Remembered = { what: What };
const defaults: Remembered = { what: "both" };
const OPTIONS: { value: What; label: string }[] = [
  { value: "both", label: c.both },
  { value: "fields", label: c.fields },
];
const check = (s: Record<string, unknown>): Partial<Remembered> => (OPTIONS.some((o) => o.value === s.what) ? { what: s.what as What } : {});

/**
 * Flatten (spec F10 §2): form fields, and annotations when asked, are drawn into the pages for good.
 * Nothing is turned into a picture: text stays text.
 */
export function FlattenTool() {
  const [opts, setOpts, optsLive] = useRemembered(tool.slug, defaults, check);
  const process: ProcessFn = async (files, signal, onProgress) => {
    const out = await runInWorker(
      { kind: "flatten", zipName: tool.flow.outputName?.(files.map((f) => f.name)) ?? "", annotations: optsLive.current.what === "both", files: files.map((f) => ({ name: f.name, source: f.source, password: f.password })) },
      { signal, onProgress },
    );
    return { name: out.name, type: out.type, blob: out.blob, size: out.blob.size, pageCount: out.pageCount, entries: out.entries, wasEncrypted: out.wasEncrypted, warnings: out.warnings };
  };
  const what = (where: string) => <Select id={`flatten-what-${where}`} label={c.what} hideLabel value={opts.what} options={OPTIONS} onChange={(v) => setOpts({ what: v })} />;
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
