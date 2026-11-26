import { forwardRef, type ReactNode } from "react";

/**
 * The tool page head (F25 §2, §3). Empty: the centred title (Fredoka 600, 36px), exactly --ip-intro-h tall
 * from 1024 px so the picker card below fits the first screen; the editor adds its "Beta" badge (`mark`).
 * Loaded (`row`): the same h1 element becomes the left end of the sticky top row (24px from 1024 px),
 * switching on the frame the pages arrive, without animation (motion.md T5); `children` (the dock) fill
 * the rest of the row. Below 1024 px the row holds only the h1 (22px, may wrap) and the dock is fixed to
 * the bottom. The h1 takes programmatic focus only (tabIndex -1).
 */
export const ToolIntro = forwardRef<HTMLHeadingElement, { title: string; mark?: ReactNode; row?: boolean; children?: ReactNode }>(function ToolIntro(
  { title, mark, row, children },
  ref,
) {
  return (
    <div
      className={row ? "ip-toolrow" : "mp-intro flex items-center justify-center gap-3 pt-(--space-5) pb-4 text-center lg:h-(--ip-intro-h) lg:py-0"}
      data-testid="tool-intro"
    >
      <h1 ref={ref} tabIndex={-1} className={row ? "ip-toolrow__h1" : "text-page-title text-ink-black outline-none"}>
        {title}
      </h1>
      {mark}
      {children}
    </div>
  );
});
