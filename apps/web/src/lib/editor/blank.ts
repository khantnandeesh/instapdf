/** "Blank page" (U-E2): a one-page PDF written by hand (no library), A4 or US Letter. Pure, unit tested. */

export const PAPER = { a4: [595.28, 841.89], letter: [612, 792] } as const;
export type Paper = keyof typeof PAPER;

/** Letter where the browser's region is the US or Canada, A4 elsewhere. */
export function defaultPaper(locale: string | undefined): Paper {
  return /-(US|CA)\b/i.test(locale ?? "") ? "letter" : "a4";
}

export function blankPdf(paper: Paper = "a4"): Uint8Array {
  const [w, h] = PAPER[paper];
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << >> /Contents 4 0 R >>`,
    "<< /Length 0 >>\nstream\n\nendstream",
    "<< /Producer (BerryPDF) >>",
  ];
  let out = "%PDF-1.7\n%âãÏÓ\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  // Latin-1: every character is one byte, so the offsets above are byte offsets.
  return Uint8Array.from(out, (c) => c.charCodeAt(0));
}
