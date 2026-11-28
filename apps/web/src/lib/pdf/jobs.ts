/**
 * Processing jobs that run inside the processing Web Worker
 * (`processing.worker.ts`). Kept free of worker globals so they are unit tested.
 *
 * Memory: inputs arrive as Blobs (no copy on the main thread). Rotate reads
 * them one at a time and hands each output off (single PDF) or streams it into
 * the ZIP before reading the next, so one input and one output are held. Merge
 * builds one output: each source is parsed at its first use and released after
 * its last page is copied (see merge.ts), so only the sources still to come
 * stay parsed next to the growing output.
 */
export { USER_ERROR } from "./user-error";
import type { BatesRun, Stamp } from "./stamp";
import type { AnnotationKind } from "./annotations";
import type { MetadataField } from "./metadata";
import { buildDocuments } from "./build";
import { mergePdf, type MergeEnv, type MergeInput } from "./merge";
import { pdfOutputName, uniqueNames } from "./naming";
import { protectPdf, unlockPdf, type ProtectOptions } from "./protect";
import { planSplit, type SplitMode } from "../page-plans";
import { cropPdf } from "./crop";
import { deskewPdf } from "./deskew";
import { addTextLayers } from "./ocr-layer";
import { flipPdf, type FlipDirection } from "./flip";
import { nupPdf, type NupOptions } from "./nup";
import { resizePdf, type ResizeOptions } from "./resize";
import type { Area } from "./area";
import { loadForEdit, rotatePdf } from "./rotate";
import { splitHalfPdf, type HalfOptions } from "./split-half";
import { measuredLimit, measureWith, partsBySize } from "./split-size";
import { USER_ERROR } from "./user-error";
import { createZipWriter } from "./zip";
import type { DocumentsJob, JobFile } from "./documents-job";
import { documentsJob } from "./documents-job";
export { documentsJob, type DocumentsJob, type JobFile } from "./documents-job";

export type RotateJob = {
  kind: "rotate";
  files: (JobFile & { deltas: number[] })[];
  /** Used when there are two or more files. */
  zipName: string;
};

export type MergeJob = { kind: "merge"; name: string } & MergeInput;

/** Protect (F11): every file encrypted with the same passwords and restrictions. */
export type ProtectJob = { kind: "protect"; files: JobFile[]; zipName: string; options: ProtectOptions };
/** Unlock (F11): every file saved with no password and no restrictions. */
export type UnlockJob = { kind: "unlock"; files: JobFile[]; zipName: string };

/** Split by size (F7): each file cut into the fewest parts that stay under `limit` bytes. */
export type SplitSizeJob = { kind: "splitSize"; files: (JobFile & { id: string; pageCount: number })[]; limit: number };

/** Split in half (F7): the picked pages of each file cut into two pages. */
export type SplitHalfJob = { kind: "splitHalf"; files: (JobFile & { cut: number[] })[]; zipName: string; options: HalfOptions };

/** Page-shape tools (F8). `pages` are the 0-based pages to change; `areas` the part of each page to keep. */
/** Deskew (F15): `turns` maps a 0-based page to the degrees it is turned clockwise. */
export type DeskewJob = { kind: "deskew"; files: (JobFile & { turns: Record<number, number> })[]; zipName: string };
export type FlipJob = { kind: "flip"; files: (JobFile & { pages: number[] })[]; zipName: string; direction: FlipDirection };
export type ResizeJob = { kind: "resize"; files: (JobFile & { pages: number[] })[]; zipName: string; options: ResizeOptions };
export type CropJob = { kind: "crop"; files: (JobFile & { areas: Record<number, Area> })[]; zipName: string };
export type NupJob = { kind: "nup"; files: JobFile[]; zipName: string; options: NupOptions };

