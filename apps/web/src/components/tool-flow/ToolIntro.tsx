import { forwardRef } from "react";

/**
 * BerryPDF Tool page head: a centred page title (Fredoka 600, 36px). The muted subtitle is gone
 * (owner 2026-11-23: minimal text); the tool's summary is the page's meta description instead.
 */
export const ToolIntro = forwardRef<HTMLHeadingElement, { title: string }>(function ToolIntro({ title }, ref) {
  return (
    <div className="mp-intro pt-(--space-6) pb-(--space-5) text-center sm:pt-(--space-7)">
      <h1 ref={ref} tabIndex={-1} className="text-page-title text-ink-black outline-none">
        {title}
      </h1>
    </div>
  );
});
