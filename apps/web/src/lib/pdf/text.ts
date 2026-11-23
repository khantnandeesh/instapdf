/**
 * Text that Merge writes into the output (file-name footer, contents page).
 * Names the standard Helvetica font can encode (WinAnsi) use it, with no
 * download. Any other name is drawn with Noto Sans (SIL OFL 1.1): Latin,
 * Greek, Cyrillic, Vietnamese, Devanagari, Hebrew, Thai, Japanese, Korean and
 * Simplified Chinese, fetched slice by slice (only the slices its characters
 * need), never at page load (spec F3 §5 and §8a decision 8).
 *
 * Known limitation: Arabic (and other scripts needing contextual shaping)
 * cannot be drawn correctly without a shaping engine, so those characters,
 * like any character no slice covers, become "?". Hebrew runs are laid out
 * right to left (no full bidi algorithm: one level, which is what file names
 * need).
 */
import { degrees, StandardFonts, type Color, type PDFDocument, type PDFFont, type PDFPage } from "@cantoo/pdf-lib";

/** A font file and the code point ranges it covers, in order of preference. */
export type FontManifest = { fonts: { file: string; ranges: [number, number][] }[] };

export type FontSource = {
  manifest: () => Promise<FontManifest>;
  load: (file: string) => Promise<Uint8Array>;
};

export type TextWriter = {
  width: (text: string, size: number) => number;
  /** Draws text from (x, y) along `rotate` degrees (counter-clockwise). */
  draw: (page: PDFPage, text: string, o: { x: number; y: number; size: number; color: Color; rotate?: number }) => void;
  /** Shortens text with "…" so it fits in `maxWidth`. */
  fit: (text: string, size: number, maxWidth: number) => string;
};

type Run = { font: PDFFont; text: string };

/** Parses a CSS unicode-range ("U+0000-00FF,U+0131") into [lo, hi] pairs. */
export function parseUnicodeRange(css: string): [number, number][] {
  return css
    .split(",")
    .map((part) => part.trim().replace(/^U\+/i, ""))
    .filter(Boolean)
    .map((part) => {
      const [lo, hi] = part.split("-");
      if (lo.includes("?")) return [parseInt(lo.replace(/\?/g, "0"), 16), parseInt(lo.replace(/\?/g, "F"), 16)] as [number, number];
      return [parseInt(lo, 16), parseInt(hi ?? lo, 16)] as [number, number];
    });
}

/** Arabic, Syriac, Thaana, N'Ko and their presentation forms: need contextual shaping we cannot do. */
const needsShaping = (cp: number) => (cp >= 0x0600 && cp <= 0x08ff) || (cp >= 0xfb50 && cp <= 0xfdff) || (cp >= 0xfe70 && cp <= 0xfeff);

/** Hebrew (and its presentation forms): drawn right to left. */
const isRtl = (cp: number) => (cp >= 0x0590 && cp <= 0x05ff) || (cp >= 0xfb1d && cp <= 0xfb4f);

/**
 * Visual order for a left-to-right line: each run of right-to-left
 * characters (with the spaces between them) is reversed.
 */
export function visualOrder(text: string): string {
  const chars = Array.from(text);
  const out: string[] = [];
  for (let i = 0; i < chars.length; ) {
    const cp = chars[i].codePointAt(0)!;
    if (!isRtl(cp)) {
      out.push(chars[i++]);
      continue;
    }
    let j = i;
    let lastRtl = i;
    while (j < chars.length) {
      const c = chars[j].codePointAt(0)!;
      if (isRtl(c)) lastRtl = j;
      else if (c !== 0x20) break;
      j++;
    }
    out.push(...chars.slice(i, lastRtl + 1).reverse());
    i = lastRtl + 1;
  }
  return out.join("");
}

const covers = (ranges: [number, number][], cp: number) => ranges.some(([lo, hi]) => cp >= lo && cp <= hi);

