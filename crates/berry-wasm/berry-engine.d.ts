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
 * Two builds share this interface: `berry_engine` (default, smaller) and `berry_engine_shaping`
 * (adds the shaper). The default build reads complex-script lines but marks them read-only with
 * "needs-shaping", and an edit that types such text into any line throws read-only
 * "needs-shaping". Load `berry_engine_shaping` (open the same bytes again) to edit them.
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
  /** False for a subset: some characters may be missing (check with coverage()). */
  complete: boolean;
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
  read_only_reason?:
    | "vertical-text"
    | "unsupported-encoding"
    | "invisible-text"
    | "legacy-font-encoding"
    /** Hindi, Arabic or other complex-script text in the default build: load the shaping build. */
    | "needs-shaping";
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

/** One glyph of shaped text. Lengths in points at the requested size. */
export interface ShapedGlyph {
  gid: number;
  /** UTF-16 index in the text where the glyph's cluster starts. */
  cluster: number;
  advance: number;
  dx: number;
  dy: number;
}

/** Consecutive glyphs of one registered font and direction. */
export interface ShapedRun {
  /** UTF-16 range [start, end) of the text. */
  start: number;
  end: number;
  /** Empty for blanks no registered font draws (they still take a space's width). */
  family: string;
  bold: boolean;
  italic: boolean;
  direction: "ltr" | "rtl";
  /** Points. */
  width: number;
  glyphs: ShapedGlyph[];
}

/** One line of text laid out with the registered fonts. */
export interface ShapedText {
  /** Paragraph direction, from the first strong character. */
  direction: "ltr" | "rtl";
  /** Points. */
  width: number;
  /** Points: the largest ascent and descent of the fonts used (descent is negative). */
  ascent: number;
  descent: number;
  /** Visual order, left to right. */
  runs: ShapedRun[];
}

/** A document font's embedded program, for matching it against the font library (F24). The
 * matching runs in the separate berry_fontmatch module, never in the engine. */
export interface FontProgram {
  /** The embedded program as stored. Empty when format is "none". */
  bytes: Uint8Array;
  /** "truetype": a TrueType or OpenType file. "cff": a bare CFF table. "none": not embedded,
   * Type 1 or Type 3, so only the widths below can be compared. */
  format: "truetype" | "cff" | "none";
  /** False for a subset. */
  complete: boolean;
  /** Each requested character the font draws: its glyph index in `bytes` (0 when format is
   * "none") and its advance in 1/1000 em. */
  glyphs: { cp: number; gid: number; width: number }[];
}

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
  /** The edit failed the engine's own check and was rolled back. `message` is for logs and may
   * quote the file's text: show a message chosen by `reason` instead. */
  | { kind: "verify"; reason: VerifyReason; message: string }
  /** Writing the edited file, or reading it back, failed. Nothing is kept. */
  | { kind: "save"; reason: SaveReason; message: string };

/**
 * Why an edit was rolled back. "text-mismatch": the line would not read back as typed.
 * "position-drift": a glyph would not sit where planned. "glyph-mismatch": a glyph, font or style
 * would change. "overflow": the line would run past the page edge. "overlap": it would run into
 * other text on its baseline (a page number, the next column).
 */
export type VerifyReason = "text-mismatch" | "position-drift" | "glyph-mismatch" | "overflow" | "overlap";

/** Why saving failed: the writer failed, or the output read back differently. */
export type SaveReason = "write-failed" | "prefix-changed" | "reparse-failed" | "object-mismatch" | "page-mismatch" | "text-mismatch";

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
  /** The embedded program of a document font and where it keeps each character of `chars`.
   * Throws bad-font for an unknown object. */
  fontProgram(fontObject: number, chars: string): FontProgram;
  find(page: number, needle: string, matchCase: boolean): Match[];
  /** Sets a line's text. Only the characters that differ are rewritten. */
  replaceLine(page: number, line: number, text: string): EditResult;
  /** Replaces characters [start, end) of a line. */
  replaceRange(page: number, line: number, start: number, end: number, text: string): EditResult;
  /**
   * Lays out one line of new text with the registered fonts. The engine adds the open families
   * of the text's scripts (e.g. "Noto Naskh Arabic") to `font.families` itself. Throws
   * missing-glyphs when no registered font draws a character; the default module throws
   * read-only "needs-shaping" for text that needs the shaping module (Indic, Arabic, Hebrew…).
   */
  shape(text: string, font: FontRequest, size: number): ShapedText;
  /**
   * Draws one line of new text in a content stream of its own. `x, y` is the left end of the
   * baseline in PDF user space (for right alignment pass `right - shape(…).width`), `angle` is
   * in degrees counter-clockwise, `color` is sRGB 0–255. Fonts are embedded as subsets with
   * Unicode mappings. The page is read back and the edit rolled back unless the line reads as
   * typed. Throws as shape() does; call once per line.
   */
  addText(page: number, text: string, font: FontRequest, size: number, x: number, y: number, angle: number,
    color: [number, number, number]): EditResult;
  /** Registers an open-licensed TrueType font (TTF or WOFF 1.0) for characters the original
   * font lacks and for added text. */
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
