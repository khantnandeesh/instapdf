"use client";
import { useId } from "react";
import { useRemembered } from "@/components/page-select/hooks";
import { MoreOptions } from "@/components/page-select/MoreOptions";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Select } from "@/components/ui/Select";
import { TextInput } from "@/components/ui/TextInput";
import { isPaper, marginsFrom, PAPERS, SIDES, type LengthUnit, type MarginText, type Paper } from "@/lib/pdf/page-shape-options";
import type { ResizeOptions } from "@/lib/pdf/resize";
import { USER_ERROR } from "@/lib/pdf/user-error";
import { runInWorker } from "@/lib/pdf/worker-client";
import { flowTool } from "@/tools/registry";
import { PickPagesFlow } from "@/tools/to-image/PickPagesFlow";
import { resizeCopy as c } from "./copy";

const tool = flowTool("resize-pdf");

type Mode = "size" | "margins";
type Remembered = { mode: Mode; paper: Paper; unit: LengthUnit } & MarginText;
const defaults: Remembered = { mode: "size", paper: "a4", unit: "mm", all: "10", top: "", right: "", bottom: "", left: "" };
const short = (v: unknown): v is string => typeof v === "string" && v.length <= 8;
const check = (s: Record<string, unknown>): Partial<Remembered> => ({
  ...(s.mode === "size" || s.mode === "margins" ? { mode: s.mode } : {}),
  ...(isPaper(s.paper) ? { paper: s.paper } : {}),
  ...(s.unit === "mm" || s.unit === "in" ? { unit: s.unit } : {}),
  ...(short(s.all) ? { all: s.all } : {}),
  ...Object.fromEntries(SIDES.filter((k) => short(s[k])).map((k) => [k, s[k]])),
});
const MODES: { value: Mode; label: string }[] = [
  { value: "size", label: c.size },
  { value: "margins", label: c.margins },
];
const UNITS: { value: LengthUnit; label: string }[] = [
  { value: "mm", label: "mm" },
  { value: "in", label: "in" },
];
const PAPER_OPTIONS = (Object.keys(PAPERS) as Paper[]).map((value) => ({ value, label: PAPERS[value].label }));

/** What the engine gets, or null while the margins as typed are not usable. */
function optionsFrom(o: Remembered): ResizeOptions | null {
  if (o.mode === "size") return { mode: "size", width: PAPERS[o.paper].width, height: PAPERS[o.paper].height };
  const margins = marginsFrom(o, o.unit);
  return margins && { mode: "margins", margins };
}

/**
 * Resize (spec F8 §2): put pages on another paper size (the content is scaled to fit), or add
 * margins around them. The shared pick-pages flow: click pages to change only those.
 */
export function ResizeTool() {
  const [opts, setOpts, optsLive] = useRemembered(tool.slug, defaults, check);
  const id = useId();
  const sidesSet = SIDES.filter((k) => opts[k].trim()).length;
  return (
    <PickPagesFlow
      tool={tool}
      verb="resized"
      gridHint={c.gridHint}
      primaryLabel={c.primary}
      canRun={() => (optionsFrom(opts) ? true : c.needs)}
      run={async (sources, signal, onProgress) => {
        const options = optionsFrom(optsLive.current);
        if (!options) throw new Error(USER_ERROR + c.needs);
        const out = await runInWorker(
          { kind: "resize", zipName: tool.flow.outputName?.(sources.map((s) => s.name)) ?? "", options, files: sources.map((s) => ({ name: s.name, source: s.source, password: s.password, pages: s.pages })) },
          { signal, onProgress },
        );
        return { name: out.name, type: out.type, blob: out.blob, size: out.blob.size, pageCount: out.pageCount, entries: out.entries, wasEncrypted: out.wasEncrypted, warnings: out.warnings };
      }}
      renderMore={
        opts.mode === "margins"
          ? (ctx) => (
              <MoreOptions
                changed={sidesSet}
                disabled={ctx.disabled}
                content={{
                  extra: (
                    <fieldset className="flex flex-col gap-2.5">
                      <legend className="mb-2 text-sm font-semibold text-ink">{c.sides}</legend>
                      <div className="grid grid-cols-2 gap-2.5">
                        {SIDES.map((k) => (
                          <TextInput key={k} id={`${id}-${k}`} label={`${c.side[k]}, ${opts.unit}`} value={opts[k]} placeholder={c.same} maxLength={8} onChange={(v) => setOpts({ [k]: v })} />
                        ))}
                      </div>
                    </fieldset>
                  ),
                }}
              />
            )
          : undefined
      }
      renderOptions={() => (
        <div className="flex min-w-0 items-center gap-3 max-sm:flex-1">
          <SegmentedControl look="tabs" label={c.mode} value={opts.mode} options={MODES} onChange={(mode) => setOpts({ mode })} className="shrink-0" />
          {/* One slot of one width for both modes: nothing beside it moves when the mode changes. */}
          <div className="flex w-[200px] min-w-0 items-center gap-2 max-sm:flex-1">
            {opts.mode === "size" ? (
              <div className="min-w-0 flex-1">
                <Select id={`${id}-paper`} label={c.paper} hideLabel value={opts.paper} options={PAPER_OPTIONS} onChange={(paper) => setOpts({ paper: paper as Paper })} />
              </div>
            ) : (
              <>
                <TextInput id={`${id}-all`} label={`${c.margin}, ${opts.unit}`} hideLabel value={opts.all} maxLength={8} onChange={(all) => setOpts({ all })} className="min-w-0 flex-1" />
                <SegmentedControl look="tabs" label={c.unit} value={opts.unit} options={UNITS} onChange={(unit) => setOpts({ unit })} className="shrink-0" />
              </>
            )}
          </div>
        </div>
      )}
    />
  );
}
