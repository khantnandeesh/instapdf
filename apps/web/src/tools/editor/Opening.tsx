import { defaultPaper } from "@/lib/editor/blank";

/**
 * The editor while pdf.js opens the file (motion.md E1, F25 §8 "opening"): the layout it is about to
 * show, with paper-tinted placeholders where the page strip and the first page will be, at fit width.
 * The page's aspect is the local default paper (A4, Letter in the US and Canada) until the file's own
 * sizes are read. A locked file's password dialog opens over this, not over the picker.
 */
export function OpeningBody() {
  const paper = typeof navigator === "undefined" ? "a4" : defaultPaper(navigator.language);
  return (
    <div className="ed-opening__body" style={{ "--ed-paper": paper === "letter" ? "8.5 / 11" : "210 / 297" } as React.CSSProperties} data-testid="opening-placeholders">
      <span className="sr-only" role="progressbar" aria-label="Opening…" />
      <div className="ed-opening__strip" aria-hidden="true">
        <span className="ed-opening__thumb" />
        <span className="ed-opening__thumb" />
        <span className="ed-opening__thumb" />
      </div>
      <div className="ed-opening__canvas" aria-hidden="true">
        <span className="ed-opening__page" />
      </div>
    </div>
  );
}
