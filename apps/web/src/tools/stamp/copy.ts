import { formatCount as n } from "@/components/page-select/copy";
import type { BatesStyle, Place, WatermarkLayout } from "@/lib/pdf/stamp";

/** Words shared by the stamping tools (spec F9): Page numbers, Header and footer, Watermark. */
export const stampCopy = {
  gridHint: "Click pages to change only those. With none picked, every page is changed.",
  place: {
    "top-left": "Top left",
    "top-center": "Top centre",
    "top-right": "Top right",
    "bottom-left": "Bottom left",
    "bottom-center": "Bottom centre",
    "bottom-right": "Bottom right",
  } satisfies Record<Place, string>,
  font: "Font",
  size: "Text size",
  colour: "Colour",
  colours: { "#000000": "Black", "#5f5f5f": "Grey", "#c0392b": "Red", "#1f4fbf": "Blue", "#1e7d43": "Green", "#ffffff": "White" } as Record<string, string>,
  bold: "Bold",
  margin: "From the edge",
  margins: { narrow: "Close", normal: "Normal", wide: "Far" },
  stepWhere: "Where",
  stepWhat: "What",
  stepLook: "Look",
};

export const numbersCopy = {
  primary: (pages: number) => `Number ${n(pages)} ${pages === 1 ? "page" : "pages"}`,
  position: "Position",
  format: "Format",
  first: "First number",
  firstError: "Enter a whole number from 0 to 99999",
  needsFirst: "Enter the first number",
};

export const headerCopy = {
  primary: (pages: number) => `Add to ${n(pages)} ${pages === 1 ? "page" : "pages"}`,
  header: "Header",
  footer: "Footer",
  slot: { left: "Left", center: "Centre", right: "Right" },
  field: (edge: string, side: string) => `${edge}, ${side.toLowerCase()}`,
  placeholder: "Text",
  tokens: "{n} page number, {total} last number, {file} file name, {date} today",
  needs: "Type a header or a footer",
};

export const watermarkCopy = {
  primary: (pages: number) => `Watermark ${n(pages)} ${pages === 1 ? "page" : "pages"}`,
  kind: "Watermark type",
  text: "Text",
  image: "Picture",
  textLabel: "Watermark text",
  choose: "Choose a picture",
  change: "Change picture",
  layout: "Position",
  layouts: { center: "Centre", top: "Top", bottom: "Bottom", tile: "Repeated" } satisfies Record<WatermarkLayout, string>,
  angle: "Angle",
  angles: { "0": "Level", "45": "Rising", "-45": "Falling", "90": "Upright" } as Record<string, string>,
  opacity: "Strength",
  opacityValue: (v: number) => `${v}%`,
  imageSize: "Picture size",
  imageSizes: { "0.25": "Small", "0.5": "Medium", "0.8": "Large" } as Record<string, string>,
  needsText: "Type the watermark text",
  needsImage: "Choose a picture",
  badImage: "That file is not a picture we can read. Try a PNG or a JPG.",
};

export const batesCopy = {
  primary: (pages: number) => `Number ${n(pages)} ${pages === 1 ? "page" : "pages"}`,
  gridHint: "Numbers count on from file to file, in the order shown. Click pages to number only those.",
  position: "Position",
  stepNumber: "Number",
  style: "Line",
  styles: {
    number: "Number",
    "number-page": "With page",
    exhibit: "Exhibit",
    "exhibit-page": "Exhibit, page",
    custom: "Your own",
  } satisfies Record<BatesStyle, string>,
  digits: "Digits",
  prefix: "Text before",
  prefixPlaceholder: "Case name",
  start: "Starts at",
  doc: "Files from",
  custom: "Your line",
  tokens: "{bates} number, {doc} file, {n} page, {file} name, {date}",
  room: "Added strip",
  needsStart: "Enter the first number",
  needsDoc: "Enter the first file number",
  needsLine: "Type your line, with {bates} where the number goes",
};
