import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { PDFDocument } from "@cantoo/pdf-lib";
import { encryptInfo, isOwnerPassword } from "./owner";
import { md5, passwordKind, rc4 } from "./pdf-password";

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
