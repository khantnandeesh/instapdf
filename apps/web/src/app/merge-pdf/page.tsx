import type { Metadata } from "next";
import { RecordVisit } from "@/components/catalogue/RecordVisit";
import { ToolSeo } from "@/components/seo/ToolSeo";
import { toolMetadata } from "@/lib/seo/metadata";
import { MergeTool } from "@/tools/merge/MergeTool";
import { flowTool } from "@/tools/registry";

const tool = flowTool("merge-pdf");

export const metadata: Metadata = toolMetadata(tool);

export default function MergePdfPage() {
  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1280px] px-4 pb-12 outline-none sm:px-6 lg:px-8">
      <RecordVisit slug={tool.slug} />
      <div className="mp-toolstage">
        <MergeTool />
      </div>
      <ToolSeo tool={tool} />
    </main>
  );
}
