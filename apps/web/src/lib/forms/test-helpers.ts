/**
 * Test helpers for the forms module (Node only, used by *.test.ts): qpdf's syntax check via
 * pikepdf (MPL-2.0) and a pdf.js render to pixels via @napi-rs/canvas (MIT), the optional canvas
 * pdfjs-dist uses in Node.
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** qpdf's check of the file (AC-247). Returns the problems found; [] when clean. */
export function qpdfCheck(bytes: Uint8Array): string[] {
  const dir = mkdtempSync(join(tmpdir(), "forms-"));
  try {
    const file = join(dir, "out.pdf");
    writeFileSync(file, bytes);
    const script = "import sys, pikepdf\nwith pikepdf.open(sys.argv[1]) as p:\n  print('\\n'.join(map(str, p.check_pdf_syntax())))";
    const out = execFileSync("python3", ["-c", script, file], { encoding: "utf8" });
    return out.split("\n").map((s) => s.trim()).filter(Boolean);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export type Pixels = { width: number; height: number; data: Uint8ClampedArray; scale: number; view: number[] };

/** Renders one page (1-based) with pdf.js, annotations drawn from their appearance streams. */
export async function renderPage(bytes: Uint8Array, pageNumber: number, scale = 2, forms = true): Promise<Pixels> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 }).promise;
  try {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    // pdfjs-dist's own optional canvas for Node, resolved from pdfjs-dist (no extra dependency).
    const fromPdfjs = createRequire(new URL("../../../node_modules/pdfjs-dist/package.json", import.meta.url));
    const { createCanvas } = fromPdfjs("@napi-rs/canvas") as {
      createCanvas: (w: number, h: number) => { width: number; height: number; getContext: (t: "2d") => CanvasRenderingContext2D };
    };
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({
      canvas: canvas as unknown as HTMLCanvasElement,
      canvasContext: ctx,
      viewport,
      annotationMode: forms ? pdfjs.AnnotationMode.ENABLE : pdfjs.AnnotationMode.DISABLE,
    }).promise;
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return { width: img.width, height: img.height, data: img.data as Uint8ClampedArray, scale, view: page.view };
  } finally {
    await pdf.loadingTask.destroy();
  }
}

/** Share of dark pixels (luma < 128) inside a box given in device pixels. */
export function inkIn(px: Pixels, x: number, y: number, w: number, h: number): number {
  let dark = 0;
  let n = 0;
  for (let yy = Math.max(0, Math.floor(y)); yy < Math.min(px.height, Math.ceil(y + h)); yy++)
    for (let xx = Math.max(0, Math.floor(x)); xx < Math.min(px.width, Math.ceil(x + w)); xx++) {
      const i = (yy * px.width + xx) * 4;
      const l = 0.299 * px.data[i] + 0.587 * px.data[i + 1] + 0.114 * px.data[i + 2];
      if (l < 128) dark++;
      n++;
    }
  return n ? dark / n : 0;
}

export async function annotationsOf(bytes: Uint8Array, pageNumber: number) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 }).promise;
  try {
    const page = await pdf.getPage(pageNumber);
    return (await page.getAnnotations()) as { subtype: string; fieldName?: string; fieldType?: string; rect: number[]; fieldValue?: unknown; buttonValue?: string; hasAppearance?: boolean; rotation?: number }[];
  } finally {
    await pdf.loadingTask.destroy();
  }
}

/** public/fonts/noto is generated (scripts/copy-fonts.mjs); makes it on a fresh checkout. */
export function ensureNotoFonts(): URL {
  const dir = new URL("../../../public/fonts/noto/", import.meta.url);
  if (!existsSync(new URL("manifest.json", dir))) execFileSync("node", [new URL("../../../scripts/copy-fonts.mjs", import.meta.url).pathname]);
  return dir;
}
