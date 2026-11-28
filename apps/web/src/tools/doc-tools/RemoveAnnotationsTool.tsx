"use client";
import { useRemembered } from "@/components/page-select/hooks";
import { MoreOptions } from "@/components/page-select/MoreOptions";
import { Group } from "@/components/page-select/OptionGroup";
import { Switch } from "@/components/ui/Switch";
import { runInWorker } from "@/lib/pdf/worker-client";
import { flowTool } from "@/tools/registry";
import { PickPagesFlow } from "@/tools/to-image/PickPagesFlow";
import { ANNOTATION_GROUPS, annotationsCopy as c } from "./copy";
import "./doc-tools.css";

const tool = flowTool("remove-pdf-annotations");

type Remembered = Record<string, boolean>;
// Links are how a reader moves around the file: they stay unless asked for.
const defaults: Remembered = Object.fromEntries(ANNOTATION_GROUPS.map((g) => [g.id, g.id !== "links"]));
const check = (s: Record<string, unknown>): Partial<Remembered> => Object.fromEntries(ANNOTATION_GROUPS.filter((g) => typeof s[g.id] === "boolean").map((g) => [g.id, s[g.id] as boolean]));

/**
 * Remove annotations (spec F10 §1): takes highlights, notes, drawings, stamps and, when asked, links
 * off every page or the picked ones. Form fields are not annotations here: they stay.
 */
export function RemoveAnnotationsTool() {
  const [opts, setOpts, optsLive] = useRemembered(tool.slug, defaults, check);
  const toggles = (where: string) => ANNOTATION_GROUPS.map((g) => ({ id: `annot-${g.id}-${where}`, label: g.label, value: !!opts[g.id], onChange: (on: boolean) => setOpts({ [g.id]: on }) }));
  const changed = ANNOTATION_GROUPS.filter((g) => !!opts[g.id] !== defaults[g.id]).length;
  return (
    <PickPagesFlow
      tool={tool}
      verb="cleaned"
      gridHint={c.gridHint}
      primaryLabel={c.primary}
      canRun={() => (ANNOTATION_GROUPS.some((g) => opts[g.id]) ? true : c.needs)}
      run={async (sources, signal, onProgress) => {
        const out = await runInWorker(
          {
            kind: "annotations",
            zipName: tool.flow.outputName?.(sources.map((s) => s.name)) ?? "",
            kinds: ANNOTATION_GROUPS.filter((g) => optsLive.current[g.id]).flatMap((g) => g.kinds),
            files: sources.map((s) => ({ name: s.name, source: s.source, password: s.password, pages: s.pages })),
          },
          { signal, onProgress },
        );
        return { name: out.name, type: out.type, blob: out.blob, size: out.blob.size, pageCount: out.pageCount, entries: out.entries, wasEncrypted: out.wasEncrypted, warnings: out.warnings };
      }}
      renderMore={(ctx) => <MoreOptions changed={changed} disabled={ctx.disabled} content={{ togglesTitle: c.step, toggles: toggles("more"), extra: <p className="ip-doc-note">{c.note}</p> }} />}
      renderOptions={() => (
        <div className="ip-opt-side">
          <Group n={1} title={c.step}>
            <div className="flex flex-col">
              {toggles("side").map((t) => (
                <Switch key={t.id} id={t.id} label={t.label} checked={t.value} onChange={t.onChange} spread />
              ))}
            </div>
            <p className="ip-doc-note">{c.note}</p>
          </Group>
        </div>
      )}
    />
  );
}
