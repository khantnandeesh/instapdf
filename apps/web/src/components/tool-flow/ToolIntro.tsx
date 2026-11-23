import { forwardRef } from "react";

export const ToolIntro = forwardRef<HTMLHeadingElement, { title: string; summary: string }>(function ToolIntro({ title, summary }, ref) {
  return (
    <div className="pt-6 pb-4 sm:pt-8 sm:pb-6">
      <h1 ref={ref} tabIndex={-1} className="text-xl font-semibold tracking-tight outline-none sm:text-2xl">
        {title}
      </h1>
      <p className="mt-1 truncate text-fg-muted">{summary}</p>
    </div>
  );
});
