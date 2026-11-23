import { forwardRef } from "react";

/**
 * Mint Paper Tool page head: centered page-title and a grey subtitle.
 * Deviation: the subtitle is muted (#666, 5.74:1), not subtle (#9aa5aa, 2.52:1 fails even at 26px).
 */
export const ToolIntro = forwardRef<HTMLHeadingElement, { title: string; summary: string }>(function ToolIntro({ title, summary }, ref) {
  return (
    <div className="pt-(--space-6) pb-(--space-6) text-center sm:pt-(--space-7)">
      <h1 ref={ref} tabIndex={-1} className="text-page-title text-ink outline-none">
        {title}
      </h1>
      <p className="mt-2.5 truncate text-subtitle text-muted">{summary}</p>
    </div>
  );
});
