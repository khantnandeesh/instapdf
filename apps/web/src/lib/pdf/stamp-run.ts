/**
 * Runs a stamping job on one file (spec F9): reads the page shapes, lays the stamps out
 * (`stamp.ts`) and hands the objects to the editor's build, which draws them.
 */
import type { Asset, BuildInput } from "@/lib/editor/build";
import { initialPages } from "@/lib/editor/model";
import { loadForEdit } from "./rotate";
import { visibleBox } from "./split-half";
import { numbering, stampObjects, type Stamp } from "./stamp";

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
};

export type StampBuild = (input: BuildInput) => Promise<Uint8Array>;

export async function stampPdf(input: StampInput, build: StampBuild, onProgress?: (fraction: number) => void): Promise<{ bytes: Uint8Array; pageCount: number; wasEncrypted: boolean }> {
  const { doc, wasEncrypted } = await loadForEdit(input.bytes, input.password);
  const pages = initialPages(
    doc.getPages().map((p) => {
      const b = visibleBox(p.getCropBox(), p.getMediaBox());
      return { view: [b.x, b.y, b.x + b.width, b.y + b.height] as [number, number, number, number], rotate: p.getRotation().angle };
    }),
  );
  onProgress?.(0.2);
  const { numbers, total } = numbering(pages.length, input.pages, input.first);
  const objects = pages.flatMap((page, i) => {
    const n = numbers.get(i);
    return n === undefined ? [] : stampObjects(page, input.stamps, { n, total, file: input.file, date: input.date });
  });
  // The build gets a file with no password on it: an opened file is written out plain first.
  const bytes = wasEncrypted ? await doc.save() : input.bytes;
  if (!objects.length) return { bytes, pageCount: pages.length, wasEncrypted };
  onProgress?.(0.3);
  const out = await build({ bytes, pages, objects, assets: input.assets ?? {} });
  return { bytes: out, pageCount: pages.length, wasEncrypted };
}