/** Stamps (F9): page numbers, headers and footers, watermarks, on the picked pages of each file. */
export type StampJob = { kind: "stamp"; files: (JobFile & { pages: number[] })[]; zipName: string; stamps: Stamp[]; first: number; date: string; assets?: Record<string, { bytes: Uint8Array; mime: "image/png" | "image/jpeg" }>; /** Bates numbering: counted on from file to file, in order. */ bates?: BatesRun; room?: { top: number; bottom: number } };

/** Document tools (F10). */
export type AnnotationsJob = { kind: "annotations"; files: (JobFile & { pages: number[] })[]; zipName: string; kinds: AnnotationKind[] };
export type FlattenJob = { kind: "flatten"; files: JobFile[]; zipName: string; annotations: boolean };
export type MetadataJob = { kind: "metadata"; files: JobFile[]; zipName: string } & ({ mode: "remove" } | { mode: "update"; fields: MetadataField[]; remove: string[] });

/** Flatten to pictures: the pages were drawn in the tab (a canvas is needed); the worker puts each file's pictures into a PDF. */
export type PicturesJob = { kind: "pictures"; files: { name: string; title?: string; encrypted: boolean; pages: { jpg: Blob; width: number; height: number }[] }[]; zipName: string };
export type BookmarksJob = { kind: "bookmarks"; files: JobFile[]; zipName: string; items: import("./bookmark-edit").BookmarkNode[] };
/** Grayscale (spec F13 §1): which pictures hold colour; one grey picture packed; the file converted. */
export type GrayScanJob = { kind: "grayScan"; file: JobFile };
export type GrayEncodeJob = { kind: "grayEncode"; pixels: Blob; width: number; height: number; lossy: boolean; /** JPEG quality, 1 to 100 (the engine's own when left out). */ quality?: number };
export type GrayscaleJob = { kind: "grayscale"; files: (JobFile & { images?: { ref: string; width: number; height: number; jpeg: boolean; data: Blob }[] })[]; zipName: string; vector: boolean; blackText?: boolean };
/** Compress (spec F6): which pictures could be smaller; one picture packed as a JPEG; the file written with the smaller pictures in place. */
export type CompressScanJob = { kind: "compressScan"; file: JobFile };
export type JpegEncodeJob = { kind: "jpegEncode"; /** One byte a pixel (grey) or three (red, green, blue). */ pixels: Blob; width: number; height: number; channels: 1 | 3; quality: number };
export type CompressJob = { kind: "compress"; file: JobFile & { images: { ref: string; width: number; height: number; gray: boolean; data: Blob }[] } };
export type RepairJob = { kind: "repair"; files: JobFile[]; zipName: string };
/** OCR (F15): each layer is a text-only page from the recogniser, laid over the 0-based page it was read from. */
export type OcrLayerJob = { kind: "ocrLayer"; files: (JobFile & { layers: { page: number; pdf: Blob }[] })[]; zipName: string; /** Take out the text an earlier OCR left, before anything is added. */ strip?: boolean };
export type Job = CompressScanJob | JpegEncodeJob | CompressJob | OcrLayerJob | DeskewJob | RepairJob | GrayScanJob | GrayEncodeJob | GrayscaleJob | BookmarksJob | PicturesJob | AnnotationsJob | FlattenJob | MetadataJob | RotateJob | MergeJob | DocumentsJob | ProtectJob | UnlockJob | SplitSizeJob | SplitHalfJob | FlipJob | ResizeJob | CropJob | NupJob | StampJob;

/** The code a job loads on first use, by kind: a tool that knows its job fetches it ahead (`warmWorker`), so the run does not wait for it. */
const AHEAD: Partial<Record<Job["kind"], () => Promise<unknown>>> = {
  grayScan: () => import("./grayscale"),
  grayscale: () => import("./grayscale"),
  grayEncode: () => import("./gray-encode"),
  repair: () => import("./repair"),
  compressScan: () => import("./compress"),
  compress: () => import("./compress"),
  jpegEncode: () => import("./jpeg"),
};
export function warmJobs(kinds: readonly Job["kind"][]): void {
  for (const kind of kinds) void AHEAD[kind]?.().catch(() => {});
}

