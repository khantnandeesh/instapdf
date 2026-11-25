/**
 * The editor's side of twins on the page (lib/pdf/twin-display.ts): which of the open file's
 * fonts are only named and have a twin, the twin's font file for each, and the copy of the file
 * that pdf.js draws from. Twin files are fetched only for a file that has such fonts.
 */
import type { PageText } from "@/lib/editor/berry-engine";
import { fileFor, fontUrl } from "@/lib/editor/fonts";
import { ensureFace } from "@/lib/editor/fonts-browser";
import { twinOf } from "@/lib/font-library/twins";
import { woffToSfnt } from "@/lib/font-library/woff";
import { CP1252_EXTRA, buildTwinPatch, withTwinPatch, type NamedFont, type TwinPatch } from "@/lib/pdf/twin-display";
import type { Runtime } from "./controller";

type State = {
  patch: TwinPatch | null;
  key: string;
  fonts: NamedFont[];
  chars: Map<number, Set<number>>;
  /** Every page's text has been read: `chars` is all the file draws. */
  complete: boolean;
  /** The BaseFont each covered font had when it was first covered. */
  names: Record<number, string>;
  /** The newest bytes handed to pdf.js, or about to be (a version being switched to). */
  latest: Uint8Array | null;
  /** Counts versions switched to: a build started before a switch is dropped. */
  epoch: number;
  /** A twin's file did not arrive: asked again the next time a page's text is read. */
  failed: boolean;
  busy: boolean;
  again: boolean;
};
const states = new WeakMap<Runtime, State>();
const stateOf = (rt: Runtime) => {
  let s = states.get(rt);
  if (!s) states.set(rt, (s = { patch: null, key: "", fonts: [], chars: new Map(), complete: false, names: {}, latest: null, epoch: 0, failed: false, busy: false, again: false }));
  return s;
};

/** The update made for a version's bytes and a set of fonts: going back to a version costs no second parse. */
const built = new WeakMap<Uint8Array, { key: string; patch: TwinPatch | null }>();

const files = new Map<string, Promise<{ sfnt: Uint8Array; ranges: [number, number][] } | null>>();
/** The twin's Latin file as a TrueType file, with the characters it has. Fetched once. */
function twinFile(font: NamedFont) {
  const key = `${font.twin}|${font.bold}|${font.italic}`;
  let p = files.get(key);
  if (!p) {
    p = (async () => {
      const face = await ensureFace(font.twin, font.bold, font.italic, "A");
      const entry = fileFor(face, 0x41);
      if (!entry) return null;
      const res = await fetch(fontUrl(entry.file));
      if (!res.ok) return null;
      const sfnt = await woffToSfnt(new Uint8Array(await res.arrayBuffer()));
      return sfnt ? { sfnt, ranges: entry.ranges } : null;
    })().catch(() => null);
    files.set(key, p);
    // A failed fetch is tried again the next time the font is wanted.
    void p.then((f) => !f && files.delete(key));
  }
  return p;
}

/** The named-only fonts with a twin in the pages read so far, and the letters each draws there. */
function wanted(texts: Record<number, PageText>): { fonts: NamedFont[]; chars: Map<number, Set<number>> } {
  const fonts = new Map<number, NamedFont>();
  const chars = new Map<number, Set<number>>();
  for (const page of Object.values(texts)) {
    page.fonts.forEach((f, index) => {
      const twin = f.embedded || f.object == null ? undefined : (twinOf(f.family || f.name) ?? twinOf(f.name));
      if (!twin || f.object == null) return;
      fonts.set(f.object, { object: f.object, twin, bold: f.bold, italic: f.italic });
      const set = chars.get(f.object) ?? new Set<number>();
      chars.set(f.object, set);
      for (const line of page.lines) for (const run of line.runs) if (run.font === index) for (const ch of run.text) set.add(ch.codePointAt(0)!);
    });
  }
  return { fonts: [...fonts.values()].sort((a, b) => a.object - b.object), chars };
}

