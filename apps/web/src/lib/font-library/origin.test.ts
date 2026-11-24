import { describe, expect, it } from "vitest";
import { FONT_LIBRARY_PATHS, fontsOrigin } from "../../../scripts/font-library/origin.mjs";

describe("FONTS_ORIGIN (review follow-up of F24)", () => {
  it("is empty when unset", () => {
    expect(fontsOrigin(undefined)).toBe("");
    expect(fontsOrigin("  ")).toBe("");
  });

  it("takes a Cloud Storage bucket address, without a trailing slash", () => {
    expect(fontsOrigin("https://storage.googleapis.com/my-project-fonts/")).toBe("https://storage.googleapis.com/my-project-fonts");
  });

  it("takes a loopback address for a library built on this machine", () => {
    expect(fontsOrigin("http://localhost:4010")).toBe("http://localhost:4010");
  });

  it.each([
    "https://example.com/fonts",
    "http://storage.googleapis.com/bucket",
    "https://storage.googleapis.com",
    "https://storage.googleapis.com/bucket/sub/path",
    "https://storage.googleapis.com.evil.example/bucket",
    "https://storage.googleapis.com/bucket?x=1",
    "https://user@storage.googleapis.com/bucket",
    "http://localhost.evil.example:80",
  ])("refuses %s", (value) => {
    expect(() => fontsOrigin(value)).toThrow(/FONTS_ORIGIN/);
  });
});

describe("paths passed through to the fonts bucket", () => {
  // Next.js route patterns: ":name(regex)" segments. Turned into one RegExp per pattern here.
  const res = FONT_LIBRARY_PATHS.map((p) => new RegExp(`^${p.source.replace(/:[a-z]+\(((?:[^()]|\((?:[^()]|\([^()]*\))*\))*)\)/g, "($1)").replace(/^manifest\.json$/, "manifest\\.json")}$`));
  const passes = (path: string) => res.some((re) => re.test(path));

  it.each([
    "manifest.json",
    "index/families.e65ab007.json",
    "index/faces.5be5f939.json",
    "index/features.113f037e.bin",
    "index/sig/noto-sans-jp_500_normal.75fe075f.bin",
    "families/noto-sans-devanagari.47540ec1.json",
    "fonts/roboto/latin-ext-400-italic.6cff1211.woff",
    "licences/roboto.txt",
  ])("passes %s", (path) => {
    expect(passes(path)).toBe(true);
  });

  it.each([
    "fonts/../../other-bucket/x.html",
    "fonts/%2e%2e/%2e%2e/other-bucket/x.html",
    "fonts/roboto/../../x.woff",
    "fonts/roboto/evil.html",
    "fonts/roboto/a.6cff1211.woff/extra",
    "index/sig/../../x.bin",
    "licences/../manifest.json",
    "licences/x.html",
    "manifests/20261124T000000Z.json",
    "pkg.tgz",
    "",
  ])("refuses %s", (path) => {
    expect(passes(path)).toBe(false);
  });

  it("has no catch-all", () => {
    for (const p of FONT_LIBRARY_PATHS) expect(p.source).not.toMatch(/:[a-z]+[*+]|:path/);
  });
});
