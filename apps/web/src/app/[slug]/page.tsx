import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ComingSoonPage } from "@/components/site/pages";
import { toolMetadata } from "@/lib/seo/metadata";
import { toolBySlug, tools } from "@/tools/registry";

/** Coming-soon pages for planned tools. Usable tools have their own route; anything else is a 404. */
export const dynamicParams = false;

export function generateStaticParams() {
  return tools.filter((t) => t.status === "planned").map((t) => ({ slug: t.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tool = toolBySlug((await params).slug);
  if (!tool) return { robots: { index: false } };
  return toolMetadata(tool);
}

export default async function PlannedToolPage({ params }: Props) {
  const tool = toolBySlug((await params).slug);
  if (!tool || tool.status !== "planned") notFound();
  return <ComingSoonPage tool={tool} />;
}
