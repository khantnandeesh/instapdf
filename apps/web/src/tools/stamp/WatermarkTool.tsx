"use client";
import { useEffect, useRef, useState } from "react";
import { useRemembered } from "@/components/page-select/hooks";
import { MoreOptions } from "@/components/page-select/MoreOptions";
import { Step } from "@/components/page-select/Step";
import { Button } from "@/components/ui/Button";
import { useLiveState } from "@/components/ui/live-state";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Select } from "@/components/ui/Select";
import { TextInput } from "@/components/ui/TextInput";
import type { Stamp, WatermarkLayout } from "@/lib/pdf/stamp";
import { flowTool } from "@/tools/registry";
import { PickPagesFlow } from "@/tools/to-image/PickPagesFlow";
import { stampCopy as sc, watermarkCopy as c } from "./copy";
import { checkStyle, Group, MARK_SIZES, stampFlow, StyleFields, textStyle, type StampImage, type StyleState } from "./shared";

const tool = flowTool("watermark-pdf");

type Kind = "text" | "image";
type Remembered = StyleState & { kind: Kind; text: string; layout: WatermarkLayout; angle: string; opacity: string; imageSize: string };
const defaults: Remembered = { kind: "text", text: "DRAFT", layout: "center", angle: "45", opacity: "30", imageSize: "0.5", font: "arimo", size: "72", colour: "#c0392b", bold: true };
const MAX = 80;
const check = (s: Record<string, unknown>): Partial<Remembered> => ({
  ...checkStyle(s, MARK_SIZES),
  ...(s.kind === "text" || s.kind === "image" ? { kind: s.kind } : {}),
  ...(typeof s.text === "string" && s.text.length <= MAX ? { text: s.text } : {}),
  ...(typeof s.layout === "string" && s.layout in c.layouts ? { layout: s.layout as WatermarkLayout } : {}),
  ...(typeof s.angle === "string" && s.angle in c.angles ? { angle: s.angle } : {}),
  ...(typeof s.opacity === "string" && STRENGTH_VALUES.includes(s.opacity) ? { opacity: s.opacity } : {}),
  ...(typeof s.imageSize === "string" && s.imageSize in c.imageSizes ? { imageSize: s.imageSize } : {}),
});
const STRENGTH_VALUES = ["10", "20", "30", "50", "75", "100"];
const STRENGTHS = STRENGTH_VALUES.map((value) => ({ value, label: c.opacityValue(Number(value)) }));
const KINDS: { value: Kind; label: string }[] = [
  { value: "text", label: c.text },
  { value: "image", label: c.image },
];
const options = <T extends string>(map: Record<T, string>) => (Object.keys(map) as T[]).map((value) => ({ value, label: map[value] }));
const LAYOUTS = options(c.layouts);
// Object keys that look like numbers come back sorted as numbers: the order is set here.
const ANGLES = ["0", "45", "-45", "90"].map((value) => ({ value, label: c.angles[value] }));
const IMAGE_SIZES = ["0.25", "0.5", "0.8"].map((value) => ({ value, label: c.imageSizes[value] }));

/** Reads a picked picture: PNG and JPG go in as they are, anything else the browser can draw becomes a PNG. */
export async function readStampImage(file: File): Promise<StampImage | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    let blob: Blob = file;
    if (file.type !== "image/png" && file.type !== "image/jpeg") {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
      const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!png) return null;
      blob = png;
    }
    bitmap.close();
    if (!(width > 0 && height > 0)) return null;
    return { bytes: new Uint8Array(await blob.arrayBuffer()), mime: blob.type === "image/jpeg" ? "image/jpeg" : "image/png", url: URL.createObjectURL(blob), width, height };
  } catch {
    return null;
  }
}

function stampsOf(o: Remembered, image: StampImage | null): Stamp[] | string {
  const base = { opacity: (Number(o.opacity) || 30) / 100, angle: Number(o.angle) || 0, layout: o.layout };
  if (o.kind === "text") return o.text.trim() ? [{ ...base, kind: "text", text: o.text, style: textStyle(o) }] : c.needsText;
  return image ? [{ ...base, kind: "image", asset: "mark", width: image.width, height: image.height, scale: Number(o.imageSize) || 0.5 }] : c.needsImage;
}

