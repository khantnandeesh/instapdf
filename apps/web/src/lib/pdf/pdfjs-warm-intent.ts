"use client";
/**
 * The page tools' warm-up of pdf.js's workers (components/tool-flow/ToolFlow, on a real sign of intent
 * only, eval G-8): the same fetch as ./pdfjs-warm, but not when the visitor asked to save data (Data
 * Saver) or is on 2g; then the pick fetches them. Lazy, so the check stays out of the tools' first load.
 */
import { earlyFetchAllowed } from "@/lib/editor/engine-load";
import { warmPdfjs as warmNow } from "./pdfjs-warm";

export function warmPdfjs(): Promise<void> {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return earlyFetchAllowed(conn) ? warmNow("low") : Promise.resolve();
}
