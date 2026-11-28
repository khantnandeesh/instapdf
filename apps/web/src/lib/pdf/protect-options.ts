/**
 * The Protect options and their checks: pure and tiny, so the page can use them without loading the PDF engine.
 */

/** What a person who opens the file with the open password (or with none) may do. */
export type ProtectAllow = {
  /** `low`: draft quality only, so no exact copy can be printed. */
  print: "any" | "low" | "none";
  copy: boolean;
  /** `comment`: comments and filling in forms. `forms`: filling in forms only. `pages`: adding, turning and removing pages only. */
  edit: "any" | "comment" | "forms" | "pages" | "none";
};
/** AES-256 is the strongest and the default; AES-128 is for readers from before 2009. The broken RC4 is not offered. */
export type ProtectStrength = "aes256" | "aes128";
export type ProtectOptions = {
  /** Asked for when the file is opened. Empty: the file opens freely and only the restrictions apply. */
  openPassword: string;
  /** Lifts the restrictions. Empty with restrictions on: a random one nobody knows is set. */
  ownerPassword: string;
  allow: ProtectAllow;
  strength?: ProtectStrength;
};
export const ALLOW_ALL: ProtectAllow = { print: "any", copy: true, edit: "any" };

export const restricts = (allow: ProtectAllow) => !(allow.print === "any" && allow.copy && allow.edit === "any");
/** There is something to protect with: a password to open, or at least one restriction. */
export const canProtect = (o: ProtectOptions) => o.openPassword.length > 0 || restricts(o.allow);

/** A password is at most 127 bytes of UTF-8 in revision 6; longer ones would be cut silently. AES-128 (revision 4) takes 32 characters. */
export const MAX_PASSWORD_BYTES = 127;
export const MAX_OLD_PASSWORD_BYTES = 32;
/**
 * The form a password is stored in. Revision 6 asks for a normalised password (SASLprep); NFKC is its
 * core, so "é" typed as one character or as e + accent, or a full-width letter, opens the same file in a
 * reader that normalises what is typed.
 * AES-128 readers use what is typed as it is: there the password is only composed (NFC), so "²" stays "²"
 * and an accent typed apart still joins its letter.
 */
export const normalPassword = (p: string, strength: ProtectStrength = "aes256") => p.normalize(strength === "aes128" ? "NFC" : "NFKC");
export const passwordTooLong = (p: string, strength: ProtectStrength = "aes256") => (strength === "aes128" ? normalPassword(p, strength).length > MAX_OLD_PASSWORD_BYTES : new TextEncoder().encode(normalPassword(p)).length > MAX_PASSWORD_BYTES);
/** AES-128 stores a password one byte a character: letters outside the Western European set have no place in it. */
export const passwordUnfit = (p: string, strength: ProtectStrength = "aes256") => strength === "aes128" && [...normalPassword(p, strength)].some((ch) => ch.codePointAt(0)! > 0xff);
/** With restrictions, the password that lifts them must not be the one that opens the file. */
export const ownerSameAsOpen = (o: ProtectOptions) => restricts(o.allow) && o.ownerPassword.length > 0 && normalPassword(o.ownerPassword, o.strength) === normalPassword(o.openPassword, o.strength);
