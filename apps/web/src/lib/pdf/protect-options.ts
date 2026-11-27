/**
 * The Protect options and their checks: pure and tiny, so the page can use them without loading the PDF engine.
 */

/** What a person who opens the file with the open password (or with none) may do. */
export type ProtectAllow = { print: boolean; copy: boolean; edit: boolean };
export type ProtectOptions = {
  /** Asked for when the file is opened. Empty: the file opens freely and only the restrictions apply. */
  openPassword: string;
  /** Lifts the restrictions. Empty with restrictions on: a random one nobody knows is set. */
  ownerPassword: string;
  allow: ProtectAllow;
};
export const ALLOW_ALL: ProtectAllow = { print: true, copy: true, edit: true };

export const restricts = (allow: ProtectAllow) => !(allow.print && allow.copy && allow.edit);
/** There is something to protect with: a password to open, or at least one restriction. */
export const canProtect = (o: ProtectOptions) => o.openPassword.length > 0 || restricts(o.allow);

/** A password is at most 127 bytes of UTF-8 in revision 6; longer ones would be cut silently. */
export const MAX_PASSWORD_BYTES = 127;
/**
 * The form a password is stored in. Revision 6 asks for a normalised password (SASLprep); NFKC is its
 * core, so "é" typed as one character or as e + accent, or a full-width letter, opens the same file in a
 * reader that normalises what is typed.
 */
export const normalPassword = (p: string) => p.normalize("NFKC");
export const passwordTooLong = (p: string) => new TextEncoder().encode(normalPassword(p)).length > MAX_PASSWORD_BYTES;
/** With restrictions, the password that lifts them must not be the one that opens the file. */
export const ownerSameAsOpen = (o: ProtectOptions) => restricts(o.allow) && o.ownerPassword.length > 0 && normalPassword(o.ownerPassword) === normalPassword(o.openPassword);
