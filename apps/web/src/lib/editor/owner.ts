/**
 * Checks an owner password, in the download worker (pdf-lib is already loaded there). The file's
 * encryption dictionary is read without decrypting, and the password is checked against its owner
 * entry (lib/editor/pdf-password): a file opened with its owner password counts as unlocked, and
 * the open (user) password is never taken for the owner one. Unit tested.
 */
import { PDFArray, PDFBool, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFString } from "@cantoo/pdf-lib";
import { passwordKind, type EncryptInfo } from "./pdf-password";

const bytesOf = (o: unknown) => (o instanceof PDFString || o instanceof PDFHexString ? o.asBytes() : null);

export async function encryptInfo(bytes: Uint8Array): Promise<EncryptInfo | null> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const ctx = doc.context;
  const dict = ctx.lookup(ctx.trailerInfo.Encrypt);
  const ids = ctx.lookup(ctx.trailerInfo.ID);
  if (!(dict instanceof PDFDict)) return null;
  const num = (k: string) => {
    const v = dict.lookup(PDFName.of(k));
    return v instanceof PDFNumber ? v.asNumber() : undefined;
  };
  const o = bytesOf(dict.lookup(PDFName.of("O")));
  const u = bytesOf(dict.lookup(PDFName.of("U")));
  const r = num("R");
  const p = num("P");
  const id = ids instanceof PDFArray ? bytesOf(ids.lookup(0)) : new Uint8Array();
  if (!o || !u || r === undefined || p === undefined || !id) return null;
  const meta = dict.lookup(PDFName.of("EncryptMetadata"));
  return { r, length: Math.floor((num("Length") ?? (num("V") === 4 ? 128 : 40)) / 8), o, u, p, id, encryptMetadata: !(meta instanceof PDFBool && !meta.asBoolean()) };
}

export async function isOwnerPassword(bytes: Uint8Array, password: string): Promise<boolean> {
  if (!password) return false;
  try {
    const info = await encryptInfo(bytes);
    return !!info && (await passwordKind(info, password)) === "owner";
  } catch {
    return false;
  }
}
