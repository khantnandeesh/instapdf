/** Alternate & mix copy for a card's settings, the one-file hint and the Sort menu (spec F4/F5 P-13), apart from copy.ts. */
export const cardCopy = {
  normal: "Normal",
  reverse: "Reverse",
  perTurn: "per turn",
  repeat: "Repeat",
  orderOf: (file: string) => `Order of ${file}`,
  perTurnFrom: (file: string) => `Pages per turn from ${file}`,
  fewer: (file: string) => `Fewer pages per turn from ${file}`,
  more: (file: string) => `More pages per turn from ${file}`,
  repeatName: (file: string) => `Repeat ${file}`,
  orderChanged: (file: string, reverse: boolean) => `${file}: ${reverse ? "reverse" : "normal"} order`,
  oneFile: "All fronts, then all backs in one file?",
  openOrganize: "Open in Organize",
  sort: "Sort",
  sortNeedsMore: "Add more files to sort",
  sorted: { "name-asc": "Sorted by name, A to Z", "name-desc": "Sorted by name, Z to A" },
  sortItems: { "name-asc": "Name A to Z", "name-desc": "Name Z to A" },
};