export type JobOutput = {
  name: string;
  type: "application/pdf" | "application/zip";
  blob: Blob;
  /** Page count of a single-PDF output. */
  pageCount?: number;
  /** ZIP entries (name and page count), in order. */
  entries?: { name: string; pageCount: number }[];
  /** True when any input was encrypted and the output is not (Protect's output is, so it says false). */
  wasEncrypted: boolean;
  /** Non-blocking notes for the user about the result. */
  warnings?: string[];
  /** Good news about the result (Repair: what was recovered). */
  notes?: string[];
  /** grayScan only: the pictures that hold colour, by object reference as pdf.js writes it. */
  found?: { ref: string; lossy: boolean; width: number; height: number }[];
  /** compressScan only: the pictures that could be packed smaller. */
  pictures?: { ref: string; width: number; height: number; gray: boolean; bytes: number }[];
  /** compress only: how many pictures were swapped, and whether the file came back as it was (no smaller). */
  swapped?: number;
  unchanged?: boolean;
};

/** `phase` "fonts" = a font download (indeterminate); "pages" = back to the fraction. */
export type ProgressFn = (fraction: number, phase?: "fonts" | "pages") => void;

/** What only the worker can provide (font fetches, browser image decoding). Absent in unit tests unless stubbed. */
export type JobEnv = Omit<MergeEnv, "onPhase">;

