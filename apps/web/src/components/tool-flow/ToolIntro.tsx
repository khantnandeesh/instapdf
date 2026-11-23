import { forwardRef } from "react";

/** BerryPDF Tool page head: a centred page title (Fredoka 600, 36px) and a muted subtitle. */
export const ToolIntro = forwardRef<HTMLHeadingElement, { title: string; summary: string }>(function ToolIntro({ title, summary }, ref) {
  return (
    <div className="pt-(--space-6) pb-(--space-6) text-center sm:pt-(--space-7)">
      <h1 ref={ref} tabIndex={-1} className="text-page-title text-ink-black outline-none">
        {title}
      </h1>
      <p className="mt-2.5 truncate text-subtitle text-muted">{summary}</p>
    </div>
  );
});
