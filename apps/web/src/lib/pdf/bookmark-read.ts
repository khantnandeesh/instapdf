/**
 * Bookmarks (spec F10 §4): the file's whole outline for the editor, read with pdf.js. Unlike the
 * reader Split uses, nothing is skipped: a bookmark that opens a web link, or a heading that goes
 * nowhere, is listed with no page (-1), so the editor shows it and the saved file keeps it.
 * `index` is the bookmark's place in outline order, which the writer uses to find it again.
 */
import { BOOKMARK_LIMITS } from "./bookmark-edit";
import { openPdf } from "./pdfjs";
import type { OutlineDoc } from "./split-outline";

export type EditEntry = { index: number; level: number; page: number; title: string };
type Item = { title: string; dest: unknown; items?: Item[] };

/** Every bookmark in outline order. Stops one past the editor's limit: the caller then knows there are too many. */
export async function editEntries(doc: OutlineDoc): Promise<EditEntry[]> {
  const out: EditEntry[] = [];
  const walk = async (items: Item[], level: number) => {
    for (const it of items) {
      if (out.length > BOOKMARK_LIMITS.rows) return;
      let page = -1;
      try {
        const dest = (typeof it.dest === "string" ? await doc.getDestination(it.dest) : it.dest) as unknown[] | null;
        const target = dest?.[0];
        const at = typeof target === "number" ? target : target ? await doc.getPageIndex(target as never) : -1;
        if (at >= 0 && at < doc.numPages) page = at;
      } catch {
        // A target that is missing: listed with no page.
      }
      out.push({ index: out.length, level, page, title: (it.title ?? "").replace(/\s+/g, " ").trim() });
      if (it.items?.length) await walk(it.items, level + 1);
    }
  };
  await walk(((await doc.getOutline()) ?? []) as Item[], 1);
  return out;
}

/** The file's bookmarks, or null when the file cannot be read (the tool then says so instead of showing an empty list). */
export async function readForEdit(source: Blob, password?: string): Promise<EditEntry[] | null> {
  const opened = await openPdf(new Uint8Array(await source.arrayBuffer()), password);
  if (!opened.ok) return null;
  try {
    return await editEntries(opened.pdf.doc as unknown as OutlineDoc);
  } catch {
    return null;
  } finally {
    await opened.pdf.task.destroy();
  }
}
