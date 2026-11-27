import { cx } from "@/components/ui/cx";
import { PlusIcon } from "@/components/ui/icons";

/**
 * The one "add at the end" tile of every page and file grid (Merge, Organize, Combine & reorder, Alternate & mix).
 * It takes the page box of the tiles beside it (`ip-tile__box`: the same width and page aspect), so its top and
 * bottom line up with the pages instead of ending as a shorter square. `fill` stretches it to the height of
 * the row instead (Alternate's file cards, which are wider than a page).
 */
export const addTileClass = (fill = false) =>
  cx(
    fill ? "h-full min-h-[120px] w-full sm:min-h-[200px]" : "ip-tile__box",
    "group/add grid place-items-center rounded-tray border-2 border-dashed border-brand-tint-border bg-surface-raised/60 text-brand-strong",
    "transition-[background-color,border-color,transform] duration-(--dur-base) hover:-translate-y-0.5 hover:border-brand hover:bg-brand-tint active:translate-y-0 disabled:opacity-50",
  );

/** The tile's face: a berry disc with a plus (it turns on hover and keyboard focus) over the label. */
export function AddTileFace({ label }: { label: string }) {
  return (
    <span className="flex flex-col items-center gap-1.5 font-display text-[15px] font-semibold">
      <span className="grid size-11 place-items-center rounded-full bg-brand text-white shadow-menu transition-transform duration-(--dur-base) group-hover/add:rotate-90 group-focus-visible/add:rotate-90 motion-reduce:rotate-0">
        <PlusIcon size={20} />
      </span>
      {label}
    </span>
  );
}
