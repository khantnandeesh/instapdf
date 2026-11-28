"use client";
import { useRemembered } from "@/components/page-select/hooks";
import { MoreOptions } from "@/components/page-select/MoreOptions";
import { Step } from "@/components/page-select/Step";
import { Select } from "@/components/ui/Select";
import { TextInput } from "@/components/ui/TextInput";
import { BATES_DIGITS, BATES_LIMITS, BATES_STYLES, batesNumber, batesTemplate, PLACES, STAMP_LINE_HEIGHT, type BatesRun, type BatesStyle, type Place, type Stamp } from "@/lib/pdf/stamp";
import { flowTool } from "@/tools/registry";
import { PickPagesFlow } from "@/tools/to-image/PickPagesFlow";
import { batesCopy as c, stampCopy as sc } from "./copy";
import { checkStyle, Group, LINE_SIZES, MARGIN_OPTIONS, MARGINS, stampFlow, StyleFields, textStyle, type StyleState } from "./shared";

const tool = flowTool("bates-numbering");

type Remembered = StyleState & { place: Place; margin: keyof typeof MARGINS | "room"; style: BatesStyle; digits: string; prefix: string; custom: string; start: string; doc: string };
const defaults: Remembered = { place: "bottom-right", margin: "normal", style: "number", digits: "6", prefix: "", custom: "{bates}", start: "1", doc: "1", font: "arimo", size: "10", colour: "#000000", bold: false };
const check = (s: Record<string, unknown>): Partial<Remembered> => ({
  ...checkStyle(s, LINE_SIZES),
  ...(PLACES.includes(s.place as Place) ? { place: s.place as Place } : {}),
  ...(typeof s.margin === "string" && (s.margin in MARGINS || s.margin === "room") ? { margin: s.margin as Remembered["margin"] } : {}),
  ...(BATES_STYLES.some((b) => b.value === s.style) ? { style: s.style as BatesStyle } : {}),
  ...(BATES_DIGITS.some((d) => String(d) === s.digits) ? { digits: s.digits as string } : {}),
  ...(typeof s.prefix === "string" && s.prefix.length <= 60 ? { prefix: s.prefix } : {}),
  ...(typeof s.custom === "string" && s.custom.length <= 120 ? { custom: s.custom } : {}),
  // Where the count starts belongs to one job: it is not carried to the next visit.
});

const PLACE_OPTIONS = PLACES.map((value) => ({ value, label: sc.place[value] }));
const STYLE_OPTIONS = BATES_STYLES.map((b) => ({ value: b.value, label: c.styles[b.value] }));
// The last choice gives the line a strip of its own: the page grows at that edge, and what is on it is not covered.
const EDGE_OPTIONS = [...MARGIN_OPTIONS, { value: "room" as const, label: c.room }];
const edge = (o: Remembered) => MARGINS[o.margin === "room" ? "normal" : o.margin];
const DIGIT_OPTIONS = BATES_DIGITS.map((d) => ({ value: String(d), label: batesNumber(1, d) }));

/** A whole number from 0 to `max` as typed, or null. */
export const wholeNumber = (text: string, max: number): number | null => {
  const t = text.trim();
  return /^\d{1,9}$/.test(t) && Number(t) <= max ? Number(t) : null;
};

/** What is missing before the run, or null. */
function missing(o: Remembered): string | null {
  if (wholeNumber(o.start, BATES_LIMITS.start) === null) return c.needsStart;
  if (wholeNumber(o.doc, BATES_LIMITS.doc) === null) return c.needsDoc;
  if (o.style === "custom" && !o.custom.trim()) return c.needsLine;
  return null;
}

const stampsOf = (o: Remembered): Stamp[] => [{ kind: "line", place: o.place, text: batesTemplate(o.style, o.prefix, o.custom), style: textStyle(o), margin: edge(o) }];

/** The room a line needs when the page grows for it: the line, and its distance from the edge once more. */
const roomFor = (o: Remembered) => {
  const points = Math.round((Number(o.size) || 10) * STAMP_LINE_HEIGHT + edge(o));
  return o.place.startsWith("top") ? { top: points, bottom: 0 } : { top: 0, bottom: points };
};

/** Where the count starts, from the options; null while a number is missing. */
function runOf(o: Remembered): BatesRun | null {
  const start = wholeNumber(o.start, BATES_LIMITS.start);
  const doc = wholeNumber(o.doc, BATES_LIMITS.doc);
  return start === null || doc === null ? null : { start, doc, digits: Number(o.digits) };
}