export async function runJob(job: Job, onProgress: ProgressFn, env: JobEnv = {}): Promise<JobOutput> {
  switch (job.kind) {
    case "rotate":
      return runRotate(job, onProgress);
    case "merge":
      return runMerge(job, onProgress, env);
    case "protect":
      // The output is encrypted, so "this copy has no password" never applies.
      return { ...(await runPerFile(job.files, job.zipName, onProgress, async (bytes, file) => protectPdf({ bytes, password: file.password, options: job.options }))), wasEncrypted: false };
    case "unlock": {
      const out = await runPerFile(job.files, job.zipName, onProgress, (bytes, file) => unlockPdf({ bytes, password: file.password }));
      if (!out.wasEncrypted) throw new Error(`${USER_ERROR}${job.files.length === 1 ? "This PDF has" : "These PDFs have"} no password or restrictions, so there is nothing to remove.`);
      // Removing the password is the point here, not a side effect to warn about.
      return { ...out, wasEncrypted: false };
    }
    case "splitSize":
      return runSplitSize(job, onProgress, env);
    case "splitHalf":
      return runPerFile(job.files, job.zipName, onProgress, (bytes, file, progress) => splitHalfPdf({ bytes, password: file.password, cut: file.cut, options: job.options }, progress));
    case "ocrLayer":
      return runPerFile(job.files, job.zipName, onProgress, async (bytes, file, progress) =>
        addTextLayers({ bytes, password: file.password, strip: job.strip, layers: await Promise.all(file.layers.map(async (l) => ({ page: l.page, pdf: new Uint8Array(await l.pdf.arrayBuffer()) }))) }, progress),
      );
    case "deskew":
      return runPerFile(job.files, job.zipName, onProgress, (bytes, file, progress) => deskewPdf({ bytes, password: file.password, turns: file.turns }, progress));
    case "flip":
      return runPerFile(job.files, job.zipName, onProgress, (bytes, file, progress) => flipPdf({ bytes, password: file.password, pages: file.pages, direction: job.direction }, progress));
    case "resize":
      return runPerFile(job.files, job.zipName, onProgress, (bytes, file, progress) => resizePdf({ bytes, password: file.password, pages: file.pages, options: job.options }, progress));
    case "crop":
      return runPerFile(job.files, job.zipName, onProgress, (bytes, file, progress) => cropPdf({ bytes, password: file.password, areas: file.areas }, progress));
    case "stamp": {
      // The editor's build and its fonts are loaded only for these tools.
      const [{ stampPdf }, { runBuild }] = await Promise.all([import("./stamp-run"), import("@/lib/editor/build-runtime")]);
      // Where each file's count starts: after the pages of the files before it; a file with no page to stamp takes no file number.
      const place = new Map<unknown, { start: number; doc: number }>();
      if (job.bates) {
        let { start, doc } = job.bates;
        for (const f of job.files) {
          place.set(f, { start, doc });
          start += f.pages.length;
          if (f.pages.length) doc += 1;
        }
      }
      return runPerFile(job.files, job.zipName, onProgress, (bytes, file, progress) => {
        const at = place.get(file);
        const bates = job.bates && at ? { ...job.bates, ...at } : undefined;
        return stampPdf({ bytes, password: file.password, pages: file.pages, stamps: job.stamps, first: job.first, file: file.name.replace(/\.pdf$/i, ""), date: job.date, assets: job.assets, bates, room: job.room }, runBuild, progress);
      });
    }
    case "annotations": {
      const { removeAnnotations } = await import("./annotations");
      let removed = 0;
      const out = await runPerFile(job.files, job.zipName, onProgress, async (bytes, file, progress) => {
        const r = await removeAnnotations({ bytes, password: file.password, pages: file.pages, kinds: job.kinds }, progress);
        removed += r.removed;
        // In a batch, a file that had nothing to remove is named: it comes back as it went in.
        return !r.removed && job.files.length > 1 ? { ...r, warnings: [`${file.name} has no annotations of the chosen kinds, so it is unchanged.`] } : r;
      });
      if (!removed) throw new Error(`${USER_ERROR}No annotations of the chosen kinds were found on ${job.files.length === 1 ? "these pages" : "the pages of these files"}, so there is nothing to remove.`);
      return out;
    }
    case "repair": {
      const { repairPdf } = await import("./repair");
      return runPerFile(job.files, job.zipName, onProgress, (bytes, file, progress) => repairPdf({ bytes, password: file.password, name: file.name }, progress));
    }
    case "compressScan": {
      const { compressiblePictures } = await import("./compress");
      const r = await compressiblePictures({ bytes: new Uint8Array(await job.file.source.arrayBuffer()), password: job.file.password });
      return { name: "", type: "application/pdf", blob: new Blob([]), pageCount: r.pageCount, wasEncrypted: false, pictures: r.pictures };
    }
    case "jpegEncode": {
      const { encodeColourJpeg, encodeJpeg } = await import("./jpeg");
      const px = new Uint8Array(await job.pixels.arrayBuffer());
      const data = job.channels === 1 ? encodeJpeg(job.width, job.height, [{ plane: px, width: job.width, height: job.height, h: 1, v: 1, table: 0 }], job.quality) : encodeColourJpeg(px, job.width, job.height, job.quality);
      return { name: "", type: "application/pdf", blob: new Blob([data as Uint8Array<ArrayBuffer>], { type: "image/jpeg" }), wasEncrypted: false };
    }
    case "compress": {
      const { compressPdf } = await import("./compress");
      onProgress(0);
      const file = job.file;
      const images = await Promise.all(file.images.map(async (i) => ({ ref: i.ref, width: i.width, height: i.height, gray: i.gray, data: new Uint8Array(await i.data.arrayBuffer()) })));
      const r = await compressPdf({ bytes: new Uint8Array(await file.source.arrayBuffer()), password: file.password, images }, onProgress);
      return { name: file.name, type: "application/pdf", blob: new Blob([r.bytes as Uint8Array<ArrayBuffer>], { type: "application/pdf" }), pageCount: r.pageCount, wasEncrypted: r.wasEncrypted, swapped: r.swapped, unchanged: r.unchanged };
    }
    case "grayScan": {
      const { colourImages } = await import("./grayscale");
      const r = await colourImages({ bytes: new Uint8Array(await job.file.source.arrayBuffer()), password: job.file.password });
      return { name: "", type: "application/pdf", blob: new Blob([]), pageCount: r.pageCount, wasEncrypted: false, found: r.images };
    }
    case "grayEncode": {
      const { encodeGrayFlate, encodeGrayJpeg } = await import("./gray-encode");
      const px = new Uint8Array(await job.pixels.arrayBuffer());
      // A JPEG holds at most 65,535 pixels a side.
      const jpeg = job.lossy && job.width <= 65535 && job.height <= 65535;
      const data = jpeg ? encodeGrayJpeg(px, job.width, job.height, job.quality) : encodeGrayFlate(px, job.width, job.height);
      return { name: "", type: "application/pdf", blob: new Blob([data as Uint8Array<ArrayBuffer>], { type: jpeg ? "image/jpeg" : "application/octet-stream" }), wasEncrypted: false };
    }
    case "grayscale": {
      const { grayscalePdf } = await import("./grayscale");
      return runPerFile(job.files, job.zipName, onProgress, async (bytes, file, progress) => {
        const images = file.images && (await Promise.all(file.images.map(async (i) => ({ ref: i.ref, width: i.width, height: i.height, jpeg: i.jpeg, predictor: !i.jpeg, data: new Uint8Array(await i.data.arrayBuffer()) }))));
        return grayscalePdf({ bytes, password: file.password, vector: job.vector, blackText: job.blackText, images }, progress);
      });
    }
    case "bookmarks": {
      const { writeBookmarks } = await import("./bookmarks");
      return runPerFile(job.files, job.zipName, onProgress, (bytes, file, progress) => writeBookmarks({ bytes, password: file.password, items: job.items }, progress));
    }
    case "pictures": {
      const { picturesPdf } = await import("./pictures-pdf");
      // runPerFile reads `source`; the pictures are the real input.
      return runPerFile(job.files.map((f) => ({ ...f, source: new Blob([]) })), job.zipName, onProgress, async (_bytes, file, progress) => ({ bytes: await picturesPdf(file.pages, file.title, progress), pageCount: file.pages.length, wasEncrypted: file.encrypted }));
    }
    case "flatten": {
      const { flattenPdf } = await import("./flatten");
      return runPerFile(job.files, job.zipName, onProgress, (bytes, file, progress) => flattenPdf({ bytes, password: file.password, annotations: job.annotations }, progress));
    }
    case "metadata": {
      const { writeMetadata } = await import("./metadata");
      return runPerFile(job.files, job.zipName, onProgress, (bytes, file) => writeMetadata(job.mode === "remove" ? { bytes, password: file.password, mode: "remove" } : { bytes, password: file.password, mode: "update", fields: job.fields, remove: job.remove }));
    }
    case "nup":
      return runPerFile(job.files, job.zipName, onProgress, (bytes, file, progress) => nupPdf({ bytes, password: file.password, options: job.options }, progress));
    case "split":
    case "extract":
    case "delete":
      return runDocuments(job, onProgress, env);
  }
}

