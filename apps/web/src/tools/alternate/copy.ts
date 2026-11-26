/** Alternate & mix copy (spec F4/F5 P-13). Our own wording. */
const n = (v: number) => v.toLocaleString("en-US");
const plural = (v: number, one: string, many = `${one}s`) => `${n(v)} ${v === 1 ? one : many}`;

export const alternateCopy = {
  normal: "Normal",
  reverse: "Reverse",
  perTurn: "per turn",
  repeat: "Repeat",
  orderOf: (file: string) => `Order of ${file}`,
  perTurnFrom: (file: string) => `Pages per turn from ${file}`,
  fewer: (file: string) => `Fewer pages per turn from ${file}`,
  more: (file: string) => `More pages per turn from ${file}`,
  repeatName: (file: string) => `Repeat ${file}`,
  perTurnError: "Use a whole number from 1",
  resultLabel: "Result order",
  resultHint: "Arrow keys move between pages. Enter shows the page larger.",
  filesLabel: "Files in mix order",
  filesHint: "Use arrow keys to move between files. Alt with an arrow key moves the file.",
  status: (pages: number, files: number) => `${plural(pages, "page")} · ${plural(files, "file")}`,
  needsAnother: "Add one more file to mix",
  oneFile: "All fronts, then all backs in one file?",
  openOrganize: "Open in Organize",
  sort: "Sort",
  sortNeedsMore: "Add more files to sort",
  sorted: { "name-asc": "Sorted by name, A to Z", "name-desc": "Sorted by name, Z to A" },
  sortItems: { "name-asc": "Name A to Z", "name-desc": "Name Z to A" },
  orderChanged: (file: string, reverse: boolean) => `${file}: ${reverse ? "reverse" : "normal"} order`,
};
