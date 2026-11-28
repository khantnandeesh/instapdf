import { PDFDict, PDFDocument, PDFHexString, PDFName, PDFString } from "@cantoo/pdf-lib";
import { describe, expect, it } from "vitest";
import { BOOKMARK_LIMITS, addAfter, addChild, canIndent, canMoveDown, canMoveUp, canOutdent, indent, moveDown, moveUp, outdent, outlineTooBig, removeRow, rowsChanged, rowsError, rowsFromOutline, toTree, type BookmarkRow } from "./bookmark-edit";
import { writeBookmarks } from "./bookmarks";
import { readOutline, writeOutline } from "./outline";

const entries = [
  { index: 0, level: 1, page: 0, title: "One" },
  { index: 1, level: 2, page: 1, title: "One A" },
  { index: 2, level: 2, page: 2, title: "One B" },
  { index: 3, level: 1, page: 3, title: "Two" },
];
const shape = (rows: readonly BookmarkRow[]) => rows.map((r) => `${"-".repeat(r.level - 1)}${r.title || "?"}`).join(" ");

describe("Bookmarks: the list (spec F10 §4)", () => {
  it("AC-1280: the file's outline becomes rows with levels; an unchanged list is not a change", () => {
    const rows = rowsFromOutline(entries);
    expect(shape(rows)).toBe("One -One A -One B Two");
    expect(rows.map((r) => r.page)).toEqual(["1", "2", "3", "4"]);
    expect(rowsChanged(rows, rows)).toBe(false);
    expect(rowsChanged(rows.map((r, i) => (i ? r : { ...r, title: "Uno" })), rows)).toBe(true);
    expect(rowsChanged(moveDown(rows, 0), rows)).toBe(true);
  });
  it("AC-1281: a new bookmark goes after the row and what is under it, or under it as its first", () => {
    const rows = rowsFromOutline(entries);
    expect(shape(addAfter(rows, 0).rows)).toBe("One -One A -One B ? Two");
    expect(shape(addAfter(rows, null).rows)).toBe("One -One A -One B Two ?");
    expect(shape(addChild(rows, 0).rows)).toBe("One -? -One A -One B Two");
    expect(addAfter(rows, 1).rows[2].page).toBe("2");
  });
  it("AC-1282: deleting a bookmark deletes what is under it", () => {
    expect(shape(removeRow(rowsFromOutline(entries), 0))).toBe("Two");
  });
  it("AC-1283: indent puts a bookmark under the one above; outdent takes it out after its old parent's other children", () => {
    const rows = rowsFromOutline(entries);
    expect(canIndent(rows, 0)).toBe(false);
    expect(canIndent(rows, 1)).toBe(false);
    expect(shape(indent(rows, 2))).toBe("One -One A --One B Two");
    expect(shape(indent(rows, 3))).toBe("One -One A -One B -Two");
    expect(canOutdent(rows, 0)).toBe(false);
    expect(shape(outdent(rows, 1))).toBe("One -One B One A Two");
  });
  it("AC-1284: moving up or down swaps with the neighbour at the same level, each with what is under it", () => {
    const rows = rowsFromOutline(entries);
    expect(canMoveUp(rows, 0)).toBe(false);
    expect(canMoveDown(rows, 2)).toBe(false);
    expect(shape(moveDown(rows, 0))).toBe("Two One -One A -One B");
    expect(shape(moveUp(rows, 2))).toBe("One -One B -One A Two");
    expect(shape(moveUp(rows, 3))).toBe("Two One -One A -One B");
  });
  it("AC-1285: every bookmark needs a name and a page of the file", () => {
    const rows = rowsFromOutline(entries);
    expect(rowsError(rows, 4)).toBeNull();
    expect(rowsError(addAfter(rows, null).rows, 4)).toBe("title");
    expect(rowsError(rows, 3)).toBe("page");
    expect(rowsError(rows.map((r) => ({ ...r, page: "2a" })), 4)).toBe("page");
    expect(toTree(rows).map((n) => [n.title, n.page, n.children.length])).toEqual([["One", 0, 2], ["Two", 3, 0]]);
  });
});

async function source() {
  const doc = await PDFDocument.create();
  const pages = [0, 1, 2, 3].map(() => doc.addPage([300, 400]));
  writeOutline(doc, [
    { title: "One", page: pages[0].ref, color: [1, 0, 0], flags: 2, view: { kind: "FitH", args: [380] }, children: [{ title: "One A", page: pages[1].ref, children: [] }, { title: "One B", page: pages[2].ref, children: [] }] },
    { title: "Two", page: pages[3].ref, children: [] },
  ]);
  return doc.save();
}