/**
 * Watermark (spec F9 §3): text or a picture over every page, or the picked ones: centred, along an
 * edge or repeated, turned and see-through. The pages show it as the file will have it.
 */
export function WatermarkTool() {
  const [opts, setOpts, optsLive] = useRemembered(tool.slug, defaults, check);
  const [image, setImage, imageLive] = useLiveState<StampImage | null>(null);
  const [bad, setBad] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  // The picture's preview URL is given back when it is replaced and when the tool closes.
  useEffect(() => () => void (image && URL.revokeObjectURL(image.url)), [image]);
  const flow = stampFlow(tool, () => stampsOf(optsLive.current, imageLive.current), () => 1, () => (optsLive.current.kind === "image" ? imageLive.current : null));
  const status = stampsOf(opts, image);
  const changed = (["layout", "angle", "opacity", "imageSize", "font", "size", "colour", "bold"] as const).filter((k) => opts[k] !== defaults[k]).length;
  const pick = async (file: File | undefined) => {
    if (!file) return;
    const read = await readStampImage(file);
    setBad(!read);
    if (read) setImage(read);
  };
  const what = (where: string) =>
    opts.kind === "text" ? (
      <TextInput id={`mark-text-${where}`} label={c.textLabel} hideLabel value={opts.text} maxLength={MAX} onChange={(text) => setOpts({ text })} className="min-w-0 flex-1" />
    ) : (
      <Button variant="secondary" onClick={() => input.current?.click()} data-testid="mark-image">
        {image ? c.change : c.choose}
      </Button>
    );
  const strength = (where: string) => <Select id={`mark-opacity-${where}`} label={c.opacity} value={opts.opacity} options={STRENGTHS} onChange={(opacity) => setOpts({ opacity })} />;
  const rest = (where: string) => (
    <Group n={2} title={sc.stepLook}>
      <div className="grid grid-cols-2 gap-2.5">
        <Select id={`mark-layout-${where}`} label={c.layout} value={opts.layout} options={LAYOUTS} onChange={(layout) => setOpts({ layout })} />
        <Select id={`mark-angle-${where}`} label={c.angle} value={opts.angle} options={ANGLES} onChange={(angle) => setOpts({ angle })} />
        {opts.kind === "image" && strength(where)}
        {opts.kind === "image" && <Select id={`mark-image-size-${where}`} label={c.imageSize} value={opts.imageSize} options={IMAGE_SIZES} onChange={(imageSize) => setOpts({ imageSize })} />}
      </div>
      {opts.kind === "text" && <StyleFields where={where} style={opts} sizes={MARK_SIZES} onChange={setOpts} beside={strength(where)} />}
    </Group>
  );
  return (
    <>
      <input ref={input} type="file" accept="image/*" hidden data-testid="mark-image-input" onChange={(e) => (void pick(e.target.files?.[0]), (e.target.value = ""))} />
      <PickPagesFlow
        tool={tool}
        verb="watermarked"
        gridHint={sc.gridHint}
        primaryLabel={c.primary}
        canRun={() => (bad && opts.kind === "image" && !image ? c.badImage : typeof status === "string" ? status : true)}
        decorate={flow.decorate}
        run={flow.run}
        renderMore={(ctx) => <MoreOptions changed={changed} disabled={ctx.disabled} content={{ extra: rest("more") }} />}
        renderOptions={() => (
          <div className="flex min-w-0 items-center gap-3 dock-side:flex-col dock-side:items-stretch dock-side:gap-7 dock-bar:flex-1">
            <div className="flex min-w-0 flex-col gap-3.5 dock-bar:flex-1">
              <Step n={1}>{sc.stepWhat}</Step>
              <div className="flex min-w-0 items-center gap-3">
                <SegmentedControl look="tabs" label={c.kind} value={opts.kind} options={KINDS} onChange={(kind) => setOpts({ kind })} className="shrink-0" />
                {what("bar")}
              </div>
            </div>
            <div className="ip-stamp-side">{rest("side")}</div>
          </div>
        )}
      />
    </>
  );
}
