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

/** Keeps the original name, making sure it ends in `.pdf`. */
export function pdfOutputName(inputName: string): string {
  const only = fileNameOnly(inputName);
  return /\.pdf$/i.test(only) ? only : `${baseName(only)}.pdf`;
}

/** "berrypdf-<tool>.zip", with the tool slug's trailing "-pdf" removed. */
export function zipName(toolSlug: string): string {
  return `berrypdf-${toolSlug.replace(/-pdf$/, "")}.zip`;
}

/**
 * Makes ZIP entry names unique, case-insensitively (Windows and macOS file
 * systems are), by adding " (2)", " (3)"... before the extension.
 */
export function uniqueNames(names: readonly string[]): string[] {
  const used = new Set<string>();
  return names.map((raw) => {
    const name = fileNameOnly(raw);
    if (!used.has(name.toLowerCase())) {
      used.add(name.toLowerCase());
      return name;
    }
    const dot = name.lastIndexOf(".");
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : "";
    for (let n = 2; ; n++) {
      const candidate = `${stem} (${n})${ext}`;
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
  return stem.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/^[\s.]+|[\s.]+$/g, "");
}

/** "<base><suffix>.pdf" from the first input's name ("berrypdf" when there is none). */
function suffixedName(firstInputName: string | undefined, suffix: string): string {
  const safe = safeFileStem(firstInputName ? baseName(firstInputName) : "");
  return `${safe || "berrypdf"}${suffix}.pdf`;
}

/** Organize output (spec F4/F5 §6d): "<first source's base name>_organized.pdf". */
export const organizedName = (firstInputName: string | undefined) => suffixedName(firstInputName, "_organized");

/** Alternate & mix output (spec §6e): "<first card's base name>_mixed.pdf". */
export const mixedName = (firstInputName: string | undefined) => suffixedName(firstInputName, "_mixed");

/** Split's ZIP (spec §6a): "<base>-split.zip" for one input, "berrypdf-split.zip" for several. */
export function splitZipName(inputNames: readonly string[]): string {
  const safe = inputNames.length === 1 ? safeFileStem(baseName(inputNames[0])) : "";
  return safe ? `${safe}-split.zip` : "berrypdf-split.zip";
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

/**
 * Fills a pattern ({name}, {pages}, {first}, {last}, {n}, {date}; other
 * text and unknown tokens are kept) and makes it a safe ".pdf" file name.
 * Token names ignore case. An empty result falls back to the input's name.
 */
export function patternName(pattern: string, t: NameTokens): string {
  const values: Record<string, string> = {
    name: baseName(t.input),
    pages: t.pages,
    first: String(t.first),
    last: String(t.last),
    n: t.n === undefined ? "" : String(t.n),
    date: `${t.date.getFullYear()}${pad2(t.date.getMonth() + 1)}${pad2(t.date.getDate())}`,
  };
  const filled = pattern.replace(/\{([a-z]+)\}/gi, (whole, key: string) => values[key.toLowerCase()] ?? whole);
  return customName(filled) ?? pdfOutputName(t.input);
}

/**
 * A name the visitor typed (a renamed part): unsafe characters become "-",
 * and ".pdf" is added unless it is there. null when nothing usable is left.
 */
export function customName(typed: string): string | null {
  const stem = safeFileStem(typed.trim().replace(/\.pdf$/i, ""));
  return stem ? `${stem}.pdf` : null;
}
