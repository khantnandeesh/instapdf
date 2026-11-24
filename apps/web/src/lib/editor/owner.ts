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
  const info: EncryptInfo = { r, length: Math.floor((num("Length") ?? (num("V") === 4 ? 128 : 40)) / 8), o, u, p, id, encryptMetadata: !(meta instanceof PDFBool && !meta.asBoolean()) };
  const filter = dict.lookup(PDFName.of("Filter"));
  return filter instanceof PDFName && validEncrypt(info, filter.asString(), num("V")) ? info : null;
}

/**
 * The /Encrypt dictionary has the shape its revision needs (ISO 32000-2 §7.6.4), so no check reads
 * past an entry or runs on nonsense: the Standard handler, a known R and V, O and U of their
 * lengths, a key length of 40 to 128 bits in whole bytes, an integer P, and a file ID for R2-R4.
 */
export function validEncrypt(e: EncryptInfo, filter: string, v: number | undefined): boolean {
  if (filter !== "/Standard" || !Number.isInteger(e.r) || !Number.isInteger(e.p)) return false;
  if (e.r >= 5) return e.r <= 6 && (v === 5 || v === undefined) && e.o.length >= 48 && e.u.length >= 48;
  if (e.r < 2 || (v !== undefined && ![1, 2, 4].includes(v))) return false;
  if (e.o.length < 32 || e.u.length < (e.r === 2 ? 32 : 16) || !e.id.length) return false;
  // R2 always uses a 40-bit key, whatever /Length says.
  return e.r === 2 || (e.length >= 5 && e.length <= 16);
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
