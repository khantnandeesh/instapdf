import type { Metadata } from "next";
import { CloudSprite } from "@/components/cloud/marks";
import { pageMetadata } from "@/lib/seo/metadata";
import { SITE_NAME } from "@/lib/seo/site";
import { EditorTool } from "@/tools/editor/EditorTool";

/**
 * Edit PDF, beta (F16 E1): add text, signatures, marks, drawings, shapes, images and whiteout, and
 * change existing lines. Noindex and not in the registry or the
 * sitemap until the full editor (registry slug "pdf-editor") ships; the F2 catalogue still lists
 * that tool as planned.
 */
export const metadata: Metadata = pageMetadata({
  path: "/edit-pdf",
  title: `Edit PDF (beta) | ${SITE_NAME}`,
  description: "Add text, sign, highlight, draw and change the existing text in a PDF, right in your browser. Nothing is uploaded.",
  noindex: true,
});

export default function EditPdfPage() {
  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1280px] px-4 pb-12 outline-none sm:px-6 lg:px-8">
      {/* F23 (E6): the provider marks the landing's cloud row and menu draw from (markup only). */}
      {process.env.NEXT_PUBLIC_CLOUD_SOURCES === "1" && <CloudSprite />}
      <div className="mp-toolstage">
        <EditorTool />
      </div>
    </main>
  );
}
