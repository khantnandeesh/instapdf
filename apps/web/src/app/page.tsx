import type { Metadata } from "next";
import { Catalogue } from "@/components/catalogue/Catalogue";
import { siteCopy } from "@/components/site/copy";
import { Hero } from "@/components/site/Hero";

export const metadata: Metadata = {
  title: siteCopy.homeTitle,
  description: siteCopy.homeDescription,
};

/**
 * Home: hero and the tool catalogue (spec docs/specs/f2-home.md), on Mint Paper's Home template:
 * white hero, then the sand wash holding the whole catalogue. Static.
 */
export default function Home() {
  return (
    <main id="main" tabIndex={-1} className="w-full outline-none">
      <Hero />
      <Catalogue />
    </main>
  );
}
