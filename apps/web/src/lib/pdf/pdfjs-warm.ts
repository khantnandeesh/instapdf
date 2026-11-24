"use client";
/**
 * Editor-only warm-up, kept out of lib/pdf/pdfjs so the other tools' routes don't carry it.
 * Loads pdf.js and fetches its two workers into the HTTP cache at the given priority, so the first
 * page after a pick needs no download. Resolves when all are in (or failed: the pick fetches them).
 */
import { loadPdfjs, workerUrls } from "./pdfjs";

let warm: Promise<void> | null = null;

export function warmPdfjs(priority: "low" | "high" = "low"): Promise<void> {
  warm ??= Promise.all([
    loadPdfjs().then(() => {}),
    ...workerUrls().map((url) =>
      fetch(url, { priority } as RequestInit)
        .then((r) => r.arrayBuffer())
        .then(() => {}),
    ),
  ]).then(
    () => {},
    () => void (warm = null),
  );
  return warm;
}
