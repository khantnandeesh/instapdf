import { openPdf } from "./pdfjs";
import { STANDARD_FIELDS, type MetadataField } from "./metadata-options";

/** A file's text fields for the Metadata tool's form, read with the page renderer (off the main thread). */
export async function readDocFields(source: Blob, password?: string): Promise<MetadataField[]> {
  const opened = await openPdf(new Uint8Array(await source.arrayBuffer()), password);
  if (!opened.ok) return [];
  try {
    const info = ((await opened.pdf.doc.getMetadata().catch(() => null))?.info ?? {}) as Record<string, unknown>;
    const out: MetadataField[] = [];
    for (const name of STANDARD_FIELDS) if (typeof info[name] === "string" && info[name]) out.push({ name, value: info[name] as string });
    // The renderer hands the maker's own fields over as a Map (older versions: a plain object).
    const custom = info.Custom instanceof Map ? [...(info.Custom as Map<string, unknown>)] : info.Custom && typeof info.Custom === "object" ? Object.entries(info.Custom as Record<string, unknown>) : [];
    for (const [name, value] of custom) if (typeof value === "string" && value) out.push({ name, value });
    return out;
  } finally {
    void opened.pdf.task.destroy();
  }
}
