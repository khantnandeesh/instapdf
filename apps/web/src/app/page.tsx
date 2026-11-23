import type { Metadata } from "next";
import { Catalogue } from "@/components/catalogue/Catalogue";
import { siteCopy } from "@/components/site/copy";
import { Hero } from "@/components/site/Hero";

export const metadata: Metadata = {
  title: siteCopy.homeTitle,
  description: siteCopy.homeDescription,
};

/** Home: hero and the tool catalogue (spec docs/specs/f2-home.md). Static. */
export default function Home() {
  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1280px] px-4 outline-none sm:px-6 lg:px-8">
      <Hero />
      <Catalogue />
    </main>
  );
}
