"use client";
/**
 * Editor-only warm-up, kept out of lib/pdf/pdfjs so the other tools' routes don't carry it.
 * Fetches pdf.js's two workers into the HTTP cache at the given priority, so the first page after
 * a pick needs no download. pdf.js itself is not loaded here: tools/editor/idle-prefetch loads its
 * chunk without evaluating it, since evaluating it is a long main-thread task (left to intent or the pick).
 * Resolves when both are in (or failed: the pick fetches them).
 */
import { workerUrls } from "./pdfjs";

let warm: Promise<void> | null = null;

export function warmPdfjs(priority: "low" | "high" = "low"): Promise<void> {
  warm ??= Promise.all(
    workerUrls().map((url) =>
      fetch(url, { priority } as RequestInit)
        .then((r) => r.arrayBuffer())
        .then(() => {}),
    ),
  ).then(
    () => {},
    () => void (warm = null),
  );
  return warm;
}
