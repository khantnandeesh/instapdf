import type { Metadata } from "next";
import { Catalogue } from "@/components/catalogue/Catalogue";
import { siteCopy } from "@/components/site/copy";
import { Hero } from "@/components/site/Hero";
import { VineDivider } from "@/components/berry/Berry";

export const metadata: Metadata = {
  title: siteCopy.homeTitle,
  description: siteCopy.homeDescription,
};

/**
 * Home: hero and the tool catalogue (spec docs/specs/f2-home.md), on BerryPDF's Home template:
 * everything on grid paper (the only background): the hero with floating berries, a vine, then
 * the catalogue grouped under coloured eyebrows. Static.
 */
export default function Home() {
  return (
    <main id="main" tabIndex={-1} className="w-full outline-none">
      <Hero />
      {/* Sections change by spacing or one divider (BerryPDF): the vine, also used before the footer. */}
      <VineDivider />
      <Catalogue />
    </main>
  );
}
