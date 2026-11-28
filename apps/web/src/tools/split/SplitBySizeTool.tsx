"use client";
import { useRef, useState } from "react";
import { useRemembered } from "@/components/page-select/hooks";
import { ToolFlow } from "@/components/tool-flow/ToolFlow";
import type { FlowApi, ProcessFn } from "@/components/tool-flow/types";
import { NumberStepper } from "@/components/ui/NumberStepper";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { sizeLimit, type SizeUnit } from "@/lib/pdf/split-size-options";
import { USER_ERROR } from "@/lib/pdf/user-error";
import { runInWorker } from "@/lib/pdf/worker-client";
import { flowTool } from "@/tools/registry";
import { splitSizeCopy as c } from "./copy";

const tool = flowTool("split-pdf-by-size");

type Remembered = { text: string; unit: SizeUnit };
const defaults: Remembered = { text: "10", unit: "MB" };
const check = (s: Record<string, unknown>): Partial<Remembered> => ({
  ...(typeof s.text === "string" && /^\d{1,4}$/.test(s.text) ? { text: s.text } : {}),
  ...(s.unit === "MB" || s.unit === "KB" ? { unit: s.unit } : {}),
});
const UNITS: { value: SizeUnit; label: string }[] = [
  { value: "MB", label: "MB" },
  { value: "KB", label: "KB" },
];

/**
 * Split by size (spec F7 §3): the fewest files of consecutive pages that each stay under the size
 * typed. The parts depend on how big the pages are once saved, so they are worked out in the run.
 */
export function SplitBySizeTool() {
  const apiRef = useRef<FlowApi | null>(null);
  const [opts, setOpts, optsLive] = useRemembered(tool.slug, defaults, check);
  const limit = sizeLimit(opts.text, opts.unit);
  const [pages, setPages] = useState(0);

  const process: ProcessFn = async (files, signal, onProgress) => {
    const { text, unit } = optsLive.current;
    const bytes = sizeLimit(text, unit);
    if (bytes === null) throw new Error(USER_ERROR + c.error);
    const out = await runInWorker(
      { kind: "splitSize", limit: bytes, files: files.map((f) => ({ id: f.id, name: f.name, source: f.source, password: f.password, pageCount: f.pageCount })) },
      { signal, onProgress },
    );
    return { name: out.name, type: out.type, blob: out.blob, size: out.blob.size, pageCount: out.pageCount, entries: out.entries, wasEncrypted: out.wasEncrypted, warnings: out.warnings };
  };

  return (
    <ToolFlow
      tool={tool}
      apiRef={apiRef}
      process={process}
      canRun={() => (limit === null ? c.needs : true)}
      onFilesChange={(all) => setPages(all.reduce((n, f) => n + (f.status === "ready" ? f.pageCount : 0), 0))}
      readyStatus={() => c.status(pages, opts.text.trim(), opts.unit)}
      renderOptions={() => (
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden="true" className="hidden text-sm font-semibold whitespace-nowrap text-ink xl:inline-block">
            {c.size}
          </span>
          <NumberStepper
            value={opts.text}
            onChange={(text) => setOpts({ text })}
            label={c.size}
            decLabel={c.smaller}
            incLabel={c.larger}
            error={c.error}
            onEnter={() => limit !== null && apiRef.current?.submit()}
          />
          <SegmentedControl look="tabs" label={c.unit} value={opts.unit} options={UNITS} onChange={(unit) => setOpts({ unit })} className="shrink-0" />
        </div>
      )}
    />
  );
}