/** The parts are worked out first (most of the time goes there), then written like any other split. */
async function runSplitSize(job: SplitSizeJob, onProgress: ProgressFn, env: JobEnv): Promise<JobOutput> {
  const perFile: Record<string, SplitMode> = {};
  const notes: string[] = [];
  for (const [i, f] of job.files.entries()) {
    const progress = (x: number) => onProgress((0.6 * (i + x)) / job.files.length);
    const bytes = new Uint8Array(await f.source.arrayBuffer());
    // A file that is under the limit as it stands is not cut, however close it is.
    if (bytes.length <= job.limit) {
      perFile[f.id] = { kind: "parts", parts: [Array.from({ length: f.pageCount }, (_, k) => k)] };
      notes.push(`${f.name} is already under the limit, so it stays one file.`);
      progress(1);
      continue;
    }
    const { doc } = await loadForEdit(bytes, f.password);
    const pageCount = doc.getPageCount();
    const measure = measureWith(doc);
    const guess = Math.floor(job.limit / Math.max(1, bytes.length / pageCount));
    // The parts are sized on the bare pages, but the written files also carry bookmarks, links and form
    // resources. So each round writes the parts for real and, where one is over, sizes them again with
    // the largest overhead seen taken off the limit.
    let parts: number[][] = [];
    let sizes: number[] = [];
    let extra = 0;
    for (let round = 0; round < 4; round++) {
      parts = (await partsBySize(pageCount, Math.max(1, measuredLimit(job.limit) - extra), measure, guess, (x) => progress((round + x) / 4))).parts;
      const built = await buildDocuments(
        { sources: [{ id: f.id, name: f.name, kind: "pdf", source: f.source, password: f.password }], documents: parts.map((p, j) => ({ name: `${j}.pdf`, pages: p.map((k) => ({ sourceId: f.id, sourceIndex: k, rotation: 0 })) })) },
        env,
        () => {},
      );
      sizes = built.documents.map((d) => d.bytes.length);
      if (!sizes.some((size, j) => size > job.limit && parts[j].length > 1)) break;
      const overhead = await Promise.all(parts.map(async (p, j) => sizes[j] - (await measure(p[0], p[p.length - 1] + 1))));
      extra = Math.max(extra + 1024, Math.max(...overhead) + 1024);
    }
    progress(1);
    perFile[f.id] = { kind: "parts", parts };
    const alone = parts.filter((p, j) => sizes[j] > job.limit && p.length === 1).map((p) => p[0] + 1);
    if (alone.length) notes.push(`${alone.length === 1 ? `Page ${alone[0]}` : `Pages ${alone.join(", ")}`} of ${f.name} ${alone.length === 1 ? "is" : "are each"} over the limit alone, so ${alone.length === 1 ? "its file is" : "their files are"} too.`);
    if (parts.some((p, j) => sizes[j] > job.limit && p.length > 1)) notes.push(`Some parts of ${f.name} could not be brought under the limit.`);
  }
  const plan = planSplit(job.files, { mode: { kind: "ranges", items: [] }, perFile });
  const out = await runDocuments(documentsJob("split", plan, job.files), (x, phase) => onProgress(0.6 + 0.4 * x, phase), env);
  const warnings = [...notes, ...(out.warnings ?? [])];
  // One file that stays whole keeps its own name, not "name-1-12".
  const whole = job.files.length === 1 && plan.documents.length === 1 ? { name: pdfOutputName(job.files[0].name) } : {};
  return { ...out, ...whole, ...(warnings.length ? { warnings } : {}) };
}

