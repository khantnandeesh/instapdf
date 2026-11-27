"use client";
/**
 * pdf.js worker warm-up, kept out of lib/pdf/pdfjs so routes that never render pages don't carry it. Used
 * by Edit PDF's idle prefetch (tools/editor/EditorTool, which checks Data Saver itself) and, through
 * ./pdfjs-warm-intent, by the page tools on a real sign of intent (eval G-8).
 * Fetches pdf.js's two workers into the HTTP cache at the given priority, so the first page after
 * a pick needs no download. pdf.js itself is not loaded here: its chunk is fetched without being
 * evaluated elsewhere, since evaluating it is a long main-thread task (left to intent or the pick).
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