/** WinAnsi characters above 0x7f that are not Latin-1 (Helvetica can draw these too). */
const WIN_ANSI_EXTRA = new Set(Array.from("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ", (c) => c.codePointAt(0)!));

/**
 * True when the standard Helvetica font (WinAnsi encoding) can show every
 * character. Checked explicitly: the font itself silently substitutes.
 */
export function isWinAnsi(text: string): boolean {
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if ((cp >= 0x20 && cp <= 0x7e) || (cp >= 0xa0 && cp <= 0xff) || WIN_ANSI_EXTRA.has(cp)) continue;
    return false;
  }
  return true;
}

/**
 * Prepares fonts for every string in `texts`. `onFontDownload` is called
 * before any font file is fetched (so the UI can say "Preparing fonts…").
 */
export async function createTextWriter(doc: PDFDocument, texts: readonly string[], fonts?: FontSource, onFontDownload?: () => void): Promise<TextWriter> {
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const needsUnicode = texts.filter((t) => !isWinAnsi(t));
  const byFile = new Map<string, PDFFont>();
  let manifest: FontManifest | null = null;

  if (needsUnicode.length && fonts) {
    onFontDownload?.();
    manifest = await fonts.manifest();
    const wanted = new Set<string>();
    for (const t of needsUnicode) {
      for (const ch of t) {
        const cp = ch.codePointAt(0)!;
        if (needsShaping(cp)) continue;
        const hit = manifest.fonts.find((f) => covers(f.ranges, cp));
        if (hit) wanted.add(hit.file);
      }
    }
    if (wanted.size) {
      const fontkit = (await import("@cantoo/fontkit")).default;
      doc.registerFontkit(fontkit);
      for (const file of wanted) byFile.set(file, await doc.embedFont(await fonts.load(file), { subset: true }));
    }
  }

  // A slice's range can claim code points its font has no glyph for: check the real set.
  const charsets = new Map<string, Set<number>>();
  const charset = (file: string) => {
    let set = charsets.get(file);
    if (!set) charsets.set(file, (set = new Set(byFile.get(file)!.getCharacterSet())));
    return set;
  };
  const runsOf = (text: string): Run[] => {
    if (isWinAnsi(text)) return [{ font: helvetica, text }];
    if (!manifest) return [{ font: helvetica, text: Array.from(text, (ch) => (isWinAnsi(ch) ? ch : "?")).join("") }];
    const runs: Run[] = [];
    for (const ch of text) {
      const cp = ch.codePointAt(0)!;
      const entry = needsShaping(cp) ? undefined : manifest.fonts.find((f) => covers(f.ranges, cp) && byFile.has(f.file) && charset(f.file).has(cp));
      const font = entry ? byFile.get(entry.file)! : helvetica;
      const piece = entry ? ch : "?";
      const last = runs[runs.length - 1];
      if (last && last.font === font) last.text += piece;
      else runs.push({ font, text: piece });
    }
    return runs;
  };

  const width = (text: string, size: number) => runsOf(text).reduce((s, r) => s + r.font.widthOfTextAtSize(r.text, size), 0);

  return {
    width,
    fit(text, size, maxWidth) {
      if (width(text, size) <= maxWidth) return text;
      const chars = Array.from(text);
      let lo = 0;
      let hi = chars.length;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (width(`${chars.slice(0, mid).join("")}…`, size) <= maxWidth) lo = mid;
        else hi = mid - 1;
      }
      return `${chars.slice(0, lo).join("")}…`;
    },
    draw(page, text, { x, y, size, color, rotate = 0 }) {
      const rad = (rotate * Math.PI) / 180;
      let cx = x;
      let cy = y;
      for (const run of runsOf(visualOrder(text))) {
        page.drawText(run.text, { x: cx, y: cy, size, font: run.font, color, rotate: degrees(rotate) });
        const w = run.font.widthOfTextAtSize(run.text, size);
        cx += Math.cos(rad) * w;
        cy += Math.sin(rad) * w;
      }
    },
  };
}
