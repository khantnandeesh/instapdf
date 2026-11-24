/**
 * BerryPDF font matcher: the interface the editor calls (F24).
 *
 * The same Rust code builds the font library's index, so a font inside a PDF and a font in the
 * library are measured identically. Load this module only when a match is needed.
 */

/** A font's look. `coarse` is 64 bytes compared against the library index; `glyphs` holds a
 * 36-byte record per character measured (code point, then a 32-byte shape signature). */
export interface Fingerprint { coarse: Uint8Array; glyphs: Uint8Array; count: number }

/** Fingerprint of a TrueType or OpenType file (a user's own font, or a library font). `chars`
 * adds characters beyond the Latin letters and digits. Null when the bytes are not a font. */
export function fingerprintFile(bytes: Uint8Array, chars?: string | null): Fingerprint | null;

/** Fingerprint of a document font from the engine's fontProgram(): parallel arrays of character,
 * glyph index and advance. Uses the widths alone when the program cannot be read. */
export function fingerprintProgram(format: string, bytes: Uint8Array, cps: Uint32Array, gids: Uint16Array, widths: Float32Array): Fingerprint;

/** The `top` faces of an index (64 bytes a face) closest to `coarse`, best first, as
 * [face, distance, face, distance…]. `allow` has one byte a face; 0 leaves the face out. */
export function rank(coarse: Uint8Array, index: Uint8Array, top: number, allow?: Uint8Array | null): Float32Array;

/** Glyph-by-glyph comparison of two fingerprints' `glyphs`: [distance or -1 when no character is
 * shared, characters compared, grade], grade 0 = exact, 1 = very close, 2 = close, 3 = loose. */
export function compare(a: Uint8Array, b: Uint8Array, coarseDistance: number): Float32Array;

/** Distance of two coarse vectors, 0 to 1, or -1 when they share too little to compare. */
export function coarseDistance(a: Uint8Array, b: Uint8Array): number;

export default function init(moduleOrPath?: RequestInfo | URL | Response | BufferSource | WebAssembly.Module): Promise<unknown>;
export function initSync(module: BufferSource | WebAssembly.Module): unknown;
