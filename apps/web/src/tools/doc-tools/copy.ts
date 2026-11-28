import { formatCount as n } from "@/components/page-select/copy";
import type { AnnotationKind } from "@/lib/pdf/annotations";

const pages = (k: number) => `${n(k)} ${k === 1 ? "page" : "pages"}`;

/** The groups a reader switches on and off, and the kinds each stands for (spec F10 §1). */
export const ANNOTATION_GROUPS: { id: string; label: string; kinds: AnnotationKind[] }[] = [
  { id: "marks", label: "Highlights and underlines", kinds: ["highlight", "underline", "strikeout"] },
  { id: "drawings", label: "Drawings and shapes", kinds: ["drawing", "shape"] },
  { id: "notes", label: "Notes and text boxes", kinds: ["note", "text"] },
  { id: "stamps", label: "Stamps and attachments", kinds: ["stamp", "attachment", "other"] },
  { id: "links", label: "Links", kinds: ["link"] },
];

/** Remove annotations copy (spec F10 §1). */
export const annotationsCopy = {
  step: "Remove",
  gridHint: "Click pages to clean only those. With none picked, every page is cleaned.",
  primary: (k: number) => `Clean ${pages(k)}`,
  needs: "Switch on something to remove",
  note: "Form fields stay as they are.",
};

/** Flatten copy (spec F10 §2). */
export const flattenCopy = {
  step: "Flatten",
  what: "What to flatten",
  both: "Form fields and annotations",
  fields: "Form fields only",
  note: { both: "Filled-in fields, highlights, notes and stamps become part of the page. Text stays selectable.", fields: "Fields keep what they show and can no longer be filled in. Annotations stay as they are." },
};

/** Metadata copy (spec F10 §3). */
export const metadataCopy = {
  step: "Details",
  mode: "What to do",
  edit: "Edit",
  remove: "Remove all",
  fields: { Title: "Title", Author: "Author", Subject: "Subject", Keywords: "Keywords", Creator: "Made with", Producer: "PDF made by" } as Record<string, string>,
  removeNote: "Title, author, keywords, dates and every other detail are taken out of the file.",
  add: "Add a field",
  name: "Field name",
  value: "Value",
  removeField: (name: string) => `Remove ${name}`,
  many: "The same details are written to every file.",
  errors: { empty: "Name the field", characters: "This field name is too long", reserved: "This name is kept for the file's dates", taken: "There is already a field with this name" },
};
