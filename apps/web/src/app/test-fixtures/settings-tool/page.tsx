import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SettingsFixture } from "@/tools/test-fixture/SettingsFixture";

/**
 * Test-only (F25 AC-623), never indexed. Two gates: the middleware answers 404 unless the server runs
 * with IP_TEST_FIXTURES=1, and the deployed image (built with IP_DEPLOY_BUILD=1, see the Dockerfile)
 * builds this route as a 404. The page stays static, so the strict CSP's script hashes still apply.
 */
export const metadata: Metadata = { title: "Settings layout fixture", robots: { index: false, follow: false } };

export default function SettingsFixturePage() {
  if (process.env.IP_DEPLOY_BUILD === "1") notFound();
  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1280px] px-4 pb-12 outline-none sm:px-6 lg:px-8">
      <div className="mp-toolstage">
        <SettingsFixture />
      </div>
    </main>
  );
}
