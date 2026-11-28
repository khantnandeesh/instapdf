/**
 * Flatten (spec F10): makes what sits on top of the pages part of the pages. Form fields are drawn
 * with the values they show and stop being fillable; highlights, notes, drawings and stamps are
 * drawn in place and can no longer be moved or removed. Text stays text. (Turning whole pages into
 * pictures is a later mode.) Links, attached files and redaction marks stay as they are.
 */
import { PDFName } from "@cantoo/pdf-lib";
import { flattenAnnotations } from "./annotations";
import { flattenFields, removeWidgets } from "./forms";
import { loadForEdit } from "./rotate";

export type FlattenInput = { bytes: Uint8Array; password?: string; /** Also draw annotations in (fields are always drawn). */ annotations: boolean };

export async function flattenPdf({ bytes, password, annotations }: FlattenInput, onProgress?: (fraction: number) => void): Promise<{ bytes: Uint8Array; pageCount: number; wasEncrypted: boolean; warnings?: string[]; fields: number; drawn: number }> {
  const { doc, wasEncrypted } = await loadForEdit(bytes, password);
  const warnings: string[] = [];
  let fields = 0;
  if (doc.catalog.has(PDFName.of("AcroForm"))) {
    let kept: string[] = [];
    try {
      const form = doc.getForm();
      const all = form.getFields();
      fields = all.length;
      // A signature that is flattened keeps its look but can no longer be checked: say so.
      if (all.some((f) => f.acroField.dict.lookup(PDFName.of("FT")) === PDFName.of("Sig") && f.acroField.dict.has(PDFName.of("V")))) warnings.push("This file was signed. The signature still shows, but it can no longer be verified.");
      kept = flattenFields(doc);
    } catch {
      kept = ["?"];
    }
    fields -= Math.min(fields, kept.length);
    if (kept.length) warnings.push(kept.length === 1 ? "One form field could not be drawn into the page, so it stays fillable." : `${kept.length} form fields could not be drawn into the page, so they stay fillable.`);
    else {
      for (const page of doc.getPages()) removeWidgets(page);
      doc.catalog.delete(PDFName.of("AcroForm"));
    }
  }
  onProgress?.(0.4);
  const marks = annotations ? flattenAnnotations(doc) : { drawn: 0, kept: 0, dropped: 0 };
  if (marks.kept) warnings.push(marks.kept === 1 ? "One annotation has no drawn form in the file, so it stays an annotation." : `${marks.kept} annotations have no drawn form in the file, so they stay annotations.`);
  onProgress?.(0.6);
  const pageCount = doc.getPageCount();
  if (marks.dropped) warnings.push(marks.dropped === 1 ? "One hidden note or reply was removed without being drawn." : `${marks.dropped} hidden notes or replies were removed without being drawn.`);
  if (!fields && !marks.drawn && !warnings.length) warnings.push("Nothing to flatten was found: no form fields" + (annotations ? " or annotations." : "."));
  return { bytes: await doc.save(), pageCount, wasEncrypted, ...(warnings.length ? { warnings } : {}), fields, drawn: marks.drawn };
}