/**
 * Bates numbering (spec F9 §4): one running number on every page of every file, counted on from
 * file to file in the order shown, with the reader's own text before it. A settings tool on the
 * stamping engine; the pages show their numbers before the run.
 */
export function BatesTool() {
  const [opts, setOpts, optsLive] = useRemembered(tool.slug, defaults, check);
  const flow = stampFlow(
    tool,
    () => missing(optsLive.current) ?? stampsOf(optsLive.current),
    () => 1,
    undefined,
    {
      job: () => {
        const run = runOf(optsLive.current);
        return run && { bates: run, room: optsLive.current.margin === "room" ? roomFor(optsLive.current) : undefined };
      },
      preview: (spot) => {
        const run = runOf(optsLive.current);
        return run ? { bates: batesNumber(run.start + spot.before + spot.order, run.digits), doc: run.doc + spot.fileOrder } : {};
      },
    },
  );
  const changed = (Object.keys(defaults) as (keyof Remembered)[]).filter((k) => k !== "place" && opts[k] !== defaults[k]).length;
  const position = (where: string) => <Select id={`bates-place-${where}`} label={c.position} hideLabel={where === "bar"} value={opts.place} options={PLACE_OPTIONS} onChange={(place) => setOpts({ place })} />;
  const margin = (where: string) => <Select id={`bates-margin-${where}`} label={sc.margin} value={opts.margin} options={EDGE_OPTIONS} onChange={(margin) => setOpts({ margin })} />;
  // The file number shows only where the line uses it.
  const counts = opts.style === "exhibit" || opts.style === "exhibit-page" || opts.style === "custom";
  const number = (where: string, n: number) => (
    <Group n={n} title={c.stepNumber}>
      <div className="grid grid-cols-2 gap-2.5">
        <Select id={`bates-style-${where}`} label={c.style} value={opts.style} options={STYLE_OPTIONS} onChange={(style) => setOpts({ style })} />
        <Select id={`bates-digits-${where}`} label={c.digits} value={opts.digits} options={DIGIT_OPTIONS} onChange={(digits) => setOpts({ digits })} />
      </div>
      {opts.style === "custom" && (
        <div className="flex flex-col gap-1">
          <TextInput id={`bates-custom-${where}`} label={c.custom} value={opts.custom} maxLength={120} onChange={(custom) => setOpts({ custom })} />
          <p className="ip-stamp-hint">{c.tokens}</p>
        </div>
      )}
      <div className={counts && opts.style !== "custom" ? "ip-bates-three" : "grid grid-cols-2 gap-2.5"}>
        {opts.style !== "custom" && <TextInput id={`bates-prefix-${where}`} label={c.prefix} placeholder={c.prefixPlaceholder} value={opts.prefix} maxLength={60} onChange={(prefix) => setOpts({ prefix })} />}
        <TextInput id={`bates-start-${where}`} label={c.start} value={opts.start} maxLength={9} inputMode="numeric" onChange={(start) => setOpts({ start })} />
        {counts && <TextInput id={`bates-doc-${where}`} label={c.doc} value={opts.doc} maxLength={5} inputMode="numeric" onChange={(doc) => setOpts({ doc })} />}
      </div>
      <StyleFields where={`bates-${where}`} style={opts} sizes={LINE_SIZES} onChange={setOpts} colour={false} />
    </Group>
  );
  return (
    <PickPagesFlow
      tool={tool}
      verb="numbered"
      gridHint={c.gridHint}
      primaryLabel={c.primary}
      canRun={() => missing(opts) ?? true}
      decorate={flow.decorate}
      run={flow.run}
      renderMore={(ctx) => (
        <MoreOptions
          changed={changed}
          disabled={ctx.disabled}
          content={{
            extra: (
              <>
                <Group n={1} title={sc.stepWhere}>
                  {margin("more")}
                </Group>
                {number("more", 2)}
              </>
            ),
          }}
        />
      )}
      renderOptions={() => (
        <div className="flex min-w-0 items-center gap-3 dock-side:flex-col dock-side:items-stretch dock-side:gap-6 dock-bar:flex-1">
          <div className="flex min-w-0 flex-col gap-3.5 dock-bar:flex-1">
            <Step n={1}>{sc.stepWhere}</Step>
            <div className="ip-opt-pair">
              {position("bar")}
              <div className="ip-opt-side">{margin("side")}</div>
            </div>
          </div>
          <div className="ip-opt-side">{number("side", 2)}</div>
        </div>
      )}
    />
  );
}
