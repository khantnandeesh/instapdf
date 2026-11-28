/** Compress copy (spec F6). Our own wording. Apart from the other tools' copy, so their pages do not carry it. */
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
