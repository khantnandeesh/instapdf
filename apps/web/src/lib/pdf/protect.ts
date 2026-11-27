/**
 * Protect and Unlock (spec F11). Protect encrypts with AES-256 (PDF 2.0 revision 6, read by every
 * reader since Acrobat 9); Unlock saves a copy with no password and no restrictions. Both run on the
 * device: neither the file nor the password is sent anywhere.
 */
import { loadForEdit } from "./rotate";
import { USER_ERROR } from "./user-error";
import { canProtect, passwordTooLong, restricts, type ProtectOptions } from "./protect-options";

export * from "./protect-options";

function randomPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export type ProtectInput = { bytes: Uint8Array; password?: string; options: ProtectOptions };
export type SecurityResult = { bytes: Uint8Array; pageCount: number; wasEncrypted: boolean };

export async function protectPdf({ bytes, password, options }: ProtectInput): Promise<SecurityResult> {
  if (!canProtect(options)) throw new Error(`${USER_ERROR}Enter a password, or switch off something people may do.`);
  if (passwordTooLong(options.openPassword) || passwordTooLong(options.ownerPassword)) throw new Error(`${USER_ERROR}That password is too long. Use up to 127 characters.`);
  const { doc, wasEncrypted } = await loadForEdit(bytes, password);
  const { allow } = options;
  doc.encrypt({
    algorithm: "AES-256",
    userPassword: options.openPassword,
    // The same password for both gives whoever opens the file full rights, which is right when nothing is
    // restricted. With restrictions, a different owner password is what makes readers keep to them.
    ownerPassword: options.ownerPassword || (restricts(allow) ? randomPassword() : options.openPassword),
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
  return { bytes: await doc.save(), pageCount: doc.getPageCount(), wasEncrypted };
}

/** A copy with no password and no restrictions. `password` opens the file when it needs one. */
export async function unlockPdf({ bytes, password }: { bytes: Uint8Array; password?: string }): Promise<SecurityResult> {
  const { doc, wasEncrypted } = await loadForEdit(bytes, password);
  return { bytes: await doc.save(), pageCount: doc.getPageCount(), wasEncrypted };
}
