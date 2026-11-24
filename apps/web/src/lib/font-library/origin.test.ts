import { describe, expect, it } from "vitest";
import { fontsOrigin } from "../../../scripts/font-library/origin.mjs";

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
