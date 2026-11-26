/**
 * The page tools' output engine (spec F4/F5 §0a.4, §6): writes N PDFs from a
 * plan, each a list of (source, page index, rotation). Split runs it with one
 * document per part, Extract and Delete with one per input file.
 *
 * Every document goes through Merge's composer (merge.ts), so it gets the
 * same copy path and fidelity fixes: pruned resources, cleaned links,
 * bookmarks with their views, document info from a single source, form
 * fields that follow their pages.
 *
 * Memory: each source is parsed once, at the first document that uses it,
 * and released after the last one. Documents are written one at a time and
 * handed to `onDocument` as soon as each is saved, so a caller that streams
 * them into a ZIP holds one output at a time.
 */
import { defaultMergeOptions, type MergeOptions } from "./merge-options";
import { composeDocument, openSource, type MergeEnv, type MergePageInput, type MergeSourceInput, type OpenedSource, type SourcePool } from "./merge";

export type BuildDocumentPlan = {
  /** File name of this output (already unique within the run). */
  name: string;
  pages: MergePageInput[];
};

export type BuildInput = {
  sources: MergeSourceInput[];
  documents: BuildDocumentPlan[];
  /** Merge options for every document. Default: Merge's defaults (keep bookmarks, merge-rename forms). */
  options?: Partial<MergeOptions>;
};

export type BuiltDocument = { name: string; bytes: Uint8Array; pageCount: number };

export type BuildResult = {
  /** The documents, in plan order; empty when `onDocument` took them. */
  documents: BuiltDocument[];
  wasEncrypted: boolean;
  warnings: string[];
};

/** Writes every document of the plan. `onProgress` goes from 0 to 1 over the whole run, weighted by pages. */
export async function buildDocuments(
  input: BuildInput,
  env: MergeEnv,
  onProgress: (fraction: number) => void,
  onDocument?: (doc: BuiltDocument, index: number) => void | Promise<void>,
): Promise<BuildResult> {
  const options: MergeOptions = { ...defaultMergeOptions, ...input.options };
  const byId = new Map(input.sources.map((s) => [s.id, s]));
  const docs = input.documents.filter((d) => d.pages.length);
  if (!docs.length) throw new Error("Nothing to write");

  // The last document that needs each source: it is released after that one.
  const lastUse = new Map<string, number>();
  docs.forEach((d, i) => d.pages.forEach((p) => p.sourceId && lastUse.set(p.sourceId, i)));

  const open = new Map<string, OpenedSource>();
  let wasEncrypted = false;
  const pool: SourcePool = {
    async open(id) {
      const have = open.get(id);
      if (have) return have;
      const s = byId.get(id);
      if (!s) throw new Error("Unknown source");
      const o = await openSource(s, options);
      wasEncrypted ||= o.encrypted;
      open.set(id, o);
      return o;
    },
    release: () => {}, // kept for later documents; dropped below after its last one
  };

  const weights = docs.map((d) => d.pages.length);
  const total = weights.reduce((a, b) => a + b, 0);
  let done = 0;
  onProgress(0);
  const documents: BuiltDocument[] = [];
  const warnings: string[] = [];
  for (let i = 0; i < docs.length; i++) {
    const plan = docs[i];
    const at = (f: number) => onProgress(Math.min(0.999, (done + weights[i] * f) / total));
    const r = await composeDocument({ sources: input.sources, pages: plan.pages, options }, env, pool, (f) => at(f * 0.9));
    for (const w of r.warnings) if (!warnings.includes(w)) warnings.push(w);
    const bytes = await r.out.save();
    const built: BuiltDocument = { name: plan.name, bytes, pageCount: r.out.getPageCount() };
    for (const [id, last] of lastUse) if (last === i) open.delete(id);
    if (onDocument) await onDocument(built, i);
    else documents.push(built);
    done += weights[i];
    onProgress(Math.min(0.999, done / total));
  }
  onProgress(1);
  return { documents, wasEncrypted, warnings };
}
