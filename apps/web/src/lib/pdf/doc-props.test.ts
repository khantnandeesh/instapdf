import { PDFDocument, PDFHexString, PDFName, PDFNumber, PDFString, type PDFDict, type PDFObject } from "@cantoo/pdf-lib";
import { describe, expect, it } from "vitest";
import { readLang, readPageLabels, writeLang, writePageLabels } from "./doc-props";

async function docWith(pages: number) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage();
  return doc;
}
const labels = (doc: PDFDocument, nums: unknown[]) => doc.catalog.set(PDFName.of("PageLabels"), doc.context.obj({ Nums: nums as never }));

describe("/Lang (PR #7 review: escaping)", () => {
  it("reads only language tags, normalising underscores", async () => {
    const doc = await docWith(1);
    for (const [given, read] of [
      ["de-DE", "de-DE"],
      ["  zh-Hant-TW ", "zh-Hant-TW"],
      ["en_US", "en-US"],
      ["en) /Evil (\\", undefined],
      ["", undefined],
      ["english language", undefined],
      ["toolongprimary", undefined],
    ] as const) {
      doc.catalog.set(PDFName.of("Lang"), PDFString.of(given));
      expect(readLang(doc), given).toBe(read);
    }
    doc.catalog.set(PDFName.of("Lang"), PDFName.of("de")); // not a string at all
    expect(readLang(doc)).toBeUndefined();
  });
  it("writes a hex string that survives a save and reload, and refuses anything else", async () => {
    const out = await docWith(1);
    writeLang(out, "pt-BR");
    expect(out.catalog.lookup(PDFName.of("Lang"))).toBeInstanceOf(PDFHexString);
    const again = await PDFDocument.load(await out.save());
    expect(readLang(again)).toBe("pt-BR");
    const other = await docWith(1);
    writeLang(other, "x) /Y (");
    expect(other.catalog.get(PDFName.of("Lang"))).toBeUndefined();
  });
});

describe("page labels (PR #7 review: capped, validated)", () => {
  it("keeps valid ranges and ignores ones that cannot apply", async () => {
    const doc = await docWith(5);
    const d = (o: Record<string, PDFObject | string | number>) => doc.context.obj(o as never) as unknown as PDFDict;
    labels(doc, [
      PDFNumber.of(-1), d({ S: "R" }), // negative start
      PDFNumber.of(1.5), d({ S: "R" }), // not a page index
      PDFNumber.of(99), d({ S: "R" }), // past the last page
      PDFNumber.of(1), d({ S: "r", St: 3 }),
      PDFNumber.of(3), d({ S: "Weird", P: PDFHexString.fromText("A-"), St: -4 }), // unknown style, bad start
    ]);
    expect(readPageLabels(doc)).toEqual([
      null,
      { S: "r", P: undefined, St: 3 },
      { S: "r", P: undefined, St: 4 },
      { S: undefined, P: "A-", St: 1 },
      { S: undefined, P: "A-", St: 2 },
    ]);
  });
  it("starts that are not whole numbers >= 1, or are huge, become 1", async () => {
    const doc = await docWith(1);
    for (const st of [0, 2.5, 1e300, Number.NaN]) {
      labels(doc, [PDFNumber.of(0), doc.context.obj({ S: "D", St: PDFNumber.of(st) })]);
      expect(readPageLabels(doc)?.[0]?.St, String(st)).toBe(1);
    }
  });
  it("walks a /Kids tree once, even when it points back at itself", async () => {
    const doc = await docWith(2);
    const root = doc.context.obj({}) as PDFDict;
    const rootRef = doc.context.register(root);
    const leaf = doc.context.obj({ Nums: [PDFNumber.of(0), doc.context.obj({ S: "A" })], Kids: [rootRef] });
    root.set(PDFName.of("Kids"), doc.context.obj([leaf, rootRef]));
    doc.catalog.set(PDFName.of("PageLabels"), rootRef);
    expect(readPageLabels(doc)).toEqual([{ S: "A", P: undefined, St: 1 }, { S: "A", P: undefined, St: 2 }]);
  });
  it("stays fast for a huge /Nums array with many in-range ranges", async () => {
    const doc = await docWith(50);
    const nums: unknown[] = [];
    for (let k = 0; k < 200_000; k++) nums.push(PDFNumber.of(k % 50), doc.context.obj({ S: "D" }));
    labels(doc, nums);
    const t = performance.now();
    const read = readPageLabels(doc);
    expect(performance.now() - t).toBeLessThan(3000);
    expect(read).toHaveLength(50);
    expect(read?.every((l) => l?.S === "D")).toBe(true);
  });
  it("round-trips through writePageLabels", async () => {
    const doc = await docWith(4);
    writePageLabels(doc, [{ S: "r", St: 1 }, { S: "r", St: 2 }, null, { S: "D", P: "B-", St: 7 }]);
    expect(readPageLabels(await PDFDocument.load(await doc.save()))).toEqual([
      { S: "r", P: undefined, St: 1 },
      { S: "r", P: undefined, St: 2 },
      { S: "D", P: undefined, St: 3 },
      { S: "D", P: "B-", St: 7 },
    ]);
  });
});
