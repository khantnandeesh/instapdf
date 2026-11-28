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

export const compressCopy = {
  step: "Pictures",
  quality: "Picture quality",
  qualities: { low: "Low", regular: "Regular", good: "Good", best: "Best" },
  /** The bar below 1024 px says what the choice is for. */
  short: { low: "Low quality", regular: "Regular quality", good: "Good quality", best: "Best quality" },
  ppi: "Sharpness",
  ppis: { "72": "72 ppi, for screens", "100": "100 ppi", "150": "150 ppi, for printing", "220": "220 ppi", "300": "300 ppi, fine print", keep: "Keep every pixel" },
  note: "Pictures are what makes a PDF heavy. Each is scaled to the size the page shows it at and packed again. Text and drawings stay exactly as sharp as they are.",
  extras: "Extras",
  gray: "Pictures in grey",
  extrasNote: "Grey pictures take about a third less room. Text and drawings keep their colours.",
};
