import Link from "next/link";

/** Minimal site header for tool routes (F2 owns the full header). */
export function SiteHeader() {
  return (
    <>
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-surface-raised px-3 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to main content
      </a>
      <header className="sticky top-0 z-20 h-(--ip-header-h) border-b border-border bg-bg">
        <div className="mx-auto flex h-full max-w-[1280px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="rounded-sm text-lg font-semibold tracking-tight">
            Insta<span className="text-primary">PDF</span>
          </Link>
          <Link href="/" className="rounded-sm px-2 py-3 text-sm font-medium text-fg-muted hover:text-fg">
            All tools
          </Link>
        </div>
      </header>
    </>
  );
}
