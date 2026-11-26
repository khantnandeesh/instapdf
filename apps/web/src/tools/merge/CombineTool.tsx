"use client";
import { fullHistory } from "./full-history";
import { MergeTool } from "./MergeTool";

/** Combine & reorder (spec F4/F5 §3f): Merge on its own route, with full undo / redo (I-10). */
export function CombineTool() {
  return <MergeTool slug="combine-reorder-pdf" history={fullHistory} />;
}
