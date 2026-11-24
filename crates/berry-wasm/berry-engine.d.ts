/**
 * BerryPDF edit engine: the interface the editor UI calls.
 *
 * The engine is the same Rust code in the browser (WebAssembly, in a Web Worker) and on the
 * server fallback. Load the module only after the editor has a file (AC-51).
 *
 * Coordinates are PDF user space: points, origin at the bottom-left of the unrotated page,
 * y up. Use `PageText.page_box` and `rotation` (or the pdf.js viewport) to map to the screen.
 * Errors are thrown as `BerryError` objects. A bug that panics instead aborts the module
 * (built with `panic = "abort"`): it surfaces as a `WebAssembly.RuntimeError`, after which
 * the instance is unusable and the worker must load the module again.
 *
 * Pages and lines are zero-based. Line ids are only valid until the next edit on that page:
 * every edit returns the page's fresh text.
 *
 * Complex scripts (Devanagari and the other Indic scripts, Arabic, Hebrew): line text is in
 * logical (reading) order, whatever order the file stores it in. Edits in a line with such text
 * rewrite whole words, shaped by the engine, so typing inside a word re-shapes the word.
 * Right-to-left lines keep their right edge; `shift` is then negative when the text grows.
 *
 * Not in this version (planned): add text and other objects, style changes on existing text,
 * move and delete, paragraph reflow. Phase E1 tools keep using pdf-lib.
 */

export interface Rect { x0: number; y0: number; x1: number; y1: number }

export interface FontInfo {
  /** PostScript name without the subset prefix, e.g. "Carlito-Bold". */
  name: string;
  /** Family part of the name, e.g. "Carlito". Style is in bold and italic. */
  family: string;
  kind: "type1" | "truetype" | "type0" | "type3";
  embedded: boolean;
  subset: boolean;
  bold: boolean;
  italic: boolean;
  serif: boolean;
  monospace: boolean;
  /** PDF object number of the font, when it has one. */
  object: number | null;
  /** Open font families that can stand in for this font, best first. */
  stand_ins: string[];
}

/** Consecutive characters of a line in one font, size and colour. */
export interface Run {
  /** Character range [start, end) in the line's text. */
  start: number;
  end: number;
  text: string;
  /** Index into PageText.fonts. */
  font: number;
  /** Font size in points. */
  size: number;
  /** Fill colour, sRGB 0–255. */
  color: [number, number, number];
  bbox: Rect;
}

export interface Word { start: number; end: number; text: string; bbox: Rect }

/** The unit of an edit: text on one baseline without a column-sized gap. */
export interface Line {
  id: number;
  text: string;
  bbox: Rect;
  /** Baseline start. */
  origin: [number, number];
  /** Baseline direction in degrees, 0 = left to right. */
  angle: number;
  size: number;
  /** Reading direction: "rtl" for Arabic and Hebrew lines. Align and place the caret by it. */
  direction: "ltr" | "rtl";
  runs: Run[];
  words: Word[];
  editable: boolean;
  /** Why the line is not editable. "legacy-font-encoding": a pre-Unicode Hindi font (Kruti Dev
   * and similar) that draws Devanagari from Latin codes, so the file holds no real text. */
  read_only_reason?: "vertical-text" | "unsupported-encoding" | "invisible-text" | "legacy-font-encoding";
  /** Index into PageText.paragraphs. */
  paragraph: number;
}

export interface Paragraph { lines: number[]; bbox: Rect }

export interface PageText {
  page: number;
  /** [x0, y0, x1, y1] of the visible page. */
  page_box: [number, number, number, number];
  /** Clockwise page rotation: 0, 90, 180 or 270. */
  rotation: number;
  fonts: FontInfo[];
  lines: Line[];
  paragraphs: Paragraph[];
}

export interface Substitution {
  /** The characters the original font could not draw. */
  chars: string;
  original_font: string;
  substitute_font: string;
  /** True when the substitute is the same family as the original (no visible change). */
  same_family: boolean;
}

export interface EditResult {
  page: PageText;
  /** Regions whose pixels may have changed. Everything outside is identical to before. */
  changed: Rect[];
  /** Show an inline notice when this has an entry with same_family false (AC-11). */
  substitutions: Substitution[];
  /** How far the rest of the line moved along its baseline, in points. */
  shift: number;
}

/** Which characters of a string a font can draw (AC-59). Each character is listed once. */
export interface Coverage { covered: string; missing: string }

export interface Match { page: number; line: number; start: number; end: number }

export interface SaveReport {
  bytes_before: number;
  bytes_after: number;
  objects_written: number;
  /** The original file is an untouched prefix of the output. */
  original_preserved: boolean;
  /** Objects read back from the output and found equal to the engine's copy. */
  objects_verified: number;
  pages_edited: number[];
}

/** Families best first: the original family, then (for Hindi, Arabic and other scripts) the
 * script's open family, e.g. "Noto Sans Devanagari" or "Noto Naskh Arabic", then Latin stand-ins. */
export interface FontRequest { families: string[]; bold: boolean; italic: boolean }

/** What every method throws. Nothing is changed when an edit throws. */
export type BerryError =
  | { kind: "parse"; message: string }
  | { kind: "encrypted" }
  | { kind: "bad-page" }
  | { kind: "bad-line" }
  | { kind: "bad-font" }
  | { kind: "read-only"; reason: string }
  /** Fetch one of request.families, call addFont, then retry the edit. */
  | { kind: "missing-glyphs"; chars: string; request: FontRequest }
  | { kind: "unsupported"; reason: string }
  /** The edit failed the engine's own check and was rolled back. */
  | { kind: "verify"; message: string }
  | { kind: "save"; message: string };

export class BerryDocument {
  /** Opens a PDF. Throws { kind: "encrypted" } when a password is needed. */
  constructor(bytes: Uint8Array, password?: string | null);
  readonly pageCount: number;
  /** Lines (with runs, words, fonts, positions) and paragraphs of a page. */
  pageText(page: number): PageText;
  /** Every font in the document, once each (use FontInfo.object as its stable id). */
  fonts(): FontInfo[];
  /**
   * Which characters of `text` the font with this object number can draw, checked against the
   * embedded font program. Blank characters count as covered.
   */
  coverage(fontObject: number, text: string): Coverage;
  find(page: number, needle: string, matchCase: boolean): Match[];
  /** Sets a line's text. Only the characters that differ are rewritten. */
  replaceLine(page: number, line: number, text: string): EditResult;
  /** Replaces characters [start, end) of a line. */
  replaceRange(page: number, line: number, start: number, end: number, text: string): EditResult;
  /** Registers an open-licensed TrueType font for characters the original font lacks. */
  addFont(family: string, bold: boolean, italic: boolean, bytes: Uint8Array): boolean;
  /**
   * Returns the original bytes plus one appended revision, after reading the result back and
   * checking it. For a pixel check, render before and after and compare outside
   * EditResult.changed.
   */
  save(): { bytes: Uint8Array; report: SaveReport };
  free(): void;
}

/** Instantiates the WebAssembly module. Call once, in the worker, before anything else. */
export default function init(moduleOrPath?: RequestInfo | URL | Response | BufferSource | WebAssembly.Module): Promise<unknown>;
export function initSync(module: BufferSource | WebAssembly.Module): unknown;
