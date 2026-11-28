"use client";
import "./stamp.css";
import type { ReactNode } from "react";
import { StampLayer } from "@/components/page-edit/StampLayer";
import type { PageDecoration, ToolOutput } from "@/components/tool-flow/types";
import { Select } from "@/components/ui/Select";
import { STAMP_FONTS, stampObjects, type BatesRun, type Stamp, type StampFont, type TextStyle, type TokenValues } from "@/lib/pdf/stamp";
import { USER_ERROR } from "@/lib/pdf/user-error";
import { runInWorker } from "@/lib/pdf/worker-client";
import type { FlowTool } from "@/tools/registry";
import type { PageSpot, PickedSource } from "@/tools/to-image/PickPagesFlow";
import { stampCopy as c } from "./copy";

/** The look of stamped text, as the options keep it (sizes are the Select's text). */
export type StyleState = { font: StampFont; size: string; colour: string; bold: boolean };

export const LINE_SIZES = ["8", "9", "10", "11", "12", "14", "16", "18", "24"];
export const MARK_SIZES = ["24", "36", "48", "60", "72", "96", "144"];
export const MARGINS = { narrow: 18, normal: 30, wide: 48 } as const;
export type Margin = keyof typeof MARGINS;
export const MARGIN_OPTIONS = (Object.keys(MARGINS) as Margin[]).map((value) => ({ value, label: c.margins[value] }));
const COLOUR_OPTIONS = Object.entries(c.colours).map(([value, label]) => ({ value, label }));

export const textStyle = (s: StyleState): TextStyle => ({ font: s.font, size: Number(s.size) || 12, color: s.colour, bold: s.bold });

/** What a remembered style may hold: anything else falls back to the default. */
export function checkStyle(s: Record<string, unknown>, sizes: readonly string[]): Partial<StyleState> {
  return {
    ...(STAMP_FONTS.some((f) => f.value === s.font) ? { font: s.font as StampFont } : {}),
    ...(typeof s.size === "string" && sizes.includes(s.size) ? { size: s.size } : {}),
    ...(typeof s.colour === "string" && s.colour in c.colours ? { colour: s.colour } : {}),
    ...(typeof s.bold === "boolean" ? { bold: s.bold } : {}),
  };
}

/** The font choices: each face, plain and bold (one control instead of a face and a switch). */
const FACE_OPTIONS = STAMP_FONTS.flatMap((f) => [
  { value: f.value as string, label: f.label },
  { value: `${f.value}-bold`, label: `${f.label}, bold` },
]);

/** The controls of a text style, two to a row. `where` keeps the ids apart when the panel and the sheet both hold them; `beside` shares the colour's row. */
export function StyleFields({ where, style, sizes, onChange, beside, colour = true }: { where: string; style: StyleState; sizes: readonly string[]; onChange: (patch: Partial<StyleState>) => void; beside?: ReactNode; /** False where the text is always black (Bates numbers). */ colour?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <Select
        id={`stamp-font-${where}`}
        label={c.font}
        value={`${style.font}${style.bold ? "-bold" : ""}`}
        options={FACE_OPTIONS}
        onChange={(v) => onChange({ font: v.replace(/-bold$/, "") as StampFont, bold: v.endsWith("-bold") })}
      />
      <Select id={`stamp-size-${where}`} label={c.size} value={style.size} options={sizes.map((v) => ({ value: v, label: `${v} pt` }))} onChange={(size) => onChange({ size })} />
      {colour && <Select id={`stamp-colour-${where}`} label={c.colour} value={style.colour} options={COLOUR_OPTIONS} onChange={(colour) => onChange({ colour })} />}
      {beside}
    </div>
  );
}

const today = () => new Date().toLocaleDateString(undefined, { dateStyle: "medium" });
const baseName = (name: string) => name.replace(/\.pdf$/i, "");

/** A picture for a watermark: its bytes for the file, a URL for the preview, and its size. */
export type StampImage = { bytes: Uint8Array; mime: "image/png" | "image/jpeg"; url: string; width: number; height: number };

/**
 * The two things every stamping tool needs: the preview on each page tile and the run. `stamps`
 * returns what to draw (from the live options) or a sentence saying what is missing.
 */
/** What a tool that counts across files adds (Bates numbering): the run's settings, and the values a page's preview shows. */
export type Counted = { job: () => { bates: BatesRun; room?: { top: number; bottom: number } } | null; preview: (spot: PageSpot) => Partial<TokenValues> };

export function stampFlow(tool: FlowTool, stamps: () => Stamp[] | string, first: () => number, image?: () => StampImage | null, counted?: Counted) {
  const decorate = (applies: boolean, spot: PageSpot): Partial<PageDecoration> => {
    const list = stamps();
    const size = spot.file.pages?.[spot.index];
    if (!applies || typeof list === "string" || !size) return {};
    const page = { w: size.width, h: size.height };
    const objects = stampObjects({ id: "p", view: [0, 0, page.w, page.h], baseRotate: 0 }, list, { n: first() + spot.order, total: first() + spot.count - 1, file: baseName(spot.file.name), date: today(), ...counted?.preview(spot) });
    const picture = image?.();
    return { overlay: <StampLayer page={page} objects={objects} images={picture ? { mark: picture.url } : undefined} /> };
  };
  const run = async (sources: PickedSource[], signal: AbortSignal, onProgress: (fraction: number) => void): Promise<ToolOutput> => {
    const list = stamps();
    if (typeof list === "string") throw new Error(USER_ERROR + list);
    const picture = image?.();
    const out = await runInWorker(
      {
        kind: "stamp",
        zipName: tool.flow.outputName?.(sources.map((s) => s.name)) ?? "",
        stamps: list,
        first: first(),
        date: today(),
        assets: picture ? { mark: { bytes: picture.bytes, mime: picture.mime } } : undefined,
        ...counted?.job(),
        files: sources.map((s) => ({ name: s.name, source: s.source, password: s.password, pages: s.pages })),
      },
      { signal, onProgress },
    );
    return { name: out.name, type: out.type, blob: out.blob, size: out.blob.size, pageCount: out.pageCount, entries: out.entries, wasEncrypted: out.wasEncrypted, warnings: out.warnings };
  };
  return { decorate, run };
}

export { Group } from "@/components/page-select/OptionGroup";
