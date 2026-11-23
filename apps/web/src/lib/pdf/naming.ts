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
