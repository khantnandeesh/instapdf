import type { Metadata } from "next";
import localFont from "next/font/local";
import { BerrySprite, VineDivider } from "@/components/berry/Berry";
import { ToolIndexProvider } from "@/components/catalogue/ToolIndexProvider";
import { buildToolIndex } from "@/components/catalogue/toolIndex";
import { siteCopy } from "@/components/site/copy";
import { RecentPrepaintScript } from "@/components/site/RecentPrepaintScript";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SkipLink } from "@/components/site/SkipLink";
import "./globals.css";

/**
 * Fredoka (BerryPDF's one family), latin subset, weights 400, 500, 600 and 700, self-hosted from
 * @fontsource/fredoka (SIL OFL 1.1, see THIRD-PARTY-NOTICES.md). No request leaves our origin.
 * Falls back to the system stack, metric-adjusted so the swap does not shift.
 */
const fredoka = localFont({
  src: [
    { path: "../../node_modules/@fontsource/fredoka/files/fredoka-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../node_modules/@fontsource/fredoka/files/fredoka-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../../node_modules/@fontsource/fredoka/files/fredoka-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../../node_modules/@fontsource/fredoka/files/fredoka-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-fredoka",
  display: "swap",
  preload: true,
  adjustFontFallback: "Arial",
  fallback: ["system-ui", "sans-serif"],
});

export const metadata: Metadata = {
  title: siteCopy.homeTitle,
  description: siteCopy.homeDescription,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // The pre-paint script may add data-recent to <html> before hydration.
    <html lang="en" className={fredoka.variable} suppressHydrationWarning>
      <head>
        <RecentPrepaintScript />
      </head>
      <body className="flex min-h-dvh flex-col antialiased">
        <BerrySprite />
        <SkipLink />
        <ToolIndexProvider index={buildToolIndex()}>
          <SiteHeader />
          <div className="flex-1">{children}</div>
          {/* BerryPDF: the footer is introduced by the vine divider. */}
          <VineDivider className="mt-(--space-7)" />
          <SiteFooter />
        </ToolIndexProvider>
      </body>
    </html>
  );
}
