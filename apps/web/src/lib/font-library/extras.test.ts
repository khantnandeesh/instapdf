import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { EXTRAS, extraSource, pinned, rangesToCss } from "../../../scripts/font-library/extras.mjs";
import { canonicalLicence, parseUnicodeRange } from "../../../scripts/font-library/lib.mjs";
import { cmapRanges, woffToSfnt } from "../../../scripts/font-library/sfnt.mjs";

const require = createRequire(import.meta.url);
const arimo = readFileSync(join(dirname(require.resolve("@fontsource/arimo/package.json")), "files", "arimo-latin-400-normal.woff"));
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

describe("pinned families outside the catalogues", () => {
  it("every one names an open licence, a version and checksums for all it downloads", () => {
    for (const e of EXTRAS) {
      expect(canonicalLicence(e.license)).not.toBeNull();
      expect(e.version).toMatch(/\d/);
      expect(e.archive.url.startsWith("https://github.com/")).toBe(true);
      for (const pin of [e.archive, e.licenceText, ...Object.values(e.faces)]) expect(pin.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("Segoe UI's twin comes from Microsoft's own release, pinned to 1.01", () => {
    const selawik = EXTRAS.find((e) => e.id === "selawik")!;
    expect(selawik.archive.url).toBe("https://github.com/microsoft/Selawik/releases/download/1.01/Selawik_Release.zip");
    expect(selawik.license).toBe("OFL-1.1");
    expect(Object.keys(selawik.faces)).toEqual(["300-normal", "400-normal", "600-normal", "700-normal"]);
  });

  it("refuses bytes that are not the pinned ones", () => {
    const bytes = Buffer.from("font");
    expect(pinned(bytes, sha(bytes), "x")).toBe(bytes);
    expect(() => pinned(Buffer.from("other"), sha(bytes), "the archive")).toThrow("the archive does not match its pinned checksum");
    expect(() => pinned(null, sha(bytes), "the archive")).toThrow();
  });

  it("builds a source whose one file lists the characters the font has", async () => {
    const archive = Buffer.from("archive");
    const licence = Buffer.from("SIL Open Font License");
    const extra = {
      ...EXTRAS[0],
      archive: { url: "https://github.com/a/b.zip", sha256: sha(archive) },
      licenceText: { url: "https://raw.githubusercontent.com/a/LICENSE.txt", sha256: sha(licence) },
      faces: { "400-normal": { file: "a.woff", sha256: sha(arimo) } },
    };
    const asked: string[] = [];
    const get = async (url: string) => (asked.push(url), url.endsWith(".zip") ? archive : licence);
    const src = extraSource(extra, get, async () => arimo);
    expect(src.entry).toMatchObject({ id: "selawik", licence: "OFL-1.1", subsets: ["latin"], weights: [400], styles: ["normal"], version: "1.01", source: "microsoft/Selawik" });
    expect(await src.prepare()).toBe(true);
    expect(asked).toEqual([extra.archive.url, extra.licenceText.url]);
    expect(await src.read("latin", 400, "normal")).toBe(arimo);
    expect(await src.read("latin", 700, "normal")).toBeNull();
    expect(await src.read("greek", 400, "normal")).toBeNull();
    const ranges = parseUnicodeRange(src.unicode.latin);
    expect(ranges.some(([lo, hi]) => lo <= 0x41 && hi >= 0x7a)).toBe(true);
    expect(await src.licence()).toMatch(/^Selawik 1\.01, as released at https:\/\/github\.com\/microsoft\/Selawik\/releases\/tag\/1\.01\n\nSIL Open Font License$/);
    expect(src.origin).toEqual({ name: "microsoft/Selawik", version: "1.01", url: "https://github.com/microsoft/Selawik/releases/tag/1.01" });
  });

  it("stops when a file in the archive is not the pinned one", async () => {
    const archive = Buffer.from("archive");
    const extra = { ...EXTRAS[0], archive: { url: "https://github.com/a/b.zip", sha256: sha(archive) } };
    await expect(extraSource(extra, async () => archive, async () => arimo).prepare()).rejects.toThrow("does not match its pinned checksum");
  });
});

describe("characters a font has", () => {
  it("reads sorted, merged ranges from the cmap", () => {
    const ranges = cmapRanges(woffToSfnt(arimo)!);
    expect(ranges.length).toBeGreaterThan(3);
    expect(ranges.some(([lo, hi]) => lo <= 0x20 && hi >= 0x7e)).toBe(true);
    for (let i = 1; i < ranges.length; i++) expect(ranges[i][0]).toBeGreaterThan(ranges[i - 1][1] + 1);
    expect(cmapRanges(Buffer.from("not a font"))).toEqual([]);
  });

  it("reads a format 12 table, and gives nothing for a table that does not add up", () => {
    const font = (sub: Buffer) => {
      const cmap = Buffer.concat([Buffer.from([0, 0, 0, 1, 0, 3, 0, 10, 0, 0, 0, 12]), sub]);
      const head = Buffer.alloc(28);
      head.writeUInt32BE(0x00010000, 0);
      head.writeUInt16BE(1, 4);
      head.write("cmap", 12, "latin1");
      head.writeUInt32BE(28, 20);
      head.writeUInt32BE(cmap.length, 24);
      return Buffer.concat([head, cmap]);
    };
    const f12 = Buffer.alloc(16 + 24);
    f12.writeUInt16BE(12, 0);
    f12.writeUInt32BE(2, 12);
    [0x1f600, 0x1f64f, 1, 0x41, 0x5a, 2].forEach((v, i) => f12.writeUInt32BE(v, 16 + i * 4));
    expect(cmapRanges(font(f12))).toEqual([[0x41, 0x5a], [0x1f600, 0x1f64f]]);
    const f4 = Buffer.alloc(32);
    f4.writeUInt16BE(4, 0);
    f4.writeUInt16BE(3, 6); // an odd doubled segment count
    expect(cmapRanges(font(f4))).toEqual([]);
    expect(cmapRanges(font(f12.subarray(0, 30)))).toEqual([]);
  });

  it("writes ranges the way the manifest reader takes them", () => {
    expect(rangesToCss([[32, 126], [305, 305]])).toBe("U+20-7e,U+131");
    expect(parseUnicodeRange(rangesToCss([[32, 126], [305, 305]]))).toEqual([[32, 126], [305, 305]]);
  });
});