describe("Bookmarks: the file (spec F10 §4)", () => {
  it("AC-1290: renamed, moved and new bookmarks are written; a kept one keeps its colour, weight and view", async () => {
    const rows = moveDown(rowsFromOutline(entries), 0).map((r) => (r.title === "One" ? { ...r, title: "First" } : r));
    const added = addAfter(rows, null);
    const out = await writeBookmarks({ bytes: await source(), items: toTree(added.rows.map((r) => (r.key === added.key ? { ...r, title: "New", page: "2" } : r))) });
    const got = readOutline(await PDFDocument.load(out.bytes));
    expect(got.map((b) => [b.title, b.pageIndex, b.children.length])).toEqual([["Two", 3, 0], ["First", 0, 2], ["New", 1, 0]]);
    expect(got[1].color).toEqual([1, 0, 0]);
    expect(got[1].flags).toBe(2);
    expect(got[1].view).toEqual({ kind: "FitH", args: [380] });
    expect(out.count).toBe(5);
  });
  it("AC-1291: a bookmark sent to another page drops its old view", async () => {
    const rows = rowsFromOutline(entries).map((r) => (r.title === "One" ? { ...r, page: "3" } : r));
    const got = readOutline(await PDFDocument.load((await writeBookmarks({ bytes: await source(), items: toTree(rows) })).bytes));
    expect(got[0].pageIndex).toBe(2);
    expect(got[0].view).toEqual({ kind: "XYZ", args: [null, null, null] });
    expect(got[0].color).toEqual([1, 0, 0]);
  });
  it("AC-1292: a deleted bookmark's name is nowhere in the file, and removing all leaves no outline", async () => {
    const titles = async (bytes: Uint8Array) =>
      (await PDFDocument.load(bytes)).context
        .enumerateIndirectObjects()
        .flatMap(([, o]) => (o instanceof PDFDict ? [o.get(PDFName.of("Title"))] : [o]))
        .filter((t) => t instanceof PDFString || t instanceof PDFHexString)
        .map((t) => (t as PDFHexString).decodeText());
    expect(await titles(await source())).toContain("One A");
    const kept = await writeBookmarks({ bytes: await source(), items: toTree(removeRow(rowsFromOutline(entries), 0)) });
    expect(await titles(kept.bytes)).toEqual(["Two"]);
    const none = await PDFDocument.load((await writeBookmarks({ bytes: await source(), items: [] })).bytes);
    expect(none.catalog.has(PDFName.of("Outlines"))).toBe(false);
    expect(none.catalog.has(PDFName.of("PageMode"))).toBe(false);
    expect(await titles(await none.save())).toEqual([]);
  });
  it("AC-1293: a file given bookmarks opens with the bookmarks panel", async () => {
    const plain = await PDFDocument.create();
    plain.addPage([300, 400]);
    const out = await PDFDocument.load((await writeBookmarks({ bytes: await plain.save(), items: [{ title: "Start", page: 0, children: [] }] })).bytes);
    expect(out.catalog.get(PDFName.of("PageMode"))).toBe(PDFName.of("UseOutlines"));
    await expect(writeBookmarks({ bytes: await plain.save(), items: [{ title: "Gone", page: 5, children: [] }] })).rejects.toThrow(/not in the file/);
  });
  it("AC-1294: a web-link bookmark and a heading with no target are kept as they were, children in place", async () => {
    const doc = await PDFDocument.create();
    const pages = [0, 1].map(() => doc.addPage([300, 400]));
    const link = doc.context.obj({ S: "URI", URI: PDFString.of("https://example.org/") });
    writeOutline(doc, [
      { title: "Part", page: pages[0].ref, target: null, children: [{ title: "Ch 1", page: pages[0].ref, children: [] }, { title: "Ch 2", page: pages[1].ref, children: [] }] },
      { title: "Site", page: pages[0].ref, target: { key: "A", value: link }, children: [] },
    ]);
    const bytes = await doc.save();
    // What the editor's reader gives for this file: the two without a page are listed, with no page.
    const rows = rowsFromOutline([
      { index: 0, level: 1, page: -1, title: "Part" },
      { index: 1, level: 2, page: 0, title: "Ch 1" },
      { index: 2, level: 2, page: 1, title: "Ch 2" },
      { index: 3, level: 1, page: -1, title: "Site" },
    ]);
    expect(rows.map((r) => r.page)).toEqual(["", "1", "2", ""]);
    expect(rowsError(rows, 2)).toBeNull();
    const out = await PDFDocument.load((await writeBookmarks({ bytes, items: toTree(rows.map((r) => (r.title === "Ch 2" ? { ...r, title: "Chapter 2" } : r))) })).bytes);
    const got = readOutline(out);
    expect(got.map((b) => [b.title, b.pageIndex, b.children.map((c) => c.title)])).toEqual([["Part", null, ["Ch 1", "Chapter 2"]], ["Site", null, []]]);
    expect(got[0].raw?.has(PDFName.of("Dest"))).toBe(false);
    expect(String(got[1].raw?.lookup(PDFName.of("A"), PDFDict).get(PDFName.of("URI")))).toContain("example.org");
    // Given a page, the heading becomes an ordinary bookmark.
    const paged = readOutline(await PDFDocument.load((await writeBookmarks({ bytes, items: toTree(rows.map((r) => (r.title === "Part" ? { ...r, page: "2" } : r))) })).bytes));
    expect(paged[0].pageIndex).toBe(1);
  });
  it("AC-1295: of two bookmarks with one name on one page, the one that stays keeps its own style", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([300, 400]);
    writeOutline(doc, [
      { title: "Same", page: page.ref, color: [1, 0, 0], children: [] },
      { title: "Same", page: page.ref, color: [0, 0, 1], children: [] },
    ]);
    const rows = rowsFromOutline([{ index: 0, level: 1, page: 0, title: "Same" }, { index: 1, level: 1, page: 0, title: "Same" }]);
    const got = readOutline(await PDFDocument.load((await writeBookmarks({ bytes: await doc.save(), items: toTree(removeRow(rows, 0)) })).bytes));
    expect(got.map((b) => b.color)).toEqual([[0, 0, 1]]);
  });
  it("AC-1296: an outline larger than the editor holds is not edited, and a file's long name is not cut", () => {
    expect(outlineTooBig(Array.from({ length: BOOKMARK_LIMITS.rows + 1 }, () => ({ level: 1 })))).toBe(true);
    expect(outlineTooBig([{ level: BOOKMARK_LIMITS.depth + 1 }])).toBe(true);
    expect(outlineTooBig([{ level: 1 }])).toBe(false);
    const long = "x".repeat(BOOKMARK_LIMITS.title + 50);
    const rows = rowsFromOutline([{ index: 0, level: 1, page: 0, title: long }]);
    expect(rows[0].title).toBe(long);
    expect(rowsChanged(rows, rows)).toBe(false);
  });
});
