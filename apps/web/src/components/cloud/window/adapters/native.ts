/**
 * Google's own documents (Docs, Sheets, Slides) have no file to download: Drive exports them as a
 * PDF (files.export, AC-141). Offered only where the tool takes PDFs. Drive refuses an export over
 * its size limit (10 MB) with a 403 whose reason is `exportSizeLimitExceeded`, which the window
 * reports by name ("export"); any other refusal is a plain "can't open".
 */
export const GOOGLE_NATIVE: Record<string, string> = {
  "application/vnd.google-apps.document": "Google Docs",
  "application/vnd.google-apps.spreadsheet": "Google Sheets",
  "application/vnd.google-apps.presentation": "Google Slides",
};

export const isNative = (mime: string | undefined) => !!mime && mime in GOOGLE_NATIVE;

/** The native types the picker may show for a tool accepting `accept` (lower-case extensions). */
export const nativeMimes = (accept: readonly string[]) => (accept.includes(".pdf") ? Object.keys(GOOGLE_NATIVE) : []);

/** "Plan" arrives as "Plan.pdf". */
export const exportName = (name: string) => (name.toLowerCase().endsWith(".pdf") ? name : `${name}.pdf`);

/** Drive v3 export as PDF (connect-src already allows /drive/v3/files/). */
export const exportUrl = (id: string) => `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}/export?mimeType=application%2Fpdf`;
