import type { Metadata } from "next";
import { Catalogue } from "@/components/catalogue/Catalogue";
import { siteCopy } from "@/components/site/copy";
import { Hero } from "@/components/site/Hero";

export const metadata: Metadata = {
  title: siteCopy.homeTitle,
  description: siteCopy.homeDescription,
};

/**
 * Home: hero and the tool catalogue (spec docs/specs/f2-home.md), on BerryPDF's Home template:
 * everything on grid paper (the only background): the hero with floating berries, then (by spacing
 * only) the catalogue grouped under coloured eyebrows. Static.
 */
export default function Home() {
  return (
    <main id="main" tabIndex={-1} className="w-full outline-none">
      <Hero />
      <Catalogue />
    </main>
  );
}
