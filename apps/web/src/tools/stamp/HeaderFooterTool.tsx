"use client";
import { useRemembered } from "@/components/page-select/hooks";
import { MoreOptions } from "@/components/page-select/MoreOptions";
import { Select } from "@/components/ui/Select";
import { TextInput } from "@/components/ui/TextInput";
import { PLACES, type Place, type Stamp } from "@/lib/pdf/stamp";
import { flowTool } from "@/tools/registry";
import { PickPagesFlow } from "@/tools/to-image/PickPagesFlow";
import { headerCopy as c, stampCopy as sc } from "./copy";
import { checkStyle, Group, LINE_SIZES, MARGIN_OPTIONS, MARGINS, stampFlow, StyleFields, textStyle, type Margin, type StyleState } from "./shared";

const tool = flowTool("pdf-header-footer");

type Texts = Record<Place, string>;
type Remembered = StyleState & Texts & { margin: Margin };
const empty = Object.fromEntries(PLACES.map((p) => [p, ""])) as Texts;
const defaults: Remembered = { ...empty, margin: "normal", font: "arimo", size: "10", colour: "#000000", bold: false };
const MAX = 120;
const check = (s: Record<string, unknown>): Partial<Remembered> => ({
  ...checkStyle(s, LINE_SIZES),
  ...Object.fromEntries(PLACES.filter((p) => typeof s[p] === "string" && (s[p] as string).length <= MAX).map((p) => [p, s[p]])),
  ...(typeof s.margin === "string" && s.margin in MARGINS ? { margin: s.margin as Margin } : {}),
});

const stampsOf = (o: Remembered): Stamp[] | string => {
  const lines = PLACES.filter((p) => o[p].trim()).map((place): Stamp => ({ kind: "line", place, text: o[place], style: textStyle(o), margin: MARGINS[o.margin] }));
  return lines.length ? lines : c.needs;
};
type Side = "left" | "center" | "right";

/**
 * Header and footer (spec F9 §2): up to six lines, one for each corner and the middle of the top and
 * bottom edges. {n}, {total}, {file} and {date} are filled in on each page.
 */
export function HeaderFooterTool() {
  const [opts, setOpts, optsLive] = useRemembered(tool.slug, defaults, check);
  const flow = stampFlow(tool, () => stampsOf(optsLive.current), () => 1);
  const filled = PLACES.filter((p) => opts[p].trim()).length;
  const field = (where: string, place: Place) => {
    const [edge, side] = place.split("-") as ["top" | "bottom", Side];
    return (
      <TextInput
        key={place}
        id={`hf-${place}-${where}`}
        label={c.field(edge === "top" ? c.header : c.footer, c.slot[side])}
        hideLabel
        placeholder={where === "bar" ? c.field(c.header, c.slot[side]) : c.slot[side]}
        value={opts[place]}
        maxLength={MAX}
        onChange={(v) => setOpts({ [place]: v })}
      />
    );
  };
  const rest = (where: string) => (
    <>
      <Group n={1} title={c.header}>
        <div className="ip-stamp-three">{PLACES.slice(0, 3).map((p) => field(where, p))}</div>
      </Group>
      <Group n={2} title={c.footer}>
        <div className="ip-stamp-three">{PLACES.slice(3).map((p) => field(where, p))}</div>
        <p className="ip-stamp-hint">{c.tokens}</p>
      </Group>
      <Group n={3} title={sc.stepLook}>
        <StyleFields
          where={where}
          style={opts}
          sizes={LINE_SIZES}
          onChange={setOpts}
          beside={<Select id={`hf-margin-${where}`} label={sc.margin} value={opts.margin} options={MARGIN_OPTIONS} onChange={(margin) => setOpts({ margin })} />}
        />
      </Group>
    </>
  );
  const status = stampsOf(opts);
  return (
    <PickPagesFlow
      tool={tool}
      verb="changed"
      gridHint={sc.gridHint}
      primaryLabel={c.primary}
      canRun={() => (typeof status === "string" ? status : true)}
      decorate={flow.decorate}
      run={flow.run}
      renderMore={(ctx) => <MoreOptions changed={filled} disabled={ctx.disabled} content={{ extra: rest("more") }} />}
      renderOptions={() => (
        <div className="flex min-w-0 items-center gap-3 dock-side:flex-col dock-side:items-stretch dock-side:gap-7 dock-bar:flex-1">
          {/* The bar holds the line most headers are; the panel lists all six. */}
          <div className="ip-opt-bar flex min-w-0 flex-col gap-3.5 dock-bar:flex-1">{field("bar", "top-center")}</div>
          <div className="ip-opt-side">{rest("side")}</div>
        </div>
      )}
    />
  );
}
