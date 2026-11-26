import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CloudWindow } from "@/components/cloud/window/CloudWindow";
import { cloudRoutes, isProvider, isRoute, providerName } from "@/lib/cloud/providers";
import { tools } from "@/tools/registry";
import { EDITOR_TITLE } from "@/tools/editor/limits";

/**
 * F23: the /cloud/<provider> window (spec D-3). Prerendered for the providers this build has
 * (so the CSP manifest hashes its inline scripts); everything else is a 404. Its own CSP and COOP
 * come from src/middleware.ts and next.config.ts. Never indexed.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return cloudRoutes().map((provider) => ({ provider }));
}

export async function generateMetadata({ params }: { params: Promise<{ provider: string }> }): Promise<Metadata> {
  const { provider } = await params;
  return {
    title: { absolute: isProvider(provider) ? `${providerName[provider]} · BerryPDF` : "BerryPDF" },
    robots: { index: false, follow: false },
  };
}

export default async function CloudPage({ params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!isRoute(provider) || !cloudRoutes().includes(provider)) notFound();
  // The window shows "Added to <tool>" from its URL: only these titles are accepted (never free text).
  // The editor's landing (F23 E6) is not on the shared flow: its title is added by name.
  const toolTitles = [...tools.flatMap((t) => (t.flow ? [t.flow.title] : [])), EDITOR_TITLE];
  return <CloudWindow route={provider} toolTitles={toolTitles} />;
}
