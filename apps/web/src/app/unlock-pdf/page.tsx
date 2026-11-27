import type { Metadata } from "next";
import { RecordVisit } from "@/components/catalogue/RecordVisit";
import { CloudSprite } from "@/components/cloud/marks";
import { ToolSeo } from "@/components/seo/ToolSeo";
import { toolMetadata } from "@/lib/seo/metadata";
import { UnlockTool } from "@/tools/unlock/UnlockTool";
import { flowTool } from "@/tools/registry";

const tool = flowTool("unlock-pdf");

export const metadata: Metadata = toolMetadata(tool);

export default function UnlockPage() {
  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1280px] px-4 pb-12 outline-none sm:px-6 lg:px-8">
      <RecordVisit slug={tool.slug} />
      {/* F23: the provider marks the cloud controls draw (markup only, no JavaScript). */}
      {process.env.NEXT_PUBLIC_CLOUD_SOURCES === "1" && <CloudSprite />}
      <div className="mp-toolstage">
        <UnlockTool />
      </div>
      <ToolSeo tool={tool} />
    </main>
  );
}
