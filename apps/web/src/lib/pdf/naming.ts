/** Output file naming. Pure functions, unit tested. */

/** Strips any directory part a browser might include. */
export function fileNameOnly(name: string): string {
  const parts = name.split(/[\\/]/);
  return parts[parts.length - 1] || "document.pdf";
}

/** "report.PDF" -> "report"; "archive.tar.pdf" -> "archive.tar"; "noext" -> "noext". */
export function baseName(name: string): string {
  const only = fileNameOnly(name);
  const dot = only.lastIndexOf(".");
  return dot > 0 ? only.slice(0, dot) : only;
}

/** The longest file name most file systems take (ext4, APFS, NTFS, ZIP tools): 255 bytes of UTF-8. */
export const MAX_NAME_BYTES = 255;

const encoder = new TextEncoder();
const byteLength = (s: string) => encoder.encode(s).length;

/** Splits text into user-perceived characters where the runtime can, else code points. */
function characters(s: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    return Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(s), (x) => x.segment);
  }
  return Array.from(s);
}

/** Cuts text to at most `max` UTF-8 bytes without splitting a character. */
function cutToBytes(s: string, max: number): string {
  if (byteLength(s) <= max) return s;
  let out = "";
  let used = 0;
  for (const ch of characters(s)) {
    const n = byteLength(ch);
    if (used + n > max) break;
    out += ch;
    used += n;
  }
  return out;
}

/** Windows device names, reserved with any extension ("CON", "nul.pdf", "COM1.tar.pdf"). */
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i;

const trimEnds = (stem: string) => stem.replace(/^[\s.]+|[\s.]+$/g, "");

/**
 * The stem made to fit "<stem><ext>" in MAX_NAME_BYTES: a reserved device
 * name gets a leading "_", and a cut never leaves a trailing dot or space.
 */
function fitStem(stem: string, ext: string): string {
  let out = RESERVED.test(stem) ? `_${stem}` : stem;
  const room = MAX_NAME_BYTES - byteLength(ext);
  if (byteLength(out) > room) out = trimEnds(cutToBytes(out, room));
  return out;
}

/** "<stem><ext>" for a full name: the stem before the last dot, kept whole when there is none. */
function splitExt(name: string): [string, string] {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
}

/** A whole file name made safe to save: length cap and reserved names (characters are left as they are). */
function fitName(name: string): string {
  const [stem, ext] = splitExt(name);
  return `${fitStem(stem, ext)}${ext}`;
}

/** Keeps the original name, making sure it ends in `.pdf` (and fits: length cap, reserved names). */
export function pdfOutputName(inputName: string): string {
  const only = fileNameOnly(inputName);
  return /\.pdf$/i.test(only) ? fitName(only) : `${fitStem(baseName(only), ".pdf")}.pdf`;
}

/** "berrypdf-<tool>.zip", with the tool slug's trailing "-pdf" removed. */
export function zipName(toolSlug: string): string {
  return `berrypdf-${toolSlug.replace(/-pdf$/, "")}.zip`;
}

/**
 * Makes ZIP entry names unique, case-insensitively (Windows and macOS file
 * systems are), by adding " (2)", " (3)"... before the extension. Every name,
 * suffix included, fits in MAX_NAME_BYTES.
 */
export function uniqueNames(names: readonly string[]): string[] {
  const used = new Set<string>();
  return names.map((raw) => {
    const name = fitName(fileNameOnly(raw));
    if (!used.has(name.toLowerCase())) {
      used.add(name.toLowerCase());
      return name;
    }
    const [stem, ext] = splitExt(name);
    for (let n = 2; ; n++) {
      const suffix = ` (${n})`;
      const candidate = `${fitStem(stem, suffix + ext)}${suffix}${ext}`;
      if (!used.has(candidate.toLowerCase())) {
        used.add(candidate.toLowerCase());
        return candidate;
      }
    }
  });
}

/** Human-readable size: "812 B", "4.2 KB", "1.2 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/**
 * Merge output (spec F3 §6): "<first file's base name>_merged.pdf" (the reference's form, eval G-3). Characters
 * not allowed in file names on common systems are replaced with "-".
 */
export function mergedName(firstInputName: string | undefined): string {
  return suffixedName(firstInputName, "_merged");
}

