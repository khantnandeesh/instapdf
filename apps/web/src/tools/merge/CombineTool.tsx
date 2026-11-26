"use client";
import { MergeTool } from "./MergeTool";

/** Combine & reorder (spec F4/F5 §3f): Merge on its own route, opening in the pages view. */
export function CombineTool() {
  return <MergeTool slug="combine-reorder-pdf" />;
}
