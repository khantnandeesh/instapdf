/**
 * Protect and Unlock (spec F11). Protect encrypts with AES-256 (PDF 2.0 revision 6, read by every
 * reader since Acrobat 9); Unlock saves a copy with no password and no restrictions. Both run on the
 * device: neither the file nor the password is sent anywhere.
 */
import { decodePDFRawStream, PDFName, PDFRawStream, PDFRef, type PDFDocument } from "@cantoo/pdf-lib";
import { loadForEdit } from "./rotate";
import { USER_ERROR } from "./user-error";
import { canProtect, normalPassword, ownerSameAsOpen, passwordTooLong, restricts, type ProtectOptions } from "./protect-options";

export * from "./protect-options";

function randomPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export type ProtectInput = { bytes: Uint8Array; password?: string; options: ProtectOptions };
export type SecurityResult = { bytes: Uint8Array; pageCount: number; wasEncrypted: boolean; warnings?: string[] };

export const PDFA_NOTE = "This file was marked as PDF/A, an archive format that cannot have a password. The protected copy is a normal PDF.";

/**
 * PDF/A forbids encryption, so a protected copy cannot keep the claim (and the library refuses to encrypt
 * while it is there). Takes the `pdfaid` entries out of the XMP metadata; everything else stays.
 * Returns whether the file claimed PDF/A.
 */
function dropPdfAClaim(doc: PDFDocument): boolean {
  const key = PDFName.of("Metadata");
  const ref = doc.catalog.get(key);
  const meta = doc.catalog.lookup(key);
  if (!(meta instanceof PDFRawStream)) return false;
  let xml: string;
  try {
    xml = new TextDecoder("utf-8").decode(decodePDFRawStream(meta).decode());
  } catch {
    return false;
  }
  if (!/pdfaid:(part|conformance)/.test(xml)) return false;
  const cleaned = xml
    .replace(/<pdfaid:(\w+)\b[^>]*>[\s\S]*?<\/pdfaid:\1\s*>/g, "")
    .replace(/<pdfaid:\w+\b[^>]*\/>/g, "")
    .replace(/\spdfaid:\w+\s*=\s*("[^"]*"|'[^']*')/g, "");
  const stream = doc.context.stream(new TextEncoder().encode(cleaned), { Type: "Metadata", Subtype: "XML" });
  if (ref instanceof PDFRef) doc.context.assign(ref, stream);
  else doc.catalog.set(key, doc.context.register(stream));
  return true;
}

export async function protectPdf({ bytes, password, options }: ProtectInput): Promise<SecurityResult> {
  if (!canProtect(options)) throw new Error(`${USER_ERROR}Enter a password, or switch off something people may do.`);
  if (passwordTooLong(options.openPassword) || passwordTooLong(options.ownerPassword)) throw new Error(`${USER_ERROR}That password is too long. Use a shorter one.`);
  if (ownerSameAsOpen(options)) throw new Error(`${USER_ERROR}Use a different password from the one that opens the file.`);
  const { doc, wasEncrypted } = await loadForEdit(bytes, password);
  const { allow } = options;
  const wasPdfA = dropPdfAClaim(doc);
  const openPassword = normalPassword(options.openPassword);
  const ownerPassword = normalPassword(options.ownerPassword);
  doc.encrypt({
    algorithm: "AES-256",
    userPassword: openPassword,
    // The same password for both gives whoever opens the file full rights, which is right when nothing is
    // restricted. With restrictions, a different owner password is what makes readers keep to them.
    ownerPassword: ownerPassword || (restricts(allow) ? randomPassword() : openPassword),
    permissions: {
      printing: allow.print ? "highResolution" : false,
      copying: allow.copy,
      // Screen readers keep their access to the text whatever copying says.
      contentAccessibility: true,
      modifying: allow.edit,
      annotating: allow.edit,
      fillingForms: allow.edit,
      documentAssembly: allow.edit,
    },
  });
  return { bytes: await doc.save(), pageCount: doc.getPageCount(), wasEncrypted, ...(wasPdfA ? { warnings: [PDFA_NOTE] } : {}) };
}

/** A copy with no password and no restrictions. `password` opens the file when it needs one. */
export async function unlockPdf({ bytes, password }: { bytes: Uint8Array; password?: string }): Promise<SecurityResult> {
  const { doc, wasEncrypted } = await loadForEdit(bytes, password);
  return { bytes: await doc.save(), pageCount: doc.getPageCount(), wasEncrypted };
}
