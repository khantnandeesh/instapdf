/**
 * Runs `go` once, at the first sign that the visitor is about to use the page (a pointer, key,
 * focus or drag anywhere, captured on window) or after `ms`, whichever comes first. Used to fetch
 * the parts a tool needs only once a file is in: the file chooser or the drag hides their load,
 * and a phone that just opened the page doesn't fetch them with it (the SEO checklist's phone JS
 * budget). Returns a cleanup that cancels it. With `ms` 0 there is no timer: real intent only (pdf.js's
 * workers, eval G-8).
 */
export const INTENT_EVENTS = ["pointerdown", "keydown", "focusin", "dragenter"] as const;

export function onIntent(go: () => void, ms = 4000): () => void {
  let done = false;
  const fire = () => {
    if (done) return;
    stop();
    go();
  };
  const t = ms ? setTimeout(fire, ms) : 0;
  function stop() {
    done = true;
    clearTimeout(t);
    for (const e of INTENT_EVENTS) window.removeEventListener(e, fire, true);
  }
  for (const e of INTENT_EVENTS) window.addEventListener(e, fire, true);
  return stop;
}
