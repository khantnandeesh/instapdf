/**
 * Draws added Hindi, Arabic and other complex-script lines with the shaping engine (AC-224), in
 * the download worker. Loaded (with the engine and the script fonts) only when a text box holds
 * such text; Latin-only downloads never fetch any of it.
 *
 * Flow: register fonts in a scratch document (a blank page) to measure lines with shape(), let
 * buildPdf lay out and skip them (DeferShaped), then open the built bytes in the engine, call
 * addText once per line and save.
 */
import type { BerryDocument, FontRequest } from "./berry-engine";
import { blankPdf } from "./blank";
import type { DeferShaped } from "./build";
import { faceOf, filesFor, TEXT_FONTS, type EditorFontManifest } from "./fonts";
import { printable, shapingFontsFor, type ShapedLine, type ShapingManifest } from "./shaping";

export type ShapingEngine = { BerryDocument: new (bytes: Uint8Array, password?: string | null) => BerryDocument };

export type ShapingDeps = {
  engine: () => Promise<ShapingEngine>;
  editorManifest: () => Promise<EditorFontManifest>;
  shapingManifest: () => Promise<ShapingManifest>;
  /** Editor face file (by name) and shaping font (by URL) bytes. */
  loadFace: (file: string) => Promise<Uint8Array>;
  loadUrl: (url: string) => Promise<Uint8Array>;
};

/** The family name a face is registered under: its label, e.g. "Arimo". */
export const familyOf = (id: string) => TEXT_FONTS.find((f) => f.id === id)?.label ?? "Arimo";

type Style = { font: string; bold: boolean; italic: boolean };

/** Registers fonts on documents, each file read once. */
class Fonts {
  private cache = new Map<string, Promise<Uint8Array>>();
  constructor(
    private deps: ShapingDeps,
    private editor: EditorFontManifest,
    readonly shaping: ShapingManifest,
  ) {}

  private get(key: string, load: () => Promise<Uint8Array>) {
    let p = this.cache.get(key);
    if (!p) this.cache.set(key, (p = load()));
    return p;
  }

  face(s: Style) {
    const face = faceOf(this.editor, s.font, s.bold, s.italic);
    if (!face) throw new Error(`No font ${s.font}`);
    return face;
  }

  /** Adds what `text` in style `s` needs: the box's face files, then the script fonts (in that style, so the engine finds them). */
  async register(doc: BerryDocument, s: Style, text: string, done: Set<string>) {
    const face = this.face(s);
    const family = familyOf(s.font);
    for (const file of filesFor(face, text)) {
      const key = `${family}|${s.bold}|${s.italic}|${file}`;
      if (done.has(key)) continue;
      done.add(key);
      doc.addFont(family, s.bold, s.italic, await this.get(file, () => this.deps.loadFace(file)));
    }
    for (const f of shapingFontsFor(this.shaping, text)) {
      const key = `${f.family}|${s.bold}|${s.italic}|${f.url}`;
      if (done.has(key)) continue;
      done.add(key);
      doc.addFont(f.family, s.bold, s.italic, await this.get(f.url, () => this.deps.loadUrl(f.url)));
    }
  }
}

const request = (families: string[], bold: boolean, italic: boolean): FontRequest => ({ families, bold, italic });

/**
 * Builds with complex-script lines drawn by the shaping engine. `build` is buildPdf with the
 * DeferShaped hook; returns its bytes when no line needed shaping.
 */
export async function buildShaped(deps: ShapingDeps, build: (defer: DeferShaped) => Promise<Uint8Array>, password?: string): Promise<Uint8Array> {
  const [engine, editor, shaping] = await Promise.all([deps.engine(), deps.editorManifest(), deps.shapingManifest()]);
  const fonts = new Fonts(deps, editor, shaping);
  const scratch = new engine.BerryDocument(blankPdf());
  const scratchFonts = new Set<string>();
  try {
    const defer: DeferShaped = {
      family: familyOf,
      lines: [],
      measure: async (text, o) => {
        const line = printable(text, fonts.face(o), shaping);
        await fonts.register(scratch, o, line, scratchFonts);
        return scratch.shape(line, request([familyOf(o.font), "Noto Sans"], o.bold, o.italic), o.size).width;
      },
    };
    const built = await build(defer);
    if (!defer.lines.length) return built;
    const doc = new engine.BerryDocument(built, password ?? null);
    try {
      const done = new Set<string>();
      for (const line of defer.lines) await addLine(doc, fonts, line, done);
      return doc.save().bytes;
    } finally {
      doc.free();
    }
  } finally {
    scratch.free();
  }
}

async function addLine(doc: BerryDocument, fonts: Fonts, line: ShapedLine, done: Set<string>) {
  const text = printable(line.text, fonts.face(line), fonts.shaping);
  await fonts.register(doc, line, text, done);
  doc.addText(line.page, text, request(line.families, line.bold, line.italic), line.size, line.x, line.y, line.angle, line.color);
}
