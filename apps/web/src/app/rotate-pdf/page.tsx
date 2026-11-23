import type { Metadata } from "next";
import { SiteHeader } from "@/components/tool-flow/SiteHeader";
import { RotateTool } from "@/tools/rotate/RotateTool";
import { flowTool } from "@/tools/registry";

const tool = flowTool("rotate-pdf");

export const metadata: Metadata = {
  title: `${tool.flow.title} · InstaPDF`,
  description: `${tool.summary}. Runs in your browser; your files are never uploaded.`,
};

export default function RotatePdfPage() {
  return (
    <>
      <SiteHeader />
      <main
        id="main"
        className="mx-auto w-full max-w-[1280px] px-4 pb-[calc(var(--ip-dock-actual,var(--ip-dock-h))+env(safe-area-inset-bottom)+16px)] sm:px-6 sm:pb-[calc(var(--ip-dock-actual,var(--ip-dock-h-md))+env(safe-area-inset-bottom)+16px)] lg:px-8 lg:pb-12"
      >
        <RotateTool />
      </main>
    </>
  );
}
