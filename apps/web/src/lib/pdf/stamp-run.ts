/**
 * Runs a stamping job on one file (spec F9): reads the page shapes, lays the stamps out
 * (`stamp.ts`) and hands the objects to the editor's build, which draws them.
 */
import type { Asset, BuildInput } from "@/lib/editor/build";
import { initialPages } from "@/lib/editor/model";
import { loadForEdit } from "./rotate";
import { visibleBox } from "./split-half";
import { batesNumber, numbering, stampObjects, type BatesRun, type Stamp } from "./stamp";

export type StampInput = {
  bytes: Uint8Array;
  password?: string;
  /** 0-based pages to stamp. */
  pages: readonly number[];
  stamps: readonly Stamp[];
  /** The number the first stamped page gets. */
  first: number;
  /** The file's name without its extension, for {file}. */
  file: string;
  /** Today's date as text, for {date}. */
  date: string;
  assets?: Record<string, Asset>;
  /** Bates numbering: `start` is the number this file's first stamped page gets, `doc` this file's number. */
  bates?: BatesRun;
  /** Points added to the top and bottom of the stamped pages first, so the line has a margin of its own to sit in. */
  room?: { top: number; bottom: number };
};

export type StampBuild = (input: BuildInput) => Promise<Uint8Array>;

export async function stampPdf(input: StampInput, build: StampBuild, onProgress?: (fraction: number) => void): Promise<{ bytes: Uint8Array; pageCount: number; wasEncrypted: boolean }> {
  let source = input.bytes;
  let password = input.password;
  let opened = false;
  if (input.room && (input.room.top > 0 || input.room.bottom > 0) && input.pages.length) {
    const { resizePdf } = await import("./resize");
    const grown = await resizePdf({ bytes: source, password, pages: input.pages, options: { mode: "margins", margins: { top: input.room.top, right: 0, bottom: input.room.bottom, left: 0 } } });
    source = grown.bytes;
    password = undefined;
    opened = grown.wasEncrypted;
  }
  const loaded = await loadForEdit(source, password);
  const doc = loaded.doc;
  const wasEncrypted = opened || loaded.wasEncrypted;
  const pages = initialPages(
    doc.getPages().map((p) => {
      const b = visibleBox(p.getCropBox(), p.getMediaBox());
      return { view: [b.x, b.y, b.x + b.width, b.y + b.height] as [number, number, number, number], rotate: p.getRotation().angle };
    }),
  );
  onProgress?.(0.2);
  const { numbers, total } = numbering(pages.length, input.pages, input.first);
  const bates = input.bates;
  const objects = pages.flatMap((page, i) => {
    const n = numbers.get(i);
    if (n === undefined) return [];
    const counted = bates ? { bates: batesNumber(bates.start + (n - input.first), bates.digits), doc: bates.doc } : {};
    return stampObjects(page, input.stamps, { n, total, file: input.file, date: input.date, ...counted });
  });
  // The build gets a file with no password on it: an opened file is written out plain first.
  const bytes = loaded.wasEncrypted ? await doc.save() : source;
  if (!objects.length) return { bytes, pageCount: pages.length, wasEncrypted };
  onProgress?.(0.3);
  const out = await build({ bytes, pages, objects, assets: input.assets ?? {} });
  return { bytes: out, pageCount: pages.length, wasEncrypted };
}
