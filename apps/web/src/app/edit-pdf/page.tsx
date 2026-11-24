import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo/metadata";
import { SITE_NAME } from "@/lib/seo/site";
import { EditorBeta } from "@/tools/editor/EditorBeta";

/**
 * Edit PDF, beta (F16): existing-text editing on staging. Noindex and not in the registry or the
 * sitemap until the full editor (registry slug "pdf-editor") ships; the F2 catalogue still lists
 * that tool as planned.
 */
export const metadata: Metadata = pageMetadata({
  path: "/edit-pdf",
  title: `Edit PDF (beta) | ${SITE_NAME}`,
  description: "Change the existing text in a PDF, right in your browser. Nothing is uploaded.",
  noindex: true,
});

export default function EditPdfPage() {
  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1280px] px-4 pb-12 outline-none sm:px-6 lg:px-8">
      <div className="mp-toolstage">
        <EditorBeta />
      </div>
    </main>
  );
}
