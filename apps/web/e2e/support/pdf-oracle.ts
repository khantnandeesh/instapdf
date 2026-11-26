/**
 * Output oracle for downloaded PDFs, independent of the app's own libraries:
 * - qpdf's `--check` (pikepdf's check_pdf_syntax follows QPDFJob::doCheck step by step; pikepdf
 *   is MPL-2.0 and bundles libqpdf, Apache-2.0),
 * - PDFium (pypdfium2, Apache-2.0 / BSD-3-Clause): opens the file and renders every page,
 * - pdf.js (Apache-2.0): opens the file with stopAtErrors and builds every page's operator list.
 * CI installs both Python packages (.github/workflows/ci.yml, e2e job). Locally a missing install
 * skips the test; in CI it fails.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "@playwright/test";

const CHECK = [
  "import sys, json, pikepdf, pypdfium2",
  "out = {}",
  "for path in sys.argv[2:]:",
  "  probs = []",
  "  try:",
  "    with pikepdf.open(path) as p:",
  "      probs += ['qpdf: ' + str(x) for x in p.check_pdf_syntax()]",
  "  except Exception as e:",
  "    probs.append('qpdf: cannot open: ' + str(e))",
  "  try:",
  "    doc = pypdfium2.PdfDocument(path)",
  "    for i in range(len(doc)):",
  "      bmp = doc[i].render(scale=0.25)",
  "      buf, n, w, h, st = bytes(bmp.buffer), bmp.n_channels, bmp.width, bmp.height, bmp.stride",
  "      ink = sum(1 for y in range(h) for x in range(0, w * n, n) if min(buf[y * st + x:y * st + x + min(n, 3)]) < 200)",
  "      if w < 10 or h < 10: probs.append(f'pdfium: page {i + 1} rendered {w}x{h}')",
  "      elif sys.argv[1] == 'ink' and ink == 0: probs.append(f'pdfium: page {i + 1} rendered blank')",
  "    doc.close()",
  "  except Exception as e:",
  "    probs.append('pdfium: ' + str(e))",
  "  out[path] = probs",
  "print(json.dumps(out))",
].join("\n");

/** Renders page a of file A and page b of file B with PDFium at 72 dpi and counts differing pixels (-1: sizes differ). */
const DIFF = [
  "import sys, pypdfium2",
  "def px(path, i):",
  "  doc = pypdfium2.PdfDocument(path)",
  "  bmp = doc[i].render(scale=1)",
  "  r = (bmp.width, bmp.height, bmp.n_channels, bytes(bmp.buffer), bmp.stride)",
  "  doc.close()",
  "  return r",
  "a = px(sys.argv[1], int(sys.argv[2]))",
  "b = px(sys.argv[3], int(sys.argv[4]))",
  "if a[:3] != b[:3]:",
  "  print(-1)",
  "else:",
  "  w, h, n, ba, sa = a",
  "  bb, sb = b[3], b[4]",
  "  print(sum(1 for y in range(h) for x in range(w) if ba[y * sa + x * n:y * sa + x * n + n] != bb[y * sb + x * n:y * sb + x * n + n]))",
].join("\n");

/** Skips (locally) or fails (CI) when pikepdf or pypdfium2 is missing. Call at the start of a test. */
export function requireOracle() {
  try {
    execFileSync("python3", ["-c", "import pikepdf, pypdfium2"], { stdio: "ignore" });
  } catch {
    if (process.env.CI) throw new Error("The output oracle needs pikepdf and pypdfium2: pip install pikepdf==10.18.2 pypdfium2==5.14.0");
    test.skip(true, "pikepdf (qpdf) or pypdfium2 is not installed here");
  }
}

function withFiles<T>(files: Record<string, Uint8Array>, fn: (paths: Record<string, string>) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "berry-oracle-"));
  try {
    const paths: Record<string, string> = {};
    Object.entries(files).forEach(([name, bytes], i) => {
      paths[name] = join(dir, `${i}.pdf`);
      writeFileSync(paths[name], bytes);
    });
    return fn(paths);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function pdfjsProblems(bytes: Uint8Array, ink: boolean): Promise<string[]> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({ data: bytes.slice(), verbosity: 0, stopAtErrors: true });
  const out: string[] = [];
  try {
    const doc = await task.promise;
    for (let i = 1; i <= doc.numPages; i++) {
      const ops = await (await doc.getPage(i)).getOperatorList();
      if (ink && !ops.fnArray.length) out.push(`pdf.js: page ${i} has no operators`);
    }
  } catch (e) {
    out.push(`pdf.js: ${(e as Error).message}`);
  } finally {
    await task.destroy();
  }
  return out;
}

/**
 * Every file through qpdf's check, PDFium (open and render each page) and pdf.js (open, operator
 * list per page). Returns the problems per file name; `{}` when all are clean. With `ink` (the
 * default), a page that PDFium renders blank or pdf.js finds empty is a problem too: every fixture
 * page carries text. Pass `ink: false` for outputs with blank pages.
 */
export async function oracle(files: Record<string, Uint8Array>, { ink = true } = {}): Promise<Record<string, string[]>> {
  const native = withFiles(files, (paths) => {
    const byPath = JSON.parse(execFileSync("python3", ["-c", CHECK, ink ? "ink" : "any", ...Object.values(paths)], { encoding: "utf8", maxBuffer: 1 << 24 })) as Record<string, string[]>;
    return Object.fromEntries(Object.entries(paths).map(([name, path]) => [name, byPath[path]]));
  });
  const out: Record<string, string[]> = {};
  for (const [name, bytes] of Object.entries(files)) {
    const problems = [...native[name], ...(await pdfjsProblems(bytes, ink))];
    if (problems.length) out[name] = problems;
  }
  return out;
}

/** Differing pixels between page `pageA` (1-based) of `a` and page `pageB` of `b`, rendered by PDFium at 72 dpi; -1 when the sizes differ. */
export function renderDiff(a: Uint8Array, pageA: number, b: Uint8Array, pageB: number): number {
  return withFiles({ a, b }, (p) => Number(execFileSync("python3", ["-c", DIFF, p.a, String(pageA - 1), p.b, String(pageB - 1)], { encoding: "utf8" }).trim()));
}
