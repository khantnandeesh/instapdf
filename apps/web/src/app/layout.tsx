import type { Metadata } from "next";
import { ToolIndexProvider } from "@/components/catalogue/ToolIndexProvider";
import { buildToolIndex } from "@/components/catalogue/toolIndex";
import { siteCopy } from "@/components/site/copy";
import { RecentPrepaintScript } from "@/components/site/RecentPrepaintScript";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SkipLink } from "@/components/site/SkipLink";
import "./globals.css";

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
    <html lang="en" suppressHydrationWarning>
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
