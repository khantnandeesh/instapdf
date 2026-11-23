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

/** ChoiceTile line icon: three small pages, the ones in scope filled. */
function ScopeIcon({ filled }: { filled: [boolean, boolean, boolean] }) {
  return (
    <svg width="27" height="27" viewBox="0 0 27 27" aria-hidden="true" className="max-lg:hidden" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      {[2, 10, 18].map((x, i) => (
        <rect key={x} x={x + 0.75} y="6.75" width="6.5" height="13.5" rx="1" fill={filled[i] ? "currentColor" : "none"} fillOpacity={filled[i] ? 0.35 : 0} />
      ))}
    </svg>
  );
}

const scopes: { value: RotateScope; label: string; shortLabel: string; icon: React.ReactNode }[] = [
  { value: "all", label: "All pages", shortLabel: "All", icon: <ScopeIcon filled={[true, true, true]} /> },
  { value: "odd", label: "Odd pages", shortLabel: "Odd", icon: <ScopeIcon filled={[true, false, true]} /> },
  { value: "even", label: "Even pages", shortLabel: "Even", icon: <ScopeIcon filled={[false, true, false]} /> },
];

/** Pending rotation per file id: unbounded display degrees per page. */
type Deltas = Record<string, number[]>;

/**
 * Hands the in-memory Files (Blobs) to the worker without reading them here;
 * the worker reads, rotates and emits one file at a time.
 */
const process: (deltas: Deltas) => ProcessFn = (deltas) => async (files, signal, onProgress) => {
  const out = await runInWorker(
    {
      kind: "rotate",
      zipName: tool.flow.outputName(files.map((f) => f.name)),
      files: files.map((f) => ({
        name: f.name,
        source: f.source,
        password: f.password,
        deltas: Array.from({ length: f.pageCount }, (_, i) => normalizeRotation(deltas[f.id]?.[i] ?? 0)),
      })),
    },
    { signal, onProgress },
  );
  return {
    name: out.name,
    type: out.type,
    blob: out.blob,
    size: out.blob.size,
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
          <IconButton label={`Rotate page ${index + 1} left`} variant="soft" tabIndex={tabIndex} icon={<RotateLeftIcon size={16} />} onClick={() => rotateOne(file, index, -90)} />
          <IconButton label={`Rotate page ${index + 1} right`} variant="soft" tabIndex={tabIndex} icon={<RotateRightIcon size={16} />} onClick={() => rotateOne(file, index, 90)} />
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
        // Mint Paper working mode: numbered steps, ChoiceTiles for the scope, the rotate actions as
        // editing tools (blue), Reset as a soft button; the mint primary sits below in the dock.
        <div className="flex items-center gap-3 lg:flex-col lg:items-stretch lg:gap-6">
          <div className="flex min-w-0 flex-col gap-2.5 max-lg:flex-1">
            <span className="mp-step hidden lg:block" aria-hidden="true">
              1. Apply to
            </span>
            <SegmentedControl look="tiles" label="Apply to" value={scope} options={scopes} onChange={setScope} fullWidth />
          </div>
          <div className="flex flex-col gap-2.5">
            <span className="mp-step hidden lg:block" aria-hidden="true">
              2. Rotate
            </span>
            <div className="flex items-center gap-3 lg:flex-col lg:items-start">
              <div className="mp-toolbar lg:flex lg:w-full">
                <Button variant="tool" className="max-lg:size-11 max-lg:px-0 lg:flex-1" iconStart={<RotateLeftIcon size={18} />} aria-label="Rotate left" title="Rotate left" onClick={() => rotateAll(ctx, -90)}>
                  <span className="hidden lg:inline">Rotate left</span>
                </Button>
                <Button variant="tool" className="max-lg:size-11 max-lg:px-0 lg:flex-1" iconStart={<RotateRightIcon size={18} />} aria-label="Rotate right" title="Rotate right" onClick={() => rotateAll(ctx, 90)}>
                  <span className="hidden lg:inline">Rotate right</span>
                </Button>
              </div>
              <Button
                variant="soft"
                className="max-sm:size-11 max-sm:px-0"
                iconStart={<ResetIcon size={16} />}
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
          </div>
        </div>
      )}
    />
  );
}
