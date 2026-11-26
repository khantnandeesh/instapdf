import type { Metadata } from "next";
import { SettingsFixture } from "@/tools/test-fixture/SettingsFixture";

/** Test-only (F25 AC-623): served only with IP_TEST_FIXTURES=1 (middleware.ts), never indexed. */
export const metadata: Metadata = { title: "Settings layout fixture", robots: { index: false, follow: false } };

export default function SettingsFixturePage() {
  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1280px] px-4 pb-12 outline-none sm:px-6 lg:px-8">
      <div className="mp-toolstage">
        <SettingsFixture />
      </div>
    </main>
  );
}