async function build(rt: Runtime, bytes: Uint8Array): Promise<TwinPatch | null> {
  const s = stateOf(rt);
  if (!s.fonts.length || rt.password || rt.wasEncrypted) return null;
  const key = s.key;
  const had = built.get(bytes);
  if (had?.key === key) return had.patch;
  let failed = false;
  const patch = await buildTwinPatch(
    bytes,
    s.fonts,
    async (font, declared) => {
      const file = await twinFile(font);
      if (!file) {
        failed = true;
        return null;
      }
      // A letter of the font's encoding that this file lacks (Š, ž, ƒ in a Latin slice): the font
      // gets its twin only when it can't draw that letter anywhere in the file (its own widths
      // leave it out, or every page has been read and none uses it). Otherwise it stays as the
      // device draws it, so no letter ever goes missing.
      const lacking = declared.filter((cp) => !file.ranges.some(([lo, hi]) => cp >= lo && cp <= hi));
      const used = s.chars.get(font.object);
      if (lacking.length && !(s.complete && used && !lacking.some((cp) => used.has(cp)))) return null;
      return file.sfnt;
    },
    s.names,
  ).catch(() => null);
  if (failed) s.failed = true;
  else built.set(bytes, { key, patch });
  if (patch) s.names = { ...patch.names, ...s.names };
  return patch;
}

/** The bytes pdf.js is given for a version of the file: with the twins attached, when there are any. */
export function displayBytes(rt: Runtime, bytes: Uint8Array): Uint8Array {
  const shown = withTwinPatch(bytes, stateOf(rt).patch);
  // pdf.js takes the buffer it is given: the editor's own copy is never handed over.
  return shown === bytes ? bytes.slice() : shown;
}

/** How many fonts are drawn in their twins now. */
export const twinCount = (rt: Runtime) => stateOf(rt).patch?.fonts.length ?? 0;

/** Another version of the file is about to be shown (undo, a full rewrite): the update is made for it, since its objects may be numbered differently. */
export async function retwin(rt: Runtime, bytes: Uint8Array): Promise<void> {
  const s = stateOf(rt);
  s.latest = bytes;
  const epoch = ++s.epoch;
  if (!s.fonts.length) return;
  const patch = await build(rt, bytes);
  if (epoch === s.epoch) s.patch = patch;
}

/**
 * Called when a page's text has been read: when it shows named-only fonts that the page does not
 * draw in their twin yet, the update is built and `reopen` draws the pages from the new copy.
 */
export function ensureTwinDisplay(rt: Runtime, texts: Record<number, PageText>, pages: number, shownBytes: () => Uint8Array, reopen: () => Promise<void>): void {
  const s = stateOf(rt);
  const now = wanted(texts);
  const complete = Object.keys(texts).length >= pages;
  const key = `${complete ? "all" : "some"}|` + now.fonts.map((f) => `${f.object}:${f.twin}:${CP1252_EXTRA.filter((cp) => now.chars.get(f.object)?.has(cp)).join(".")}`).join(",");
  if (key === s.key && !s.failed) return;
  s.key = key;
  s.fonts = now.fonts;
  s.chars = now.chars;
  s.complete = complete;
  s.failed = false;
  if (s.busy) {
    s.again = true;
    return;
  }
  s.busy = true;
  void (async () => {
    try {
      do {
        s.again = false;
        const epoch = s.epoch;
        const before = s.patch?.fonts.join(",") ?? "";
        // The version being switched to, when there is one: its own switch draws it.
        const patch = await build(rt, s.latest ?? shownBytes());
        // A version was switched to meanwhile: that switch made the update for its own bytes.
        if (epoch !== s.epoch) continue;
        s.patch = patch;
        if ((patch?.fonts.join(",") ?? "") !== before) await reopen();
      } while (s.again);
    } finally {
      s.busy = false;
    }
  })().catch(() => undefined);
}