async function runDocuments(job: DocumentsJob, onProgress: ProgressFn, env: JobEnv): Promise<JobOutput> {
  // Only documents with pages are written (buildDocuments skips the others), so
  // they alone decide between one PDF and a ZIP.
  const written = job.documents.filter((d) => d.pages.length);
  const names = uniqueNames(written.map((d) => d.name));
  const documents = written.map((d, i) => ({ ...d, name: names[i] }));
  const progress = (f: number) => onProgress(f, "pages");
  if (documents.length === 1) {
    const r = await buildDocuments({ sources: job.sources, documents, options: job.options }, env, progress);
    const [doc] = r.documents;
    return {
      name: doc.name,
      type: "application/pdf",
      blob: new Blob([doc.bytes as Uint8Array<ArrayBuffer>], { type: "application/pdf" }),
      pageCount: doc.pageCount,
      wasEncrypted: r.wasEncrypted,
      ...(r.warnings.length ? { warnings: r.warnings } : {}),
    };
  }
  const zip = createZipWriter();
  const entries: { name: string; pageCount: number }[] = [];
  const r = await buildDocuments({ sources: job.sources, documents, options: job.options }, env, progress, (doc) => {
    zip.add(doc.name, doc.bytes); // copied into the ZIP Blob; doc.bytes can be collected now
    entries.push({ name: doc.name, pageCount: doc.pageCount });
  });
  return {
    name: job.zipName,
    type: "application/zip",
    blob: zip.finish(),
    entries,
    wasEncrypted: r.wasEncrypted,
    ...(r.warnings.length ? { warnings: r.warnings } : {}),
  };
}

