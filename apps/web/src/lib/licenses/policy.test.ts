import { describe, expect, it } from "vitest";
import { FONT_LICENCES } from "../../../scripts/font-library/lib.mjs";
import {
  ALLOWED_CODE,
  ALLOWED_LIBRARY_FONT,
  copyrightLines,
  EXCEPTIONS,
  findViolations,
  isAllowedExpression,
  isFontOnlyPackage,
  licenseExpression,
} from "../../../scripts/license-policy.mjs";

type Kind = "package" | "font" | "asset";
const pkg = (name: string, license: string | null, kind: Kind = "package") => ({ name, version: "1.0.0", license, kind });

describe("copyrightLines on the SIL OFL 1.1 text", () => {
  it("keeps the real notice and drops the license's template lines", () => {
    const ofl = [
      "Copyright 2020 Braille Institute of America, Inc.",
      "copyright statement(s).",
      "Copyright Holder. This restriction only applies to the primary font name as",
      "Copyright Holder(s) and the Author(s) or with their explicit written",
      "COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,",
    ].join("\n");
    expect(copyrightLines(ofl)).toEqual(["Copyright 2020 Braille Institute of America, Inc."]);
  });
});

describe("isFontOnlyPackage", () => {
  it("treats a Fontsource package with only CSS and font files as a font", () => {
    const files = ["LICENSE", "README.md", "CHANGELOG.md", "package.json", "metadata.json", "index.css", "index.d.css.ts", "400.css", "scss/mixins.scss", "files/atkinson-hyperlegible-latin-400-normal.woff2", "files/atkinson-hyperlegible-latin-400-normal.woff"];
    expect(isFontOnlyPackage("@fontsource/atkinson-hyperlegible", files, { name: "@fontsource/atkinson-hyperlegible" })).toBe(true);
    expect(isFontOnlyPackage("@fontsource-variable/inter", ["LICENSE", "index.css", "files/inter.ttf", "files/inter.otf"])).toBe(true);
  });

  it("refuses look-alike names and font packages that ship JavaScript", () => {
    expect(isFontOnlyPackage("fontsource-helper", ["index.css"])).toBe(false);
    expect(isFontOnlyPackage("@fontsourcex/foo", ["index.css"])).toBe(false);
    expect(isFontOnlyPackage("@fontsource/foo", ["index.css", "index.js"])).toBe(false);
  });

  it("walks nested folders and accepts only listed file types", () => {
    expect(isFontOnlyPackage("@fontsource/foo", ["index.css", "files/foo.woff2", "dist/lib/loader.js"])).toBe(false);
    expect(isFontOnlyPackage("@fontsource/foo", ["index.css", "scss/deep/x.cjs"])).toBe(false);
    expect(isFontOnlyPackage("@fontsource/foo", ["index.css", "files/foo.wasm"])).toBe(false);
    expect(isFontOnlyPackage("@fontsource/foo", ["index.css", "types/index.d.ts"])).toBe(false);
    expect(isFontOnlyPackage("@fontsource/foo", [])).toBe(false);
  });

  it("refuses a font package whose package.json has scripts or bin", () => {
    const files = ["LICENSE", "index.css", "files/foo.woff2"];
    expect(isFontOnlyPackage("@fontsource/foo", files, { scripts: { postinstall: "node x" } })).toBe(false);
    expect(isFontOnlyPackage("@fontsource/foo", files, { bin: "cli.css" })).toBe(false);
    expect(isFontOnlyPackage("@fontsource/foo", files, { bin: { foo: "./foo" } })).toBe(false);
    expect(isFontOnlyPackage("@fontsource/foo", files, { scripts: {} })).toBe(true);
  });

  it("so OFL-1.1 passes for a font package but still fails for code", () => {
    expect(findViolations([pkg("@fontsource/atkinson-hyperlegible", "OFL-1.1", "font")])).toHaveLength(0);
    expect(findViolations([pkg("@fontsource/atkinson-hyperlegible", "OFL-1.1")])).toHaveLength(1);
  });
});

