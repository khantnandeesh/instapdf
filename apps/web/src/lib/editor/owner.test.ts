import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { PDFDocument } from "@cantoo/pdf-lib";
import { encryptInfo, isOwnerPassword, validEncrypt } from "./owner";
import { md5, passwordKind, pdfDocBytes, rc4, type EncryptInfo } from "./pdf-password";

const fixture = new Uint8Array(readFileSync(new URL("../../../tests/fixtures/owner-restricted.pdf", import.meta.url)));
const userPw = new Uint8Array(readFileSync(new URL("../../../tests/fixtures/user-pw.pdf", import.meta.url)));

async function encrypted(algorithm: "AES-256" | "AES-128" | "RC4-128" | "RC4-40", userPassword: string, ownerPassword: string) {
  const doc = await PDFDocument.create();
  doc.addPage([200, 200]);
  doc.encrypt({ userPassword, ownerPassword, algorithm, permissions: { printing: true }, ...(algorithm.startsWith("RC4") ? { allowWeakCryptography: true } : {}) });
  return doc.save({ useObjectStreams: false });
}

describe("md5 and rc4", () => {
  it("match node's MD5 and a known RC4 vector", () => {
    for (const s of ["", "abc", "x".repeat(55), "y".repeat(56), "z".repeat(200)]) {
      const b = new TextEncoder().encode(s);
      expect(Buffer.from(md5(b)).toString("hex")).toBe(createHash("md5").update(b).digest("hex"));
    }
    // RFC 6229-style: key "Key", plaintext "Plaintext".
    expect(Buffer.from(rc4(new TextEncoder().encode("Key"), new TextEncoder().encode("Plaintext"))).toString("hex")).toBe("bbf316e8d940af0ad3");
  });
});

describe("isOwnerPassword", () => {
  it("accepts the owner password and nothing else", async () => {
    expect(await isOwnerPassword(fixture, "owner123")).toBe(true);
    expect(await isOwnerPassword(fixture, "owner124")).toBe(false);
    expect(await isOwnerPassword(fixture, "")).toBe(false);
  });

  it("tells the open password from the owner one", async () => {
    // user-pw.pdf opens with "test": that is its user password, not the owner's.
    expect(await passwordKind((await encryptInfo(userPw))!, "test")).toBe("user");
    expect(await isOwnerPassword(userPw, "test")).toBe(false);
  });

  for (const alg of ["AES-256", "AES-128", "RC4-128", "RC4-40"] as const) {
    it(`knows each password of a ${alg} file`, async () => {
      const bytes = await encrypted(alg, "open-me", "own-me");
      const info = (await encryptInfo(bytes))!;
      expect(await passwordKind(info, "own-me")).toBe("owner");
      expect(await passwordKind(info, "open-me")).toBe("user");
      expect(await passwordKind(info, "nope")).toBeNull();
      // A file opened with its owner password is unlocked (it opened with that one).
      expect(await isOwnerPassword(bytes, "own-me")).toBe(true);
      expect(await isOwnerPassword(bytes, "open-me")).toBe(false);
    });
  }
});

// Written by qpdf (tests/fixtures/encryption/gen_qpdf.py): owner "Own€r-é", user "op3n" or empty.
const qpdf = (name: string) => new Uint8Array(readFileSync(new URL(`../../../tests/fixtures/encryption/${name}.pdf`, import.meta.url)));
const OWNER = "Own€r-é";

describe("qpdf-made files, every revision", () => {
  for (const name of ["r2", "r3", "r4rc4", "r4aes", "r4aes-nometa", "r5", "r6"]) {
    it(`${name}: owner, user and wrong passwords`, async () => {
      for (const empty of [false, true]) {
        const info = (await encryptInfo(qpdf(empty ? `${name}-empty` : name)))!;
        expect(info).not.toBeNull();
        expect(await passwordKind(info, OWNER)).toBe("owner");
        expect(await passwordKind(info, empty ? "" : "op3n")).toBe("user");
        expect(await passwordKind(info, "Own€r-e")).toBeNull();
      }
    });
  }

  it("r4aes-latin1: a Latin-1 owner password", async () => {
    const info = (await encryptInfo(qpdf("r4aes-latin1")))!;
    expect(await passwordKind(info, "Owné-r")).toBe("owner");
    expect(await passwordKind(info, "op3n")).toBe("user");
  });

  it("R2-R4: a character with no PDFDocEncoding code is never truncated into a match", async () => {
    // "€" is 0xA0 in PDFDocEncoding; U+20A0 truncated to a byte would also be 0xA0.
    const info = (await encryptInfo(qpdf("r4aes")))!;
    expect(await passwordKind(info, "Own\u20a0r-é")).toBeNull();
    expect(await passwordKind(info, "Own€r-\u01e9")).toBeNull();
    expect(pdfDocBytes("Own€r-é")).toEqual(Uint8Array.from([0x4f, 0x77, 0x6e, 0xa0, 0x72, 0x2d, 0xe9]));
    expect(pdfDocBytes("日本")).toBeNull();
    expect(pdfDocBytes("\u00a0")).toBeNull();
  });
});

describe("validEncrypt", () => {
  const base: EncryptInfo = { r: 3, length: 16, o: new Uint8Array(32), u: new Uint8Array(32), p: -4, id: new Uint8Array(16), encryptMetadata: true };
  it("accepts the shapes each revision needs", () => {
    expect(validEncrypt(base, "/Standard", 2)).toBe(true);
    expect(validEncrypt({ ...base, r: 2, length: 5 }, "/Standard", 1)).toBe(true);
    expect(validEncrypt({ ...base, r: 6, o: new Uint8Array(48), u: new Uint8Array(48) }, "/Standard", 5)).toBe(true);
  });
  it("rejects anything else", () => {
    expect(validEncrypt(base, "/Adobe.PubSec", 2)).toBe(false);
    expect(validEncrypt({ ...base, r: 7 }, "/Standard", 5)).toBe(false);
    expect(validEncrypt({ ...base, r: 1 }, "/Standard", 1)).toBe(false);
    expect(validEncrypt(base, "/Standard", 3)).toBe(false);
    expect(validEncrypt({ ...base, o: new Uint8Array(8) }, "/Standard", 2)).toBe(false);
    expect(validEncrypt({ ...base, id: new Uint8Array() }, "/Standard", 2)).toBe(false);
    expect(validEncrypt({ ...base, length: 64 }, "/Standard", 2)).toBe(false);
    expect(validEncrypt({ ...base, p: 1.5 }, "/Standard", 2)).toBe(false);
    expect(validEncrypt({ ...base, r: 6, u: new Uint8Array(32), o: new Uint8Array(48) }, "/Standard", 5)).toBe(false);
  });
  it("a file whose /Encrypt has the wrong shape is not checked", async () => {
    const doc = await PDFDocument.load(qpdf("r3"), { ignoreEncryption: true, updateMetadata: false });
    const { PDFName, PDFDict } = await import("@cantoo/pdf-lib");
    const enc = doc.context.lookup(doc.context.trailerInfo.Encrypt);
    if (!(enc instanceof PDFDict)) throw new Error("no /Encrypt");
    enc.set(PDFName.of("Filter"), PDFName.of("Other"));
    const bytes = await doc.save({ useObjectStreams: false });
    expect(await encryptInfo(bytes)).toBeNull();
    expect(await isOwnerPassword(bytes, OWNER)).toBe(false);
  });
});
