import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import config from "./ocr.json";
import { isOcrLanguage, languageForLocale, OCR_LANGUAGES, OCR_PATHS } from "./languages";
import { hasText } from "./ocr-run";

const require = createRequire(import.meta.url);

describe("OCR languages", () => {
  it("AC-1545: the browser's language picks ours when we ship it, English otherwise", () => {
    expect(languageForLocale("pt-BR")).toBe("por");
    expect(languageForLocale("hi")).toBe("hin");
    expect(languageForLocale("zh-Hans-CN")).toBe("chi_sim");
    expect(languageForLocale("sv-SE")).toBe("eng");
    expect(languageForLocale(undefined)).toBe("eng");
    expect(isOcrLanguage("fra")).toBe(true);
    expect(isOcrLanguage("xxx")).toBe(false);
  });

  it("AC-1546: every language listed has its data installed at the version named, and everything is served from this site", () => {
    for (const { code } of OCR_LANGUAGES) {
      const dir = dirname(require.resolve(`@tesseract.js-data/${code}/package.json`));
      expect(require(`@tesseract.js-data/${code}/package.json`).version, code).toBe(config.data);
      expect(existsSync(join(dir, "4.0.0_best_int", `${code}.traineddata.gz`)), code).toBe(true);
    }
    expect(require("tesseract.js/package.json").version).toBe(config.engine);
    for (const path of Object.values(OCR_PATHS)) expect(path).toMatch(/^\/ocr\//);
  });

  it("AC-1547: a page number or a stamp on a scan does not count as the page's text", () => {
    expect(hasText("12")).toBe(false);
    expect(hasText("Page 3 of 9")).toBe(false);
    expect(hasText("This page was typed, not scanned.")).toBe(true);
    expect(hasText("यह पृष्ठ टाइप किया गया था")).toBe(true);
  });
});
