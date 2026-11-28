"use client";
import { useCallback, useState } from "react";
import { useRemembered } from "@/components/page-select/hooks";
import { MoreOptions } from "@/components/page-select/MoreOptions";
import { ToolFlow } from "@/components/tool-flow/ToolFlow";
import type { LoadedFile, ProcessFn } from "@/components/tool-flow/types";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { NUP_COUNTS, NUP_DEFAULTS, sheetCount, type NupCount, type NupOptions } from "@/lib/pdf/page-shape-options";
import { runInWorker } from "@/lib/pdf/worker-client";
import { flowTool } from "@/tools/registry";
import { nupCopy as c } from "./copy";

const tool = flowTool("n-up-pdf");

const COUNTS = NUP_COUNTS.map((value) => ({ value: String(value), label: String(value) }));
const check = (s: Record<string, unknown>): Partial<NupOptions> => ({
  ...(NUP_COUNTS.includes(s.perSheet as NupCount) ? { perSheet: s.perSheet as NupCount } : {}),
  ...(s.order === "rows" || s.order === "columns" ? { order: s.order } : {}),
  ...(typeof s.rightToLeft === "boolean" ? { rightToLeft: s.rightToLeft } : {}),
  ...(typeof s.keepSize === "boolean" ? { keepSize: s.keepSize } : {}),
});

/** N-up (spec F8 §4): several pages on each sheet, to print on less paper. Works on whole files. */
export function NupTool() {
  const [opts, setOpts, optsLive] = useRemembered(tool.slug, NUP_DEFAULTS, check);
  const [counts, setCounts] = useState<number[]>([]);

  const onFilesChange = useCallback((all: LoadedFile[]) => {
    const next = all.filter((f) => f.status === "ready").map((f) => f.pageCount);
    setCounts((prev) => (prev.length === next.length && prev.every((k, i) => k === next[i]) ? prev : next));
  }, []);

  const process: ProcessFn = async (files, signal, onProgress) => {
    const out = await runInWorker(
      { kind: "nup", zipName: tool.flow.outputName?.(files.map((f) => f.name)) ?? "", options: optsLive.current, files: files.map((f) => ({ name: f.name, source: f.source, password: f.password })) },
      { signal, onProgress },
    );
    return { name: out.name, type: out.type, blob: out.blob, size: out.blob.size, pageCount: out.pageCount, entries: out.entries, wasEncrypted: out.wasEncrypted, warnings: out.warnings };
  };

  return (
    <ToolFlow
      tool={tool}
      process={process}
      onFilesChange={onFilesChange}
      readyStatus={() => c.status(counts.reduce((a, b) => a + b, 0), counts.reduce((a, k) => a + sheetCount(k, opts.perSheet), 0))}
      renderMore={(ctx) => (
        <MoreOptions
          changed={(opts.order === "columns" ? 1 : 0) + (opts.rightToLeft ? 1 : 0) + (opts.keepSize ? 1 : 0)}
          disabled={ctx.disabled}
          content={{
            toggles: [
              { id: "keep", label: c.keepSize, value: opts.keepSize, onChange: (keepSize) => setOpts({ keepSize }) },
              { id: "columns", label: c.columns, value: opts.order === "columns", onChange: (on) => setOpts({ order: on ? "columns" : "rows" }) },
              { id: "rtl", label: c.rightToLeft, value: opts.rightToLeft, onChange: (rightToLeft) => setOpts({ rightToLeft }) },
            ],
          }}
        />
      )}
      renderOptions={() => (
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden="true" className="hidden text-sm font-semibold whitespace-nowrap text-ink xl:inline-block">
            {c.perSheet}
          </span>
          <SegmentedControl look="tabs" label={c.perSheet} value={String(opts.perSheet)} options={COUNTS} onChange={(v) => setOpts({ perSheet: Number(v) as NupCount })} className="shrink-0" />
        </div>
      )}
    />
  );
}
