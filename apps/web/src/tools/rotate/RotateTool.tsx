"use client";
import { useCallback, useState } from "react";
import { ToolFlow } from "@/components/tool-flow/ToolFlow";
import type { FlowContext, LoadedFile, ProcessFn } from "@/components/tool-flow/types";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { ResetIcon, RotateLeftIcon, RotateRightIcon } from "@/components/ui/icons";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { describeDelta, hasPendingRotation, isInScope, normalizeRotation, rotatePage, rotateScope, type RotateScope } from "@/lib/pdf/rotation";
import { runInWorker } from "@/lib/pdf/worker-client";
import { flowTool } from "@/tools/registry";

const tool = flowTool("rotate-pdf");

const scopes: { value: RotateScope; label: string; shortLabel: string }[] = [
  { value: "all", label: "All pages", shortLabel: "All" },
  { value: "odd", label: "Odd pages", shortLabel: "Odd" },
  { value: "even", label: "Even pages", shortLabel: "Even" },
];

/** Pending rotation per file id: unbounded display degrees per page. */
type Deltas = Record<string, number[]>;

const process: (deltas: Deltas) => ProcessFn = (deltas) => async (files, signal, onProgress) => {
  const jobFiles = await Promise.all(
    files.map(async (f) => ({
      name: f.name,
      buffer: await f.source.arrayBuffer(),
      password: f.password,
      deltas: Array.from({ length: f.pageCount }, (_, i) => normalizeRotation(deltas[f.id]?.[i] ?? 0)),
    })),
  );
  const out = await runInWorker(
    { kind: "rotate", files: jobFiles, zipName: tool.flow.outputName(files.map((f) => f.name)) },
    { signal, onProgress, transfer: jobFiles.map((f) => f.buffer) },
  );
  return {
    name: out.name,
    type: out.type,
    blob: new Blob([out.bytes as Uint8Array<ArrayBuffer>], { type: out.type }),
    size: out.bytes.byteLength,
    pageCount: out.pageCount,
    entries: out.entries,
    wasEncrypted: out.wasEncrypted,
  };
};

export function RotateTool() {
  const [scope, setScope] = useState<RotateScope>("all");
  const [deltas, setDeltas] = useState<Deltas>({});

  const rotateAll = useCallback(
    (ctx: FlowContext, step: number) => {
      setDeltas((prev) => {
        const next: Deltas = { ...prev };
        for (const f of ctx.readyFiles) next[f.id] = rotateScope(prev[f.id] ?? [], f.pageCount, scope, step);
        return next;
      });
      const label = scopes.find((s) => s.value === scope)!.label;
      const first = ctx.readyFiles[0];
      if (first) {
        const firstIdx = scope === "even" ? 1 : 0;
        const after = (deltas[first.id]?.[firstIdx] ?? 0) + step;
        ctx.announce(`${label}: ${describeDelta(after)}`);
      }
    },
    [deltas, scope],
  );

  const rotateOne = useCallback((file: LoadedFile, index: number, step: number) => {
    setDeltas((prev) => ({ ...prev, [file.id]: rotatePage(prev[file.id] ?? [], file.pageCount, index, step) }));
  }, []);

  const pending = Object.values(deltas).some(hasPendingRotation);

  return (
    <ToolFlow
      tool={tool}
      process={process(deltas)}
      readyNote={pending ? undefined : "No changes yet"}
      onReset={() => {
        setDeltas({});
        setScope("all");
      }}
      decoratePage={(file, index) => ({ pendingDelta: deltas[file.id]?.[index] ?? 0, inScope: isInScope(scope, index) })}
      renderPageActions={(file, index, tabIndex) => (
        <>
          <IconButton label={`Rotate page ${index + 1} left`} size="sm" tabIndex={tabIndex} icon={<RotateLeftIcon size={18} />} onClick={() => rotateOne(file, index, -90)} />
          <IconButton label={`Rotate page ${index + 1} right`} size="sm" tabIndex={tabIndex} icon={<RotateRightIcon size={18} />} onClick={() => rotateOne(file, index, 90)} />
        </>
      )}
      onPageKey={(file, index, key) => {
        if (key === "[" || key === "]") {
          rotateOne(file, index, key === "]" ? 90 : -90);
          return true;
        }
        return false;
      }}
      renderOptions={(ctx) => (
        <div className="flex items-center gap-2 lg:flex-col lg:items-stretch lg:gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="hidden text-sm font-medium lg:block" aria-hidden="true">
              Apply to
            </span>
            <SegmentedControl label="Apply to" value={scope} options={scopes} onChange={setScope} fullWidth />
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" className="max-lg:w-11 max-lg:px-0 lg:flex-1" iconStart={<RotateLeftIcon />} aria-label="Rotate left" title="Rotate left" onClick={() => rotateAll(ctx, -90)}>
              <span className="hidden lg:inline">Rotate left</span>
            </Button>
            <Button variant="secondary" className="max-lg:w-11 max-lg:px-0 lg:flex-1" iconStart={<RotateRightIcon />} aria-label="Rotate right" title="Rotate right" onClick={() => rotateAll(ctx, 90)}>
              <span className="hidden lg:inline">Rotate right</span>
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="max-sm:h-11 max-sm:w-11 max-sm:px-0 lg:self-start"
            iconStart={<ResetIcon size={18} />}
            aria-label="Reset rotation"
            title="Reset rotation"
            disabled={!pending}
            onClick={() => {
              setDeltas({});
              ctx.announce("Rotation reset");
            }}
          >
            <span className="max-sm:hidden" aria-hidden="true">
              Reset
            </span>
          </Button>
        </div>
      )}
    />
  );
}
