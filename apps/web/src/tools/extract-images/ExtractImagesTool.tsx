"use client";
import { flowTool } from "@/tools/registry";
import { PickPagesFlow } from "@/tools/to-image/PickPagesFlow";

const tool = flowTool("extract-images");

/** Extract images (spec F12 §5): the pictures embedded in the picked pages, or in all of them. No options. */
export function ExtractImagesTool() {
  return (
    <PickPagesFlow
      tool={tool}
      verb="searched"
      gridHint="Click pages to take the images of only those. With none picked, every page is searched."
      run={async (sources, signal, onProgress) => (await import("@/lib/pdf/embedded-images")).extractImages(sources, signal, onProgress)}
    />
  );
}
