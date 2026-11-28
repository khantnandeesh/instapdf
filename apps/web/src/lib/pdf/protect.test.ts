import { readFile } from "node:fs/promises";
import { PDFDocument } from "@cantoo/pdf-lib";
import { describe, expect, it } from "vitest";
import { runJob } from "./jobs";
import { ALLOW_ALL, canProtect, passwordTooLong, passwordUnfit, PDFA_NOTE, protectPdf, unlockPdf } from "./protect";

const fx = async (name: string) => new Uint8Array(await readFile(new URL(`../../../tests/fixtures/${name}`, import.meta.url)));
const blob = (b: Uint8Array) => new Blob([b as Uint8Array<ArrayBuffer>], { type: "application/pdf" });

/** Opens with pdf.js, an implementation independent of the one that wrote the file. */
async function open(bytes: Uint8Array, password?: string) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: bytes.slice(), password, verbosity: 0 }).promise;
  const allowed = await doc.getPermissions();
  const text = (await (await doc.getPage(1)).getTextContent()).items.map((i) => ("str" in i ? i.str : "")).join(" ");
  const flags = pdfjs.PermissionFlag;
  const out = { pages: doc.numPages, text, print: !allowed || allowed.has(flags.PRINT), copy: !allowed || allowed.has(flags.COPY), edit: !allowed || allowed.has(flags.MODIFY_CONTENTS), restricted: !!allowed };
  await doc.loadingTask.destroy();
  return out;
}
const needsPassword = (bytes: Uint8Array, password?: string) =>
  open(bytes, password).then(
    () => false,
    (e: { name?: string }) => e?.name === "PasswordException",
  );

describe("protectPdf (F11 AC-800 to AC-804)", () => {
  it("AC-800: the file asks for the open password, and opens with it", async () => {
    const out = await protectPdf({ bytes: await fx("alpha.pdf"), options: { openPassword: "s3cret-ключ", ownerPassword: "", allow: ALLOW_ALL } });
    expect(await needsPassword(out.bytes)).toBe(true);
    expect(await needsPassword(out.bytes, "wrong")).toBe(true);
    const doc = await open(out.bytes, "s3cret-ключ");
    expect(doc.pages).toBe(3);
    expect(doc.text).toContain("Alpha 1");
  });

  it("AC-801: AES-256 (V5, R6)", async () => {
    const out = await protectPdf({ bytes: await fx("alpha.pdf"), options: { openPassword: "pw", ownerPassword: "", allow: ALLOW_ALL } });
    const raw = Buffer.from(out.bytes).toString("latin1");
    expect(raw).toMatch(/\/V 5\b/);
    expect(raw).toMatch(/\/R 6\b/);
    expect(raw).toContain("/AESV3");
    expect(raw).not.toContain("Alpha 1");
  });

  it("AC-802: restrictions without an open password: opens freely, with the rights switched off", async () => {
    const out = await protectPdf({ bytes: await fx("alpha.pdf"), options: { openPassword: "", ownerPassword: "", allow: { print: "none" as const, copy: false, edit: "any" as const } } });
    const doc = await open(out.bytes);
    expect(doc).toMatchObject({ pages: 3, restricted: true, print: false, copy: false, edit: true });
  });

  it("AC-803: the open password opens with the rights switched off; the owner password is accepted too", async () => {
    const out = await protectPdf({ bytes: await fx("alpha.pdf"), options: { openPassword: "open", ownerPassword: "owner", allow: { print: "any" as const, copy: true, edit: "none" as const } } });
    expect(await open(out.bytes, "open")).toMatchObject({ edit: false, print: true });
    // pdf.js reports the stored rights whoever opens the file; that the owner password is accepted is what it can show.
    expect((await open(out.bytes, "owner")).pages).toBe(3);
    expect(await needsPassword(out.bytes, "neither")).toBe(true);
  });

  it("AC-804: an already protected file is protected again with the new password only", async () => {
    const out = await protectPdf({ bytes: await fx("user-pw.pdf"), password: "test", options: { openPassword: "new", ownerPassword: "", allow: ALLOW_ALL } });
    expect(await needsPassword(out.bytes, "test")).toBe(true);
    expect((await open(out.bytes, "new")).pages).toBe(3);
  });

  it("needs a password or a restriction, and a password that fits", async () => {
    expect(canProtect({ openPassword: "", ownerPassword: "x", allow: ALLOW_ALL })).toBe(false);
    expect(canProtect({ openPassword: "", ownerPassword: "", allow: { ...ALLOW_ALL, copy: false } })).toBe(true);
    expect(passwordTooLong("a".repeat(127))).toBe(false);
    expect(passwordTooLong("é".repeat(64))).toBe(true);
    await expect(protectPdf({ bytes: await fx("alpha.pdf"), options: { openPassword: "", ownerPassword: "", allow: ALLOW_ALL } })).rejects.toThrow(/Enter a password/);
  });
});

