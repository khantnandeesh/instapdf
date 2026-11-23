import type { ReactNode } from "react";

/**
 * Empty state, Mint Paper Tool page: a pale grey band holding only the large upload button and
 * a few lines of small muted reassurance (privacy, limits). The whole page is the drop target.
 */
export function DropCard({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-[280px] place-items-center bg-band px-[15px] py-[50px] text-center lg:min-h-[420px]">
      <div className="flex max-w-md flex-col items-center gap-3">{children}</div>
    </div>
  );
}
