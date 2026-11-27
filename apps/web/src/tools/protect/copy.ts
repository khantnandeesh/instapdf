/** Protect copy (spec F11 §2). Our own wording. */
export const protectCopy = {
  stepPassword: "Password to open",
  password: "Password to open the file",
  passwordPlaceholder: "Password",
  stepAllow: "People may",
  allow: { print: "Print", copy: "Copy text and images", edit: "Edit, fill in and comment" },
  owner: "Password to change these",
  ownerPlaceholder: "Password for changes (optional)",
  needs: "Enter a password",
  tooLong: "Use up to 127 characters",
  sameAsOpen: "Use a different password from the one that opens the file",
  changed: (count: number) => `${count} changed`,
};