describe("unlockPdf (F11 AC-810 to AC-812)", () => {
  it("AC-810: the copy opens with no password", async () => {
    const out = await unlockPdf({ bytes: await fx("user-pw.pdf"), password: "test" });
    expect(out.wasEncrypted).toBe(true);
    expect(await open(out.bytes)).toMatchObject({ pages: 3, restricted: false });
    expect((await PDFDocument.load(out.bytes)).isEncrypted).toBe(false);
  });

  it("AC-811: restrictions go too", async () => {
    const out = await unlockPdf({ bytes: await fx("owner-restricted.pdf") });
    expect(await open(out.bytes)).toMatchObject({ restricted: false, print: true, copy: true, edit: true });
  });

  it("AC-812: a job with nothing to remove says so; several files come back as a ZIP", async () => {
    await expect(runJob({ kind: "unlock", zipName: "x.zip", files: [{ name: "alpha.pdf", source: blob(await fx("alpha.pdf")) }] }, () => {})).rejects.toThrow(/nothing to remove/);
    const out = await runJob(
      { kind: "unlock", zipName: "unlocked.zip", files: [{ name: "user-pw.pdf", source: blob(await fx("user-pw.pdf")), password: "test" }, { name: "alpha.pdf", source: blob(await fx("alpha.pdf")) }] },
      () => {},
    );
    expect(out).toMatchObject({ name: "unlocked.zip", type: "application/zip", wasEncrypted: false });
    expect(out.entries?.map((e) => e.name)).toEqual(["user-pw.pdf", "alpha.pdf"]);
  });
});

describe("protect job", () => {
  it("one file keeps its name and does not carry the no-password warning", async () => {
    const out = await runJob({ kind: "protect", zipName: "x.zip", files: [{ name: "alpha.pdf", source: blob(await fx("alpha.pdf")) }], options: { openPassword: "pw", ownerPassword: "", allow: ALLOW_ALL } }, () => {});
    expect(out).toMatchObject({ name: "alpha.pdf", type: "application/pdf", pageCount: 3, wasEncrypted: false });
    expect(await needsPassword(new Uint8Array(await out.blob.arrayBuffer()))).toBe(true);
  });
  it("AC-814: a PDF/A file is protected as a normal PDF, with a note saying so", async () => {
    const out = await runJob({ kind: "protect", zipName: "x.zip", files: [{ name: "a.pdf", source: blob(await fx("tagged-features.pdf")) }], options: { openPassword: "pw", ownerPassword: "", allow: ALLOW_ALL } }, () => {});
    expect(out.warnings).toEqual([PDFA_NOTE]);
    const bytes = new Uint8Array(await out.blob.arrayBuffer());
    expect(await needsPassword(bytes)).toBe(true);
    expect((await open(bytes, "pw")).pages).toBeGreaterThan(0);
    // The claim is gone: once unlocked, the same file protects again with no note.
    const plain = await unlockPdf({ bytes, password: "pw" });
    const again = await protectPdf({ bytes: plain.bytes, options: { openPassword: "pw", ownerPassword: "", allow: ALLOW_ALL } });
    expect(again.warnings).toBeUndefined();
  });
});

