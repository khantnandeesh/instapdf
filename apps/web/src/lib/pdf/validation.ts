/** Intake checks that run before any parsing. Pure functions, unit tested. */

export type AcceptSpec = { mime: readonly string[]; extensions: readonly string[] };

export type IntakeLimits = {
  accept: AcceptSpec;
  multiFile: boolean;
  maxFiles: number;
  maxFileBytes: number;
};

export type Rejection = { name: string; reason: "type" | "size" };

export type ScreenResult<F> = {
  accepted: F[];
  rejected: Rejection[];
  /** Files dropped because the task would go past `maxFiles`. */
  overCount: string[];
};

type FileLike = { name: string; size: number; type: string };

export function hasAcceptedType(file: FileLike, accept: AcceptSpec): boolean {
  const name = file.name.toLowerCase();
  const extOk = accept.extensions.some((ext) => name.endsWith(ext.toLowerCase()));
  // The extension decides: browsers often report "" or a generic type, and a
  // forced .txt with an application/pdf MIME is still not something we accept.
  if (extOk) return true;
  return !!file.type && accept.mime.includes(file.type) && !name.includes(".");
}

/** `accept` attribute for the file input, e.g. ".pdf,application/pdf". */
export function acceptAttribute(accept: AcceptSpec): string {
  return [...accept.extensions, ...accept.mime].join(",");
}

/**
 * Splits a batch into accepted files and rejections. Wrong type and too-large
 * files are rejected first, then the file-count cap keeps the first files.
 */
export function screenFiles<F extends FileLike>(files: readonly F[], limits: IntakeLimits, alreadyLoaded: number): ScreenResult<F> {
  const rejected: Rejection[] = [];
  const valid: F[] = [];
  for (const file of files) {
    if (!hasAcceptedType(file, limits.accept)) rejected.push({ name: file.name, reason: "type" });
    else if (file.size > limits.maxFileBytes) rejected.push({ name: file.name, reason: "size" });
    else valid.push(file);
  }
  const cap = limits.multiFile ? limits.maxFiles : 1;
  const room = limits.multiFile ? Math.max(0, cap - alreadyLoaded) : 1;
  const accepted = valid.slice(0, room);
  const overCount = valid.slice(room).map((f) => f.name);
  return { accepted, rejected, overCount };
}

/** True when adding `pages` keeps the task within `maxTotalPages`. */
export function fitsPageBudget(currentPages: number, pages: number, maxTotalPages: number): boolean {
  return currentPages + pages <= maxTotalPages;
}
