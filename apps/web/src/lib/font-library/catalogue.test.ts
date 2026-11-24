import { describe, expect, it } from "vitest";
import { buildCatalogue, canonicalLicence, faces, familyKey, gate, summarise } from "../../../scripts/font-library/lib.mjs";

const roboto = {
  id: "roboto",
  family: "Roboto",
  subsets: ["latin", "cyrillic"],
  weights: [700, 400, 400],
  styles: ["italic", "normal"],
  lastModified: "2026-02-19",
  category: "sans-serif",
  license: "OFL-1.1",
  version: "v51",
};

describe("licence gate (AC-270)", () => {
  it("accepts the open licences, whatever the letter case", () => {
    expect(canonicalLicence("OFL-1.1")).toBe("OFL-1.1");
    expect(canonicalLicence("apache-2.0")).toBe("Apache-2.0");
    expect(canonicalLicence(" mit ")).toBe("MIT");
    expect(canonicalLicence("UFL-1.0")).toBe("UFL-1.0");
  });

  it("refuses anything else, including a missing licence", () => {
    for (const l of ["GPL-3.0", "AGPL-3.0", "proprietary", "free for personal use", "", undefined, null, 7]) {
      expect(canonicalLicence(l as string)).toBeNull();
    }
    expect(gate({ ...roboto, license: "GPL-2.0" }, "x")).toEqual({ ok: false, reason: "licence:GPL-2.0" });
    expect(gate({ ...roboto, license: undefined }, "x")).toEqual({ ok: false, reason: "licence:missing" });
  });

  it("refuses icon fonts, bad ids and entries without faces", () => {
    expect(gate({ ...roboto, category: "icons" }, "x")).toEqual({ ok: false, reason: "icon-font" });
    expect(gate({ ...roboto, id: "../roboto" }, "x")).toEqual({ ok: false, reason: "bad-id" });
    expect(gate({ ...roboto, weights: [] }, "x")).toEqual({ ok: false, reason: "no-faces" });
    expect(gate(null as never, "x")).toEqual({ ok: false, reason: "not-an-entry" });
  });

  it("keeps licence, source and version on the entry (AC-271)", () => {
    const r = gate(roboto, "fontsource");
    expect(r.ok && r.entry).toEqual({
      id: "roboto",
      family: "Roboto",
      key: "roboto",
      licence: "OFL-1.1",
      category: "sans-serif",
      subsets: ["cyrillic", "latin"],
      weights: [400, 700],
      styles: ["normal", "italic"],
      modified: "2026-02-19",
      version: "v51",
      source: "fontsource",
    });
  });
});

describe("de-duplication (AC-272)", () => {
  it("matches family names across spelling differences", () => {
    expect(familyKey("Noto Sans")).toBe(familyKey("NotoSans"));
    expect(familyKey("IBM Plex Sans")).toBe("ibmplexsans");
    expect(familyKey("Bài Jamjuree")).toBe(familyKey("Bai Jamjuree"));
  });

  it("keeps the newest copy of a family and reports the other", () => {
    const older = { ...roboto, id: "roboto-old", family: "ROBOTO", lastModified: "2024-01-01" };
    const { families, rejected } = buildCatalogue([
      { source: "a", entries: [older, { ...roboto, id: "bad", license: "GPL-3.0", family: "Bad" }] },
      { source: "b", entries: [roboto] },
    ]);
    expect(families.map((f) => f.id)).toEqual(["roboto"]);
    expect(rejected).toEqual([
      { id: "bad", family: "Bad", source: "a", reason: "licence:GPL-3.0" },
      { id: "roboto-old", family: "Roboto", source: "b", reason: "duplicate" },
    ]);
  });

  it("counts faces and rejections", () => {
    const result = buildCatalogue([{ source: "a", entries: [roboto, { ...roboto, id: "x", family: "X", license: "nope" }] }]);
    expect(faces(result.families[0])).toHaveLength(4);
    expect(summarise(result)).toMatchObject({ families: 1, faces: 4, licences: { "OFL-1.1": 1 }, rejected: { "licence:nope": 1 } });
  });
});