describe("isAllowedExpression", () => {
  it.each(["MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC", "MPL-2.0", "0BSD", "Zlib"])("allows %s", (id) => {
    expect(isAllowedExpression(id)).toBe(true);
  });

  it.each(["GPL-3.0-only", "GPL-2.0-or-later", "AGPL-3.0", "LGPL-3.0-or-later", "CC-BY-4.0", "SSPL-1.0", "BUSL-1.1", "UNLICENSED", "OFL-1.1"])(
    "rejects %s for code",
    (id) => {
      expect(isAllowedExpression(id)).toBe(false);
    },
  );

  it("is case-sensitive on SPDX ids, so look-alikes do not slip through", () => {
    expect(isAllowedExpression("mit")).toBe(false);
    expect(isAllowedExpression("Apache 2.0")).toBe(false);
  });

  it("OR passes when either side is allowed; AND needs both", () => {
    expect(isAllowedExpression("(MIT OR GPL-3.0-only)")).toBe(true);
    expect(isAllowedExpression("GPL-3.0-only OR Apache-2.0")).toBe(true);
    expect(isAllowedExpression("(MIT AND Zlib)")).toBe(true);
    expect(isAllowedExpression("MIT AND GPL-2.0-only")).toBe(false);
    expect(isAllowedExpression("(MIT AND (GPL-2.0-only OR BSD-3-Clause))")).toBe(true);
    expect(isAllowedExpression("(MIT OR GPL-2.0-only) AND LGPL-3.0-only")).toBe(false);
  });

  it("judges `X WITH exception` on X", () => {
    expect(isAllowedExpression("Apache-2.0 WITH LLVM-exception")).toBe(true);
    expect(isAllowedExpression("GPL-2.0-only WITH Classpath-exception-2.0")).toBe(false);
  });

  it("rejects empty, missing and malformed expressions", () => {
    for (const bad of [null, undefined, "", "   ", "SEE LICENSE IN LICENSE.txt", "(MIT", "MIT)", "MIT OR", "AND MIT", "MIT WITH"]) {
      expect(isAllowedExpression(bad as string), String(bad)).toBe(false);
    }
  });

  it("checks fonts against their own list", () => {
    expect(isAllowedExpression("OFL-1.1", new Set(["OFL-1.1"]))).toBe(true);
    expect(ALLOWED_CODE.has("OFL-1.1")).toBe(false);
  });
});

describe("licenseExpression", () => {
  it("reads modern and legacy package.json fields", () => {
    expect(licenseExpression({ license: "MIT" })).toBe("MIT");
    expect(licenseExpression({ license: { type: "ISC" } })).toBe("ISC");
    expect(licenseExpression({ licenses: [{ type: "MIT" }, { type: "Apache-2.0" }] })).toBe("(MIT OR Apache-2.0)");
    expect(licenseExpression({ licenses: [{ type: "BSD-3-Clause" }] })).toBe("BSD-3-Clause");
    expect(licenseExpression({})).toBeNull();
    expect(licenseExpression({ license: "" })).toBeNull();
  });
});

describe("findViolations", () => {
  it("flags anything outside the allow-list, including a missing license", () => {
    const v = findViolations([pkg("ok", "MIT"), pkg("gpl", "GPL-3.0-only"), pkg("lgpl", "LGPL-3.0-or-later"), pkg("none", null), pkg("dual", "(MIT OR GPL-3.0)")]);
    expect(v.map((e) => e.name)).toEqual(["gpl", "lgpl", "none"]);
  });

  it("allows OFL-1.1 for fonts only", () => {
    expect(findViolations([pkg("Geist (font)", "OFL-1.1", "font")])).toEqual([]);
    expect(findViolations([pkg("some-package", "OFL-1.1")]).map((e) => e.name)).toEqual(["some-package"]);
    expect(findViolations([pkg("font", "MIT", "font")]).map((e) => e.name)).toEqual(["font"]);
  });

  it("font library entries follow the library's own serving list (F24, AC-270)", () => {
    expect([...ALLOWED_LIBRARY_FONT].sort()).toEqual([...FONT_LICENCES.values()].sort());
    const lib = (name: string, license: string | null) => ({ ...pkg(name, license, "font"), library: true });
    expect(findViolations([lib("Roboto (font library)", "Apache-2.0"), lib("Ubuntu (font library)", "UFL-1.0"), lib("Lato (font library)", "OFL-1.1")])).toEqual([]);
    expect(findViolations([lib("Paid (font library)", "LicenseRef-Commercial"), lib("Copyleft (font library)", "GPL-3.0-only"), lib("None (font library)", null)]).map((e) => e.name)).toEqual([
      "Paid (font library)",
      "Copyleft (font library)",
      "None (font library)",
    ]);
  });

  it("accepts a reviewed exception only for that package and that exact license", () => {
    const exceptions = { "data-pkg": { license: "CC-BY-4.0", reason: "data" } };
    expect(findViolations([pkg("data-pkg", "CC-BY-4.0")], { exceptions })).toEqual([]);
    expect(findViolations([pkg("data-pkg", "CC-BY-SA-4.0")], { exceptions })).toHaveLength(1);
    expect(findViolations([pkg("other", "CC-BY-4.0")], { exceptions })).toHaveLength(1);
  });

  it("the shipped exception list stays short and documented", () => {
    for (const [name, ex] of Object.entries(EXCEPTIONS)) {
      expect(ex.reason.length, name).toBeGreaterThan(20);
      expect(/GPL/.test(ex.license), name).toBe(false);
    }
  });
});

describe("copyrightLines", () => {
  it("keeps real copyright lines and drops license template lines", () => {
    const text = [
      "MIT License",
      "",
      "Copyright (c) 2019 Jane Doe",
      "  Copyright 2020 Example Corp.  ",
      "(c) 2021 Someone",
      "The above copyright notice and this permission notice shall be included",
      "Copyright [yyyy] [name of copyright owner]",
      "COPYRIGHT HOLDERS AND CONTRIBUTORS \"AS IS\"",
      "Copyright (c) 2019 Jane Doe",
    ].join("\n");
    expect(copyrightLines(text)).toEqual(["Copyright (c) 2019 Jane Doe", "Copyright 2020 Example Corp.", "(c) 2021 Someone"]);
  });
});
