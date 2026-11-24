/**
 * The matcher end to end, as the browser runs it: the engine reads a font out of a PDF, the
 * berry_fontmatch module fingerprints it, and a library built by scripts/font-library is ranked
 * against it. Uses the WebAssembly files in public/engine and a small library built here.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type * as Engine from "../editor/berry-engine";
import type * as Matcher from "../editor/berry-fontmatch";
import { GRADE_LABEL, MATCH_CHARS, isClose, matchProgram, type MatchDeps } from "./match";

const web = join(__dirname, "../../..");
const engineDir = join(web, "public/engine");
const fixture = (name: string) => new Uint8Array(readFileSync(join(web, "../../tests/parity/editor", name)));

let out = "";
let deps: MatchDeps;
let engine: typeof Engine;
let signatures = 0;

beforeAll(async () => {
  out = mkdtempSync(join(tmpdir(), "fontlib-"));
  execFileSync(process.execPath, ["--no-warnings", join(web, "scripts/font-library/build-library.mjs"), "--out", out, "--subsets", "latin", "--weights", "400,700", "--families", "tinos,arimo,cousine,carlito,caladea,noto-sans"], { stdio: "pipe" });
  const matcher = (await import(/* @vite-ignore */ pathToFileURL(join(engineDir, "berry_fontmatch.js")).href)) as typeof Matcher;
  matcher.initSync(readFileSync(join(engineDir, "berry_fontmatch_bg.wasm")));
  engine = (await import(/* @vite-ignore */ pathToFileURL(join(engineDir, "berry_engine.js")).href)) as typeof Engine;
  engine.initSync(readFileSync(join(engineDir, "berry_engine_bg.wasm")));
  const manifest = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8")) as { faces: string; features: string };
  const index = { faces: JSON.parse(readFileSync(join(out, manifest.faces), "utf8")) as [string, string][], features: new Uint8Array(readFileSync(join(out, manifest.features))) };
  deps = {
    matcher,
    index: async () => index,
    signature: async (face, sig) => {
      signatures++;
      return new Uint8Array(readFileSync(join(out, `index/sig/${face}.${sig}.bin`)));
    },
  };
}, 60_000);
afterAll(() => out && rmSync(out, { recursive: true, force: true }));

function programOf(file: string, name: RegExp) {
  const doc = new engine.BerryDocument(fixture(file));
  const font = doc.fonts().find((f) => name.test(f.name));
  if (!font || font.object == null) throw new Error(`no font ${name} in ${file}`);
  const program = doc.fontProgram(font.object, MATCH_CHARS);
  doc.free();
  return { font, program };
}

describe("matching a PDF's font against the library (F24)", () => {
  it("AC-281: a subset of Liberation Serif finds its open twin Tinos first, and close", async () => {
    const { font, program } = programOf("font-coverage-1p.pdf", /^LiberationSerif$/);
    expect(font.complete).toBe(false);
    const matches = await matchProgram(deps, program);
    expect(matches[0].family).toBe("tinos");
    expect(matches[0].weight).toBe(400);
    expect(["exact", "very-close"]).toContain(matches[0].grade);
    expect(isClose(matches[0])).toBe(true);
    expect(matches[0].letters).toBeGreaterThan(5);
    // One row a family, best first.
    expect(new Set(matches.map((m) => m.family)).size).toBe(matches.length);
    expect([...matches].sort((a, b) => a.distance - b.distance)).toEqual(matches);
  });

  it("the bold face matches the bold of the family", async () => {
    const { program } = programOf("font-coverage-1p.pdf", /^LiberationSerif-Bold$/);
    const [best] = await matchProgram(deps, program);
    expect(best).toMatchObject({ family: "tinos", weight: 700, italic: false });
  });

  it("AC-282: a font the library does not have is never called exact", async () => {
    const { program } = programOf("font-coverage-1p.pdf", /JetBrainsMono/);
    const matches = await matchProgram(deps, program);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.every((m) => m.grade !== "exact")).toBe(true);
    // The closest we have for a monospaced font is the monospaced family.
    expect(matches[0].family).toBe("cousine");
  });

  it("a font that is not embedded is still ranked, from its widths", async () => {
    const { program } = programOf("std14-reportlab.pdf", /^Helvetica$/);
    expect(program.format).toBe("none");
    const matches = await matchProgram(deps, program);
    expect(matches[0]?.family).toBe("arimo");
    expect(matches[0].letters).toBe(0);
  });

  it("nothing to compare gives no match, and no index is read", async () => {
    signatures = 0;
    expect(await matchProgram(deps, { format: "none", bytes: new Uint8Array(), glyphs: [] })).toEqual([]);
    expect(signatures).toBe(0);
  });

  it("a signature that does not arrive leaves that face out instead of guessing", async () => {
    const { program } = programOf("font-coverage-1p.pdf", /^LiberationSerif$/);
    const flaky: MatchDeps = { ...deps, signature: async (face, sig) => (face.startsWith("tinos_") ? Promise.reject(new Error("offline")) : deps.signature(face, sig)) };
    const matches = await matchProgram(flaky, program);
    expect(matches.some((m) => m.family === "tinos")).toBe(false);
  });

  it("closeness is said in words, never as a number", () => {
    expect(Object.values(GRADE_LABEL)).toEqual(["Exact", "Very close", "Close", "Similar"]);
    for (const label of Object.values(GRADE_LABEL)) expect(label).not.toMatch(/[0-9%]/);
  });
});