/** Replaces characters not allowed in file names on common systems with "-", and trims dots and spaces at the ends. */
export function safeFileStem(stem: string): string {
  return trimEnds(stem.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-"));
}

/** "<base><suffix>.pdf" from the first input's name ("berrypdf" when there is none); the base is cut to fit. */
function suffixedName(firstInputName: string | undefined, suffix: string): string {
  const safe = safeFileStem(firstInputName ? baseName(firstInputName) : "");
  return `${fitStem(safe || "berrypdf", `${suffix}.pdf`)}${suffix}.pdf`;
}

/** Organize output (spec F4/F5 §6d): "<first source's base name>_organized.pdf". */
export const organizedName = (firstInputName: string | undefined) => suffixedName(firstInputName, "_organized");

/** Alternate & mix output (spec §6e): "<first card's base name>_mixed.pdf". */
export const mixedName = (firstInputName: string | undefined) => suffixedName(firstInputName, "_mixed");

/** Split's ZIP (spec §6a): "<base>-split.zip" for one input, "berrypdf-split.zip" for several. */
export function splitZipName(inputNames: readonly string[]): string {
  const safe = inputNames.length === 1 ? safeFileStem(baseName(inputNames[0])) : "";
  return safe ? `${fitStem(safe, "-split.zip")}-split.zip` : "berrypdf-split.zip";
}

/** Extract's and Delete's ZIPs for several inputs (spec §6b, §6c). */
export const EXTRACT_ZIP = "berrypdf-extract.zip";
export const DELETE_ZIP = "berrypdf-delete.zip";

/** Values for a file-name pattern (spec §3a "File names"). */
export type NameTokens = {
  /** Input file name; its base name fills {name}. */
  input: string;
  /** Page list of the output in source numbers, e.g. "1-4" or "5". */
  pages: string;
  first: number;
  last: number;
  /** Part number within its input (Split). */
  n?: number;
  /** Run date for {date} (YYYYMMDD, local time). */
  date: Date;
};

const pad2 = (n: number) => String(n).padStart(2, "0");

const TOKEN = /\{([a-z]+)\}/gi;
const ELLIPSIS = "…";

/**
 * Fills a pattern ({name}, {pages}, {first}, {last}, {n}, {date}; other
 * text and unknown tokens are kept) and makes it a safe ".pdf" file name.
 * Token names ignore case. An empty result falls back to the input's name.
 * When the name is too long, a {pages} list is cut first, at a whole page
 * with "…" ("1_3_5_…"); the name as a whole is then cut to fit.
 */
export function patternName(pattern: string, t: NameTokens): string {
  const fill = (pages: string) => customName(fillPattern(pattern, { ...t, pages })) ?? pdfOutputName(t.input);
  let name = fill(t.pages);
  const runs = t.pages.split("_");
  if (runs.length > 1 && /\{pages\}/i.test(pattern) && byteLength(fillPattern(pattern, t)) + 4 > MAX_NAME_BYTES) {
    // Keep the most whole runs that fit, then "…" (binary search: a list can hold thousands of runs).
    let lo = 1;
    let hi = runs.length - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (byteLength(fillPattern(pattern, { ...t, pages: `${runs.slice(0, mid).join("_")}_${ELLIPSIS}` })) + 4 <= MAX_NAME_BYTES) lo = mid;
      else hi = mid - 1;
    }
    name = fill(`${runs.slice(0, lo).join("_")}_${ELLIPSIS}`);
  }
  return name;
}

function fillPattern(pattern: string, t: NameTokens): string {
  const values: Record<string, string> = {
    name: baseName(t.input),
    pages: t.pages,
    first: String(t.first),
    last: String(t.last),
    n: t.n === undefined ? "" : String(t.n),
    date: `${t.date.getFullYear()}${pad2(t.date.getMonth() + 1)}${pad2(t.date.getDate())}`,
  };
  return pattern.replace(TOKEN, (whole, key: string) => values[key.toLowerCase()] ?? whole);
}

/**
 * A name the visitor typed (a renamed part): unsafe characters become "-",
 * and ".pdf" is added unless it is there. null when nothing usable is left.
 */
export function customName(typed: string): string | null {
  const stem = safeFileStem(typed.trim().replace(/\.pdf$/i, ""));
  const fitted = stem && fitStem(stem, ".pdf");
  return fitted ? `${fitted}.pdf` : null;
}

/** PDF to image (spec F12 §2): "<base>-<page>.<ext>", the page number zero-padded to the document's page count so files sort in order. */
export function pageImageName(inputName: string, page: number, pageCount: number, ext: string): string {
  const suffix = `-${String(page).padStart(String(pageCount).length, "0")}.${ext}`;
  const safe = safeFileStem(baseName(inputName));
  return `${fitStem(safe || "page", suffix)}${suffix}`;
}

/** "<base><suffix>" for an output that is not a PDF ("report-images.zip", "report.tiff", "report.txt"); the base is cut to fit. */
export function derivedName(inputName: string | undefined, suffix: string): string {
  const safe = safeFileStem(inputName ? baseName(inputName) : "");
  return `${fitStem(safe || "berrypdf", suffix)}${suffix}`;
}