describe("review fixes", () => {
  it("AC-815: a password opens the file however its accents were typed", async () => {
    const nfd = "cafe\u0301";
    const { bytes } = await protectPdf({ bytes: await fx("alpha.pdf"), options: { openPassword: nfd, ownerPassword: "", allow: ALLOW_ALL } });
    expect((await open(bytes, "caf\u00e9")).pages).toBe(3);
  });

  it("AC-804: the engine itself refuses an owner password equal to the open one", async () => {
    const options = { openPassword: "same", ownerPassword: "same", allow: { ...ALLOW_ALL, print: "none" as const } };
    await expect(protectPdf({ bytes: await fx("alpha.pdf"), options })).rejects.toThrow(/different password/);
  });

  it("AC-816: no trace of the old password is left, and our own tools read the copy as an open file", async () => {
    const options = { openPassword: "first", ownerPassword: "", allow: ALLOW_ALL };
    const titled = await PDFDocument.load(await fx("alpha.pdf"));
    titled.setTitle("Kept title");
    const locked = await protectPdf({ bytes: await titled.save(), options });
    const count = (bytes: Uint8Array) => Buffer.from(bytes).toString("latin1").split("/Standard").length - 1;
    const open1 = await unlockPdf({ bytes: locked.bytes, password: "first" });
    expect(count(open1.bytes)).toBe(0);
    const reopened = await PDFDocument.load(open1.bytes, { ignoreEncryption: true, updateMetadata: false });
    expect(reopened.isEncrypted).toBe(false);
    expect(reopened.getTitle()).toBe("Kept title");
    // Protecting a protected file again keeps one encryption dictionary: the new one.
    const again = await protectPdf({ bytes: locked.bytes, password: "first", options: { ...options, openPassword: "second" } });
    const plain = await PDFDocument.load(again.bytes, { password: "second" });
    expect(plain.getPageCount()).toBe(3);
    expect(await needsPassword(again.bytes, "first")).toBe(true);
  });
  it("AC-812: finer rights: draft printing, forms without editing, pages alone", async () => {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const F = pdfjs.PermissionFlag;
    const rights = async (allow: Parameters<typeof protectPdf>[0]["options"]["allow"]) => {
      const out = await protectPdf({ bytes: await fx("alpha.pdf"), options: { openPassword: "", ownerPassword: "", allow } });
      const doc = await pdfjs.getDocument({ data: out.bytes.slice(), verbosity: 0 }).promise;
      const has = new Set(await doc.getPermissions());
      await doc.loadingTask.destroy();
      return { print: has.has(F.PRINT), fine: has.has(F.PRINT_HIGH_QUALITY), copy: has.has(F.COPY), modify: has.has(F.MODIFY_CONTENTS), comment: has.has(F.MODIFY_ANNOTATIONS), forms: has.has(F.FILL_INTERACTIVE_FORMS), pages: has.has(F.ASSEMBLE) };
    };
    expect(await rights({ print: "low", copy: true, edit: "any" })).toEqual({ print: true, fine: false, copy: true, modify: true, comment: true, forms: true, pages: true });
    expect(await rights({ print: "any", copy: true, edit: "forms" })).toEqual({ print: true, fine: true, copy: true, modify: false, comment: false, forms: true, pages: false });
    expect(await rights({ print: "any", copy: false, edit: "comment" })).toEqual({ print: true, fine: true, copy: false, modify: false, comment: true, forms: true, pages: false });
    expect(await rights({ print: "none", copy: true, edit: "pages" })).toEqual({ print: false, fine: false, copy: true, modify: false, comment: false, forms: false, pages: true });
  });
  it("AC-813: AES-128 for old readers: the password is needed and opens the file; long passwords are refused", async () => {
    for (const pw of ["s3cret", "caf\u00e9-\u00fc"]) {
      const out = await protectPdf({ bytes: await fx("alpha.pdf"), options: { openPassword: pw, ownerPassword: "", allow: ALLOW_ALL, strength: "aes128" } });
      expect(new TextDecoder("latin1").decode(out.bytes)).toMatch(/\/V 4\b[\s\S]*\/AESV2/);
      expect(await needsPassword(out.bytes)).toBe(true);
      expect((await open(out.bytes, pw)).text).toContain("Alpha 1");
    }
    expect(passwordTooLong("a".repeat(33), "aes128")).toBe(true);
    expect(passwordTooLong("\u00e9".repeat(32), "aes128")).toBe(false);
    // The old scheme has no way to store letters outside Western European ones.
    expect(passwordUnfit("ключ", "aes128")).toBe(true);
    expect(passwordUnfit("ключ", "aes256")).toBe(false);
    await expect(protectPdf({ bytes: await fx("alpha.pdf"), options: { openPassword: "ключ", ownerPassword: "", allow: ALLOW_ALL, strength: "aes128" } })).rejects.toThrow(/AES-256/);
    expect(passwordTooLong("a".repeat(33))).toBe(false);
  });
});
