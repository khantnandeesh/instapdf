import { siteCopy } from "./copy";

/** First Tab stop on every page; moves focus to <main id="main" tabIndex={-1}> (AC-58). */
export function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only z-[60] rounded-md bg-surface-raised px-3 py-2 text-sm font-medium shadow-md focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
    >
      {siteCopy.skip}
    </a>
  );
}
