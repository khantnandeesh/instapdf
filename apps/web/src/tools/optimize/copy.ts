/** Grayscale copy (spec F13 §1). */
export const grayscaleCopy = {
  step: "Grayscale",
  what: "What to convert",
  all: "Everything",
  vector: "Text and drawings only",
  pictures: "Pictures only",
  /** The bar below 1024 px has room for short names only. */
  short: { all: "Everything", vector: "Text and drawings", pictures: "Pictures" },
  extras: "Extras",
  blackText: "Make text black",
  smaller: "Smaller photos",
  extrasNote: "Black text prints crisper: dark text loses its grey, light text on a dark ground stays light. Smaller photos packs them harder for a lighter file.",
  note: {
    all: "Every colour becomes a shade of grey. Text stays text and stays sharp.",
    vector: "Text, lines, fills and gradients turn grey. Pictures keep their colours.",
    pictures: "Photos and scans turn grey. Text and drawings keep their colours.",
  },
};
