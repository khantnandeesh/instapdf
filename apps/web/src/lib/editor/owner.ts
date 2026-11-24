/**
 * Checks an owner password, in the download worker (pdf-lib is already loaded there). pdf-lib
 * opens an encrypted file with either password; the owner one is any password that opens it and
 * isn't the open (user) password. Unit tested on the owner-restricted fixture.
 */
import { PDFDocument } from "@cantoo/pdf-lib";

export async function isOwnerPassword(bytes: Uint8Array, password: string, userPassword = ""): Promise<boolean> {
  if (!password || password === userPassword) return false;
  try {
    await PDFDocument.load(bytes, { password, updateMetadata: false });
    return true;
  } catch {
    return false;
  }
}
