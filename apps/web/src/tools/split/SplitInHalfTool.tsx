"use client";
import { useRemembered } from "@/components/page-select/hooks";
import { MoreOptions } from "@/components/page-select/MoreOptions";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import type { HalfDirection, HalfOptions } from "@/lib/pdf/split-half";
import { runInWorker } from "@/lib/pdf/worker-client";
import { flowTool } from "@/tools/registry";
import { PickPagesFlow } from "@/tools/to-image/PickPagesFlow";
import { splitHalfCopy as c } from "./copy";

const tool = flowTool("split-pdf-in-half");

const defaults: HalfOptions = { direction: "auto", rightToLeft: false, booklet: false };
const DIRECTIONS: { value: HalfDirection; label: string }[] = [
  { value: "auto", label: c.auto },
  { value: "sideBySide", label: c.sideBySide },
  { value: "topBottom", label: c.topBottom },
];
const check = (s: Record<string, unknown>): Partial<HalfOptions> => ({
  ...(DIRECTIONS.some((d) => d.value === s.direction) ? { direction: s.direction as HalfDirection } : {}),
  ...(typeof s.rightToLeft === "boolean" ? { rightToLeft: s.rightToLeft } : {}),
  ...(typeof s.booklet === "boolean" ? { booklet: s.booklet } : {}),
});

/**
 * Split in half (spec F7 §4): two-page scans become single pages. The shared pick-pages flow: click
 * the pages to cut, or pick none to cut them all; the others stay whole (a cover, a fold-out).
 */
export function SplitInHalfTool() {
  const [opts, setOpts, optsLive] = useRemembered(tool.slug, defaults, check);
  return (
    <PickPagesFlow
      tool={tool}
      verb="cut in half"
      gridHint={c.gridHint}
      primaryLabel={c.primary}
      run={async (sources, signal, onProgress) => {
        const out = await runInWorker(
          {
            kind: "splitHalf",
            zipName: tool.flow.outputName?.(sources.map((s) => s.name)) ?? "",
            options: optsLive.current,
            files: sources.map((s) => ({ name: s.name, source: s.source, password: s.password, cut: s.pages })),
          },
          { signal, onProgress },
        );
        return { name: out.name, type: out.type, blob: out.blob, size: out.blob.size, pageCount: out.pageCount, entries: out.entries, wasEncrypted: out.wasEncrypted, warnings: out.warnings };
      }}
      renderMore={(ctx) => (
        <MoreOptions
          changed={(opts.rightToLeft ? 1 : 0) + (opts.booklet ? 1 : 0)}
          disabled={ctx.disabled}
          content={{
            toggles: [
              { id: "rtl", label: c.rightToLeft, value: opts.rightToLeft, onChange: (rightToLeft) => setOpts({ rightToLeft }) },
              { id: "booklet", label: c.booklet, value: opts.booklet, onChange: (booklet) => setOpts({ booklet }) },
            ],
          }}
        />
      )}
      renderOptions={() => <SegmentedControl look="tabs" label={c.direction} value={opts.direction} options={DIRECTIONS} onChange={(direction) => setOpts({ direction })} className="shrink-0" />}
    />
  );
}
