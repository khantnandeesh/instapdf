/** Protect copy (spec F11 §2). Our own wording. */
export const protectCopy = {
  stepPassword: "Password to open",
  password: "Password to open the file",
  passwordPlaceholder: "Password",
  stepAllow: "People may",
  print: "Printing",
  // Each choice reads on from "People may", so the side panel needs no label above it.
  prints: { any: "Print in any quality", low: "Print in draft quality only", none: "No printing" },
  copy: "Copy text and images",
  edit: "Changes",
  edits: { any: "Change anything", comment: "Comment and fill in forms only", forms: "Fill in forms only", pages: "Add and remove pages only", none: "No changes" },
  strength: "Encryption",
  strengths: { aes256: "AES-256, the strongest", aes128: "AES-128, for old readers" },
  owner: "Password to change these",
  ownerPlaceholder: "Password for changes (optional)",
  needs: "Enter a password",
  tooLong: "That password is too long",
  unfit: "AES-128 cannot hold this password. Choose AES-256",
  sameAsOpen: "Use a different password from the one that opens the file",
  changed: (count: number) => `${count} changed`,
};
