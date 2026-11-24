import { forwardRef } from "react";

/**
 * BerryPDF Tool page head: a centred page title (Fredoka 600, 36px). The muted subtitle is gone
 * (owner 2026-11-23: minimal text); the tool's summary is the page's meta description instead.
 * From 1024 px the head is exactly --ip-intro-h tall, so the workspace row below can fit the
 * first screen (--ip-work-h). Keep it to one line there.
 */
export const ToolIntro = forwardRef<HTMLHeadingElement, { title: string }>(function ToolIntro({ title }, ref) {
  return (
    <div className="mp-intro pt-(--space-5) pb-4 text-center lg:flex lg:h-(--ip-intro-h) lg:items-center lg:justify-center lg:py-0" data-testid="tool-intro">
      <h1 ref={ref} tabIndex={-1} className="text-page-title text-ink-black outline-none">
        {title}
      </h1>
    </div>
  );
});
