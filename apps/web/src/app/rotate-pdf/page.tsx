import type { Metadata } from "next";
import { RecordVisit } from "@/components/catalogue/RecordVisit";
import { RotateTool } from "@/tools/rotate/RotateTool";
import { flowTool } from "@/tools/registry";

const tool = flowTool("rotate-pdf");

export const metadata: Metadata = {
  title: `${tool.flow.title} · BerryPDF`,
  description: `${tool.summary}. Runs in your browser; your files are never uploaded.`,
};

export default function RotatePdfPage() {
  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1280px] px-4 pb-12 outline-none sm:px-6 lg:px-8">
      <RecordVisit slug={tool.slug} />
      <RotateTool />
    </main>
  );
}
