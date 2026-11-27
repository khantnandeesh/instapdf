"use client";
import { useRemembered } from "@/components/page-select/hooks";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import type { FlipDirection } from "@/lib/pdf/page-shape-options";
import { runInWorker } from "@/lib/pdf/worker-client";
import { flowTool } from "@/tools/registry";
import { PickPagesFlow } from "@/tools/to-image/PickPagesFlow";
import { flipCopy as c } from "./copy";

const tool = flowTool("flip-pdf");

type Remembered = { direction: FlipDirection };
const defaults: Remembered = { direction: "horizontal" };
const DIRECTIONS: { value: FlipDirection; label: string }[] = [
  { value: "horizontal", label: c.horizontal },
  { value: "vertical", label: c.vertical },
];
const check = (s: Record<string, unknown>): Partial<Remembered> => (DIRECTIONS.some((d) => d.value === s.direction) ? { direction: s.direction as FlipDirection } : {});

/**
 * Flip (spec F8 §1): mirrors pages. The shared pick-pages flow: click the pages to flip, or pick
 * none to flip them all. The pages on screen are shown mirrored, as the file will be.
 */
export function FlipTool() {
  const [opts, setOpts, optsLive] = useRemembered(tool.slug, defaults, check);
  return (
    <PickPagesFlow
      tool={tool}
      verb="flipped"
      gridHint={c.gridHint}
      primaryLabel={c.primary}
      decorate={(applies) => ({ flip: applies ? opts.direction : "none" })}
      run={async (sources, signal, onProgress) => {
        const out = await runInWorker(
          {
            kind: "flip",
            zipName: tool.flow.outputName?.(sources.map((s) => s.name)) ?? "",
            direction: optsLive.current.direction,
            files: sources.map((s) => ({ name: s.name, source: s.source, password: s.password, pages: s.pages })),
          },
          { signal, onProgress },
        );
        return { name: out.name, type: out.type, blob: out.blob, size: out.blob.size, pageCount: out.pageCount, entries: out.entries, wasEncrypted: out.wasEncrypted, warnings: out.warnings };
      }}
      renderOptions={() => <SegmentedControl look="tabs" label={c.direction} value={opts.direction} options={DIRECTIONS} onChange={(direction) => setOpts({ direction })} className="shrink-0" />}
    />
  );
}
