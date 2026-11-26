/** Which file names are pictures (spec F3 §2). Tiny and import-free: the shared flow checks every pick. */
export type ImageFormat = "png" | "jpeg" | "gif" | "bmp" | "webp" | "tiff";

const IMAGE_EXTENSIONS: Record<string, ImageFormat> = {
  ".png": "png",
  ".jpg": "jpeg",
  ".jpeg": "jpeg",
  ".gif": "gif",
  ".bmp": "bmp",
  ".webp": "webp",
  ".tif": "tiff",
  ".tiff": "tiff",
};

/** Image format implied by a file name, or null for anything else (PDFs included). */
export function imageFormatOfName(name: string): ImageFormat | null {
  const lower = name.toLowerCase();
  const dot = lower.lastIndexOf(".");
  return dot >= 0 ? (IMAGE_EXTENSIONS[lower.slice(dot)] ?? null) : null;
}
