/**
 * Finds the library fonts closest to a font inside a PDF (F24). Pure: the caller supplies the
 * matcher module (berry_fontmatch) and the index loaders, so the page's worker and the tests run
 * the same code. Two passes: the 64-byte vectors of every face, then the glyph outlines of the
 * best few.
 */
import type * as Matcher from "../editor/berry-fontmatch";
import type { FontProgram } from "../editor/berry-engine";
import { parseFaceId } from "./client";

/** The characters a document font is asked for (the matcher's alphabet). */
export const MATCH_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/** In words only: never shown as a number. "loose" matches are not offered as close. */
export type Grade = "exact" | "very-close" | "close" | "loose";
const GRADES: Grade[] = ["exact", "very-close", "close", "loose"];
export const GRADE_LABEL: Record<Grade, string> = { exact: "Exact", "very-close": "Very close", close: "Close", loose: "Similar" };

export type FontMatch = {
  /** Index face id, "<family>_<weight>_<style>". */
  face: string;
  /** Library family id. */
  family: string;
  weight: number;
  italic: boolean;
  grade: Grade;
  /** Smaller is closer. Only for ordering. */
  distance: number;
  /** Letters compared outline by outline (0: only the overall measurements were compared). */
  letters: number;
};

export type MatchIndex = { faces: [string, string][]; features: Uint8Array };
export type MatchDeps = {
  matcher: Pick<typeof Matcher, "fingerprintProgram" | "rank" | "compare">;
  index: () => Promise<MatchIndex>;
  signature: (face: string, sig: string) => Promise<Uint8Array>;
};

/** How many faces of the first pass get their outlines compared. */
const SECOND_PASS = 24;

/**
 * The closest library faces to a document font, best first, at most one per family and `top`
 * in all. Empty when the font shows nothing that can be compared.
 */
export async function matchProgram(deps: MatchDeps, program: Pick<FontProgram, "format" | "bytes" | "glyphs">, top = 5): Promise<FontMatch[]> {
  if (!program.glyphs.length) return [];
  const print = deps.matcher.fingerprintProgram(
    program.format,
    program.bytes,
    Uint32Array.from(program.glyphs, (g) => g.cp),
    Uint16Array.from(program.glyphs, (g) => g.gid),
    Float32Array.from(program.glyphs, (g) => g.width),
  );
  const index = await deps.index();
  const ranked = deps.matcher.rank(print.coarse, index.features, SECOND_PASS);
  const found = await Promise.all(
    Array.from({ length: ranked.length / 2 }, async (_, i): Promise<FontMatch | null> => {
      const entry = index.faces[ranked[i * 2]];
      if (!entry) return null;
      const coarse = ranked[i * 2 + 1];
      let glyph = -1;
      let letters = 0;
      let grade = 3;
      try {
        [glyph, letters, grade] = deps.matcher.compare(print.glyphs, await deps.signature(entry[0], entry[1]), coarse);
      } catch {
        // A signature file that did not arrive: this face is left out rather than guessed.
        return null;
      }
      return { face: entry[0], ...parseFaceId(entry[0]), grade: GRADES[grade] ?? "loose", distance: glyph >= 0 ? glyph : 1 + coarse, letters: glyph >= 0 ? letters : 0 };
    }),
  );
  const out: FontMatch[] = [];
  for (const m of found.filter((m): m is FontMatch => !!m).sort((a, b) => a.distance - b.distance)) {
    if (out.some((o) => o.family === m.family)) continue;
    out.push(m);
    if (out.length === top) break;
  }
  return out;
}

/** True for a match good enough to suggest by name. */
export const isClose = (m: FontMatch | undefined): m is FontMatch => !!m && m.grade !== "loose";
