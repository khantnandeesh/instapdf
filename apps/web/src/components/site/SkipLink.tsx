import { siteCopy } from "./copy";

/** First Tab stop on every page; moves focus to <main id="main" tabIndex={-1}> (AC-58). */
export function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only z-[60] rounded-sm bg-surface-raised px-3 py-2 text-nav text-ink-black shadow-menu focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
    >
      {siteCopy.skip}
    </a>
  );
}
