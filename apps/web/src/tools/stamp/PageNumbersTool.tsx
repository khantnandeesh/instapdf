"use client";
import { useRemembered } from "@/components/page-select/hooks";
import { MoreOptions } from "@/components/page-select/MoreOptions";
import { Step } from "@/components/page-select/Step";
import { Select } from "@/components/ui/Select";
import { TextInput } from "@/components/ui/TextInput";
import { NUMBER_FORMATS, numberTemplate, PLACES, type NumberFormat, type Place, type Stamp } from "@/lib/pdf/stamp";
import { flowTool } from "@/tools/registry";
import { PickPagesFlow } from "@/tools/to-image/PickPagesFlow";
import { numbersCopy as c, stampCopy as sc } from "./copy";
import { checkStyle, Group, LINE_SIZES, MARGIN_OPTIONS, MARGINS, stampFlow, StyleFields, textStyle, type Margin, type StyleState } from "./shared";

const tool = flowTool("add-page-numbers");

type Remembered = StyleState & { place: Place; format: NumberFormat; first: string; margin: Margin };
const defaults: Remembered = { place: "bottom-center", format: "n", first: "1", margin: "normal", font: "arimo", size: "11", colour: "#000000", bold: false };
const check = (s: Record<string, unknown>): Partial<Remembered> => ({
  ...checkStyle(s, LINE_SIZES),
  ...(PLACES.includes(s.place as Place) ? { place: s.place as Place } : {}),
  ...(NUMBER_FORMATS.some((f) => f.value === s.format) ? { format: s.format as NumberFormat } : {}),
  ...(typeof s.first === "string" && s.first.length <= 5 ? { first: s.first } : {}),
  ...(typeof s.margin === "string" && s.margin in MARGINS ? { margin: s.margin as Margin } : {}),
});
const PLACE_OPTIONS = PLACES.map((value) => ({ value, label: sc.place[value] }));
const FORMAT_OPTIONS = NUMBER_FORMATS.map((f) => ({ value: f.value, label: f.sample }));

/** The first number as typed: a whole number from 0 to 99999, or null. */
export const firstNumber = (text: string): number | null => (/^\d{1,5}$/.test(text.trim()) ? Number(text.trim()) : null);

const stampsOf = (o: Remembered): Stamp[] => [{ kind: "line", place: o.place, text: numberTemplate(o.format), style: textStyle(o), margin: MARGINS[o.margin] }];

/**
 * Page numbers (spec F9 §1): a number on every page, or on the picked ones, counted from the first
 * number. A settings tool: the options are in the side panel, the pages show the numbers as they will be.
 */
export function PageNumbersTool() {
  const [opts, setOpts, optsLive] = useRemembered(tool.slug, defaults, check);
  const flow = stampFlow(
    tool,
    () => (firstNumber(optsLive.current.first) === null ? c.needsFirst : stampsOf(optsLive.current)),
    () => firstNumber(optsLive.current.first) ?? 1,
  );
  const changed = (Object.keys(defaults) as (keyof Remembered)[]).filter((k) => k !== "place" && opts[k] !== defaults[k]).length;
  const position = (where: string) => <Select id={`numbers-place-${where}`} label={c.position} hideLabel={where === "bar"} value={opts.place} options={PLACE_OPTIONS} onChange={(place) => setOpts({ place })} />;
  const margin = (where: string) => <Select id={`numbers-margin-${where}`} label={sc.margin} value={opts.margin} options={MARGIN_OPTIONS} onChange={(margin) => setOpts({ margin })} />;
  const look = (where: string, n: number) => (
    <Group n={n} title={sc.stepLook}>
      <div className="grid grid-cols-2 gap-2.5">
        <Select id={`numbers-format-${where}`} label={c.format} value={opts.format} options={FORMAT_OPTIONS} onChange={(format) => setOpts({ format })} />
        <TextInput id={`numbers-first-${where}`} label={c.first} value={opts.first} maxLength={5} onChange={(first) => setOpts({ first })} />
      </div>
      <StyleFields where={where} style={opts} sizes={LINE_SIZES} onChange={setOpts} beside={where === "more" ? margin(where) : undefined} />
    </Group>
  );
  return (
    <PickPagesFlow
      tool={tool}
      verb="numbered"
      gridHint={sc.gridHint}
      primaryLabel={c.primary}
      canRun={() => (firstNumber(opts.first) === null ? c.needsFirst : true)}
      decorate={flow.decorate}
      run={flow.run}
      renderMore={(ctx) => <MoreOptions changed={changed} disabled={ctx.disabled} content={{ extra: look("more", 2) }} />}
      renderOptions={() => (
        <div className="flex min-w-0 items-center gap-3 dock-side:flex-col dock-side:items-stretch dock-side:gap-7 dock-bar:flex-1">
          <div className="flex min-w-0 flex-col gap-3.5 dock-bar:flex-1">
            <Step n={1}>{sc.stepWhere}</Step>
            <div className="ip-stamp-pair">
              {position("bar")}
              <div className="ip-stamp-side">{margin("side")}</div>
            </div>
          </div>
          <div className="ip-stamp-side">{look("side", 2)}</div>
        </div>
      )}
    />
  );
}
