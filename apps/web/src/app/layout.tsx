import type { Metadata } from "next";
import localFont from "next/font/local";
import { ToolIndexProvider } from "@/components/catalogue/ToolIndexProvider";
import { buildToolIndex } from "@/components/catalogue/toolIndex";
import { siteCopy } from "@/components/site/copy";
import { RecentPrepaintScript } from "@/components/site/RecentPrepaintScript";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SkipLink } from "@/components/site/SkipLink";
import "./globals.css";

/**
 * Inter (variable, latin subset), self-hosted from @fontsource-variable/inter (SIL OFL 1.1, see
 * THIRD-PARTY-NOTICES.md). One file covers every weight, so only it is preloaded; no runtime
 * request leaves our origin. Falls back to the system stack, metric-adjusted so the swap does not shift.
 */
const inter = localFont({
  src: "../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
  variable: "--font-inter",
  weight: "100 900",
  style: "normal",
  display: "swap",
  preload: true,
  adjustFontFallback: "Arial",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
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
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <RecentPrepaintScript />
      </head>
      <body className="flex min-h-dvh flex-col antialiased">
        <SkipLink />
        <ToolIndexProvider index={buildToolIndex()}>
          <SiteHeader />
          <div className="flex-1">{children}</div>
          <SiteFooter />
        </ToolIndexProvider>
      </body>
    </html>
  );
}