async function runMerge(job: MergeJob, onProgress: ProgressFn, env: JobEnv): Promise<JobOutput> {
  let phase: "fonts" | "pages" = "pages";
  let last = 0;
  const r = await mergePdf(job, { ...env, onPhase: (p) => onProgress(last, (phase = p)) }, (f) => onProgress((last = f), phase));
  return {
    name: job.name,
    type: "application/pdf",
    blob: new Blob([r.bytes as Uint8Array<ArrayBuffer>], { type: "application/pdf" }),
    pageCount: r.pageCount,
    wasEncrypted: r.wasEncrypted,
    warnings: r.warnings,
  };
}

type FileResult = { bytes: Uint8Array; pageCount: number; wasEncrypted: boolean; warnings?: string[]; notes?: string[] };

/**
 * One output per input file, each kept under its own name: a single PDF, or a ZIP of them. `weights`
 * share the progress bar between files; `work` reports progress inside its file (F1 eval G-2).
 */
async function runPerFile<F extends JobFile>(
  files: readonly F[],
  zipName: string,
  onProgress: ProgressFn,
  work: (bytes: Uint8Array, file: F, progress: (fraction: number) => void) => Promise<FileResult>,
  weights: number[] = files.map(() => 1),
): Promise<JobOutput> {
  const total = weights.reduce((a, b) => a + b, 0);
  let done = 0;
  onProgress(0);
  let wasEncrypted = false;
  // Each note once, however many files it applies to.
  const notes = new Set<string>();
  const good = new Set<string>();
  const warnings = () => ({ ...(notes.size ? { warnings: [...notes] } : {}), ...(good.size ? { notes: [...good] } : {}) });
  const one = async (file: F, i: number) => {
    const within = (fraction: number) => onProgress(Math.min(0.99, (done + weights[i] * fraction) / total));
    const bytes = new Uint8Array(await file.source.arrayBuffer());
    within(0.1);
    const r = await work(bytes, file, (f) => within(0.1 + 0.9 * f));
    wasEncrypted ||= r.wasEncrypted;
    r.warnings?.forEach((w) => notes.add(w));
    r.notes?.forEach((w) => good.add(w));
    return r;
  };

  if (files.length === 1) {
    const r = await one(files[0], 0);
    onProgress(1);
    return {
      name: pdfOutputName(files[0].name),
      type: "application/pdf",
      blob: new Blob([r.bytes as Uint8Array<ArrayBuffer>], { type: "application/pdf" }),
      pageCount: r.pageCount,
      wasEncrypted,
      ...warnings(),
    };
  }

  const names = uniqueNames(files.map((f) => pdfOutputName(f.name)));
  const zip = createZipWriter();
  const entries: { name: string; pageCount: number }[] = [];
  for (let i = 0; i < files.length; i++) {
    const r = await one(files[i], i);
    zip.add(names[i], r.bytes); // copied into the ZIP Blob; r.bytes can be collected now
    entries.push({ name: names[i], pageCount: r.pageCount });
    done += weights[i];
    onProgress(done / total);
  }
  return { name: zipName, type: "application/zip", blob: zip.finish(), entries, wasEncrypted, ...warnings() };
}

const runRotate = (job: RotateJob, onProgress: ProgressFn): Promise<JobOutput> =>
  runPerFile(
    job.files,
    job.zipName,
    onProgress,
    (bytes, file, progress) => rotatePdf({ bytes, deltas: file.deltas, password: file.password }, progress),
    job.files.map((f) => Math.max(1, f.deltas.length)),
  );
