/**
 * Where a line's runs and words are in its text. The engine counts a ligature (one glyph for
 * "ti" or "ffi") as one character in `start` and `end`, so those drift from the text after one;
 * here each part is found by its own text, in order.
 */
export type Span = { start: number; end: number };

/** Positions of `parts` in `text`, in order; null when a part's text isn't there (the caller keeps the engine's own numbers). */
export function textOffsets(text: string, parts: readonly { text: string }[]): Span[] | null {
  const out: Span[] = [];
  let at = 0;
  for (const p of parts) {
    const i = text.indexOf(p.text, at);
    if (i < 0) return null;
    out.push({ start: i, end: i + p.text.length });
    at = i + p.text.length;
  }
  return out;
}
