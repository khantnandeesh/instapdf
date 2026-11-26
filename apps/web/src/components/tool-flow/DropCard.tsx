import type { ReactNode } from "react";
import { Floaties, Sticker } from "../berry/Berry";

/**
 * Empty state, before any file: BerryPDF's floating-berry EmptyState on the grid paper (the only
 * background). Small pale berries and blossoms float at different depths around a white
 * leaf-cornered card (white surfaces stay solid, so the grid never runs behind the words) that
 * holds only the large upload button and two or three short muted lines (drop hint, limits, privacy).
 * The card pops in, then its outline breathes gently (mp-dropcard) to invite a drop.
 * From 1024 px the area is exactly as tall as the options panel (--ip-work-h), so the first
 * screen holds both and ends inside the viewport. The whole page stays the drop target. The decoration is aria-hidden, ignores the pointer and
 * never takes focus.
 */
export function DropCard({ children, fill = "work" }: { children: ReactNode; fill?: "work" | "pages" }) {
  return (
    <div
      // "pages": no side panel (ToolFlow emptyLayout="bar"), so the card fills the pages slot above the bar.
      className={`mp-empty grid min-h-[300px] place-items-center px-[15px] py-10 ${fill === "pages" ? "lg:h-(--ip-pages-h)" : "lg:h-(--ip-work-h)"} lg:min-h-0 lg:py-6`}
      data-testid="drop-card"
    >
      <Floaties set="empty" />
      <div className="mp-empty__in mp-dropcard relative w-full max-w-[440px] rounded-[16px_16px_28px_16px] border-[1.5px] border-sand bg-surface-raised px-6 pt-9 pb-8 shadow-card">
        <Sticker kind="blossom" size={34} className="mp-sticker--tilt-r absolute -top-4 -right-3" />
        <div className="flex flex-col items-center gap-3">{children}</div>
      </div>
    </div>
  );
}
